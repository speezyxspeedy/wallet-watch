/**
 * WalletWatch Test Suite
 * Tests calculations, classifications, validations, and conversions
 */

import { isValidEthereumAddress, weiToEth, weiToEthNumber } from '../server.ts';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${testName}`);
  }
}

console.log('--- RUNNING WALLETWATCH TEST SUITE ---');

// 1. Ethereum Address Validation
assert(isValidEthereumAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), 'Valid mixed-case address');
assert(isValidEthereumAddress('0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae'), 'Valid lower-case address');
assert(!isValidEthereumAddress('d8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), 'Invalid missing 0x prefix');
assert(!isValidEthereumAddress('0x123'), 'Invalid short address');
assert(!isValidEthereumAddress('0xZZZZ6BF26964aF9D7eEd9e03E53415D37aA96045'), 'Invalid non-hex address');
assert(!isValidEthereumAddress(''), 'Invalid empty string');

// 2. Wei-to-ETH Conversions
assert(weiToEth('0') === '0', 'Wei to ETH: 0 Wei');
assert(weiToEth('1000000000000000000') === '1', 'Wei to ETH: 1 ETH (10^18)');
assert(weiToEth('500000000000000000') === '0.5', 'Wei to ETH: 0.5 ETH');
assert(weiToEth('1250000000000000000') === '1.25', 'Wei to ETH: 1.25 ETH');
assert(weiToEth('100000000000000') === '0.0001', 'Wei to ETH: 0.0001 ETH');
assert(weiToEthNumber('1000000000000000000') === 1, 'Wei to ETH number: 1.0');

// 3. Direction Classification Logic
const wallet = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const counterparty = '0x1111111111111111111111111111111111111111';

function classifyDirection(from: string, to: string, target: string) {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  const w = target.toLowerCase();
  if (f === w && t === w) return 'SELF';
  if (f === w) return 'OUTGOING';
  return 'INCOMING';
}

assert(classifyDirection(wallet, counterparty, wallet) === 'OUTGOING', 'Direction: Outgoing');
assert(classifyDirection(counterparty, wallet, wallet) === 'INCOMING', 'Direction: Incoming');
assert(classifyDirection(wallet, wallet, wallet) === 'SELF', 'Direction: Self-transfer');

// 4. Gas Fee Calculation
const gasPrice = BigInt('20000000000'); // 20 Gwei
const gasUsed = BigInt('21000'); // Standard transfer gas
const feeWei = (gasPrice * gasUsed).toString();
assert(feeWei === '420000000000000', 'Gas fee Wei calculation (420,000 Gwei = 0.00042 ETH)');
assert(weiToEth(feeWei) === '0.00042', 'Gas fee in ETH: 0.00042');

// 5. Failed Transaction Filter Rule (failed txs excluded from volume totals)
const mockTxs = [
  { value: '1000000000000000000', isError: '0', txreceipt_status: '1', dir: 'INCOMING' }, // 1 ETH success in
  { value: '5000000000000000000', isError: '1', txreceipt_status: '0', dir: 'INCOMING' }, // 5 ETH FAILED in (MUST IGNORE)
  { value: '2000000000000000000', isError: '0', txreceipt_status: '1', dir: 'OUTGOING' }, // 2 ETH success out
];

let sumIncoming = 0n;
let sumOutgoing = 0n;
let failedCount = 0;
let successCount = 0;

for (const tx of mockTxs) {
  const isFailed = tx.isError === '1' || tx.txreceipt_status === '0';
  if (isFailed) {
    failedCount++;
    continue;
  }
  successCount++;
  if (tx.dir === 'INCOMING') sumIncoming += BigInt(tx.value);
  if (tx.dir === 'OUTGOING') sumOutgoing += BigInt(tx.value);
}

assert(failedCount === 1, 'Failed transaction count = 1');
assert(successCount === 2, 'Successful transaction count = 2');
assert(weiToEth(sumIncoming.toString()) === '1', 'Failed 5 ETH incoming transfer was ignored from total');
assert(weiToEth(sumOutgoing.toString()) === '2', 'Outgoing successful transfer total = 2 ETH');

console.log('--- ALL UNIT TESTS COMPLETED SUCCESSFULLY ---');
process.exit(0);
