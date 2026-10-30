/**
 * WalletWatch - Ethereum Wallet Activity Analyzer
 * Full-Stack Express Server with Etherscan API V2 Integration
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ETHERSCAN_V2_URL = 'https://api.etherscan.io/v2/api';
const ETHEREUM_MAINNET_CHAIN_ID = '1';

app.use(express.json());

// Helper: Validate Ethereum Address
export function isValidEthereumAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

// Helper: Convert Wei (string) to ETH (string with up to precision decimals)
export function weiToEth(weiStr: string, decimals: number = 6): string {
  if (!weiStr || weiStr === '0') return '0';
  try {
    const isNegative = weiStr.startsWith('-');
    const cleanWei = isNegative ? weiStr.slice(1) : weiStr;
    const weiBig = BigInt(cleanWei);
    const divisor = BigInt('1000000000000000000'); // 10^18
    const integerPart = weiBig / divisor;
    const remainder = weiBig % divisor;

    if (remainder === 0n) {
      return (isNegative ? '-' : '') + integerPart.toString();
    }

    let fractionStr = remainder.toString().padStart(18, '0');
    // Truncate to desired decimal places
    fractionStr = fractionStr.substring(0, decimals);
    // Remove trailing zeros
    fractionStr = fractionStr.replace(/0+$/, '');

    const prefix = isNegative ? '-' : '';
    return fractionStr.length > 0
      ? `${prefix}${integerPart}.${fractionStr}`
      : `${prefix}${integerPart}`;
  } catch (err) {
    console.error('Error converting wei to eth:', err);
    return '0';
  }
}

// Helper: Safe Float conversion for analytics totals
export function weiToEthNumber(weiStr: string): number {
  if (!weiStr || weiStr === '0') return 0;
  try {
    const weiBig = BigInt(weiStr);
    const divisor = BigInt('1000000000000000000');
    const integerPart = Number(weiBig / divisor);
    const remainder = Number(weiBig % divisor);
    return integerPart + remainder / 1e18;
  } catch {
    return 0;
  }
}

// Helper: Fetch with Timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WalletWatch/1.0',
      },
    });
    clearTimeout(id);
    return await response.json();
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Etherscan API request timed out after 10 seconds.');
    }
    throw err;
  }
}

// Get Etherscan API Key from Environment
function getApiKey(): string | null {
  let key = process.env.ETHERSCAN_API_KEY;
  if (!key || key.trim() === '' || key === 'your_api_key_here') {
    return null;
  }
  key = key.trim();
  if (key.startsWith('your_')) {
    key = key.substring(5).trim();
  }
  if (!key || key === 'api_key_here') return null;
  return key;
}

/**
 * Endpoint: GET /api/config
 * Returns current API configuration status (without exposing key)
 */
app.get('/api/config', (_req: Request, res: Response) => {
  const hasKey = getApiKey() !== null;
  res.json({
    hasApiKey: hasKey,
    network: 'Ethereum Mainnet',
    chainId: ETHEREUM_MAINNET_CHAIN_ID,
    provider: 'Etherscan API V2',
  });
});

/**
 * Endpoint: GET /api/wallet/:address
 * Fetches current ETH balance for the given address
 */
app.get('/api/wallet/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!isValidEthereumAddress(address)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ADDRESS',
      message: 'Invalid Ethereum address format. Address must be a 42-character hexadecimal string starting with 0x.',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API_KEY_MISSING',
      message: 'Etherscan API key is not configured. Please set ETHERSCAN_API_KEY in your .env file.',
    });
  }

  const cleanAddress = address.trim();
  const balanceUrl = `${ETHERSCAN_V2_URL}?chainid=${ETHEREUM_MAINNET_CHAIN_ID}&module=account&action=balance&address=${cleanAddress}&tag=latest&apikey=${apiKey}`;

  try {
    const data = await fetchWithTimeout(balanceUrl);

    if (data.status === '0') {
      if (data.result === 'Missing/Invalid API Key') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_API_KEY',
          message: 'The configured Etherscan API key is invalid or unauthorized.',
        });
      }
      return res.status(502).json({
        success: false,
        error: 'ETHERSCAN_ERROR',
        message: data.message || data.result || 'Failed to fetch wallet balance from Etherscan.',
      });
    }

    const balanceWei = data.result || '0';
    const balanceEth = weiToEth(balanceWei, 6);

    return res.json({
      success: true,
      address: cleanAddress,
      balanceWei,
      balanceEth,
      balanceEthFormatted: `${balanceEth} ETH`,
      etherscanUrl: `https://etherscan.io/address/${cleanAddress}`,
    });
  } catch (err: any) {
    console.error(`Error in /api/wallet/${cleanAddress}:`, err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'An error occurred while fetching wallet information.',
    });
  }
});

/**
 * Endpoint: GET /api/transactions/:address
 * Fetches normal transaction history and calculates comprehensive analytics
 */
app.get('/api/transactions/:address', async (req: Request, res: Response) => {
  const { address } = req.params;
  const page = parseInt(req.query.page as string, 10) || 1;
  const offset = Math.min(parseInt(req.query.offset as string, 10) || 20, 100);
  const sort = req.query.sort === 'asc' ? 'asc' : 'desc';

  if (!isValidEthereumAddress(address)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ADDRESS',
      message: 'Invalid Ethereum address format. Address must be a 42-character hexadecimal string starting with 0x.',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API_KEY_MISSING',
      message: 'Etherscan API key is not configured. Please set ETHERSCAN_API_KEY in your .env file.',
    });
  }

  const cleanAddress = address.trim().toLowerCase();
  const txUrl = `${ETHERSCAN_V2_URL}?chainid=${ETHEREUM_MAINNET_CHAIN_ID}&module=account&action=txlist&address=${cleanAddress}&startblock=0&endblock=99999999&page=${page}&offset=${offset}&sort=${sort}&apikey=${apiKey}`;

  try {
    const data = await fetchWithTimeout(txUrl);

    // Etherscan returns status: "0" with "No transactions found" if an address has 0 transactions
    if (data.status === '0') {
      const msg = (data.message || '').toLowerCase();
      const resMsg = typeof data.result === 'string' ? data.result.toLowerCase() : '';

      if (msg.includes('no transactions') || resMsg.includes('no transactions')) {
        return res.json({
          success: true,
          address: req.params.address.trim(),
          totalFetched: 0,
          summary: {
            incomingCount: 0,
            outgoingCount: 0,
            selfCount: 0,
            failedCount: 0,
            successfulCount: 0,
            totalIncomingEth: '0',
            totalOutgoingEth: '0',
            netEthFlow: '0',
            averageTxValueEth: '0',
            totalGasFeesEth: '0',
          },
          transactions: [],
        });
      }

      if (data.result === 'Missing/Invalid API Key') {
        return res.status(401).json({
          success: false,
          error: 'INVALID_API_KEY',
          message: 'The configured Etherscan API key is invalid or unauthorized.',
        });
      }

      return res.status(502).json({
        success: false,
        error: 'ETHERSCAN_ERROR',
        message: data.message || data.result || 'Failed to fetch transactions from Etherscan.',
      });
    }

    const rawTxs: any[] = Array.isArray(data.result) ? data.result : [];

    let incomingCount = 0;
    let outgoingCount = 0;
    let selfCount = 0;
    let failedCount = 0;
    let successfulCount = 0;

    let totalIncomingWei = 0n;
    let totalOutgoingWei = 0n;
    let totalGasFeesWei = 0n;
    let successfulTxValueSumWei = 0n;

    const normalizedTransactions = rawTxs.map((tx: any) => {
      const fromAddr = (tx.from || '').toLowerCase();
      const toAddr = (tx.to || '').toLowerCase();

      // Determine Direction
      let direction: 'INCOMING' | 'OUTGOING' | 'SELF' = 'INCOMING';
      if (fromAddr === cleanAddress && toAddr === cleanAddress) {
        direction = 'SELF';
      } else if (fromAddr === cleanAddress) {
        direction = 'OUTGOING';
      } else {
        direction = 'INCOMING';
      }

      // Check Status
      // isError: '0' = success, '1' = error
      // txreceipt_status: '1' = success, '0' = fail
      const isFailed = tx.isError === '1' || tx.txreceipt_status === '0';
      const status: 'SUCCESS' | 'FAILED' = isFailed ? 'FAILED' : 'SUCCESS';

      if (isFailed) {
        failedCount++;
      } else {
        successfulCount++;
      }

      if (direction === 'SELF') selfCount++;
      else if (direction === 'OUTGOING') outgoingCount++;
      else incomingCount++;

      const valueWei = tx.value || '0';
      const valueEth = weiToEth(valueWei, 6);

      // Gas Fee = gasPrice * gasUsed
      let feeWei = '0';
      let feeEth = '0';
      try {
        if (tx.gasPrice && tx.gasUsed) {
          const feeBig = BigInt(tx.gasPrice) * BigInt(tx.gasUsed);
          feeWei = feeBig.toString();
          feeEth = weiToEth(feeWei, 6);
          if (direction === 'OUTGOING' || direction === 'SELF') {
            totalGasFeesWei += feeBig;
          }
        }
      } catch (e) {
        // Fallback for gas calculation
      }

      // Rule: Ignore failed transactions when calculating successful transfer totals
      if (!isFailed) {
        try {
          const valBig = BigInt(valueWei);
          successfulTxValueSumWei += valBig;
          if (direction === 'INCOMING') {
            totalIncomingWei += valBig;
          } else if (direction === 'OUTGOING') {
            totalOutgoingWei += valBig;
          }
        } catch {
          // ignore parsing error
        }
      }

      // Format Date & Time
      const timeStampSec = parseInt(tx.timeStamp || '0', 10);
      const dateObj = new Date(timeStampSec * 1000);
      const dateTime = dateObj.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        valueWei,
        valueEth,
        feeWei,
        feeEth,
        gasPriceGwei: tx.gasPrice ? (Number(tx.gasPrice) / 1e9).toFixed(2) : null,
        blockNumber: parseInt(tx.blockNumber || '0', 10),
        timestamp: timeStampSec,
        dateTime,
        status,
        isError: isFailed,
        direction,
        etherscanUrl: `https://etherscan.io/tx/${tx.hash}`,
      };
    });

    const totalIncomingEth = weiToEth(totalIncomingWei.toString(), 6);
    const totalOutgoingEth = weiToEth(totalOutgoingWei.toString(), 6);
    const totalGasFeesEth = weiToEth(totalGasFeesWei.toString(), 6);

    // Net ETH flow = Incoming - Outgoing
    const netFlowBig = totalIncomingWei - totalOutgoingWei;
    const netEthFlow = weiToEth(netFlowBig.toString(), 6);

    // Average transaction value (for successful transactions)
    let avgTxValueEth = '0';
    if (successfulCount > 0) {
      const avgBig = successfulTxValueSumWei / BigInt(successfulCount);
      avgTxValueEth = weiToEth(avgBig.toString(), 6);
    }

    return res.json({
      success: true,
      address: req.params.address.trim(),
      totalFetched: normalizedTransactions.length,
      page,
      offset,
      summary: {
        incomingCount,
        outgoingCount,
        selfCount,
        failedCount,
        successfulCount,
        totalIncomingEth,
        totalOutgoingEth,
        netEthFlow: (netFlowBig > 0n ? '+' : '') + netEthFlow,
        averageTxValueEth: avgTxValueEth,
        totalGasFeesEth,
      },
      transactions: normalizedTransactions,
    });
  } catch (err: any) {
    console.error(`Error in /api/transactions/${cleanAddress}:`, err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'An error occurred while fetching transactions.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WalletWatch server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
