"""
WalletWatch — Ethereum Wallet Activity Analyzer
Flask Backend with Etherscan API V2 Integration
"""

import os
import re
from datetime import datetime, timezone
from decimal import Decimal, getcontext
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

# High precision for Wei calculations
getcontext().prec = 28

load_dotenv()

app = Flask(__name__)

ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api"
ETHEREUM_MAINNET_CHAIN_ID = "1"
REQUEST_TIMEOUT = 10  # seconds


def is_valid_ethereum_address(address: str) -> bool:
    """Validate 42-character hex Ethereum address format."""
    if not address or not isinstance(address, str):
        return False
    return bool(re.match(r"^0x[a-fA-F0-9]{40}$", address.strip()))


def wei_to_eth(wei_str: str, decimals: int = 6) -> str:
    """Accurately convert Wei string to ETH string."""
    if not wei_str or wei_str == "0":
        return "0"
    try:
        wei = Decimal(str(wei_str))
        eth = wei / Decimal("1000000000000000000")  # 10^18
        formatted = f"{eth:.{decimals}f}".rstrip("0").rstrip(".")
        return formatted if formatted else "0"
    except Exception:
        return "0"


def get_api_key() -> str | None:
    """Retrieve Etherscan API key from environment."""
    key = os.getenv("ETHERSCAN_API_KEY", "").strip()
    if not key or key == "your_api_key_here":
        return None
    if key.startswith("your_"):
        key = key[5:].strip()
    if not key or key == "api_key_here":
        return None
    return key


@app.route("/")
def index():
    """Serve the single-page application dashboard."""
    return render_template("index.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    """Return backend configuration status without leaking keys."""
    return jsonify({
        "hasApiKey": get_api_key() is not None,
        "network": "Ethereum Mainnet",
        "chainId": ETHEREUM_MAINNET_CHAIN_ID,
        "provider": "Etherscan API V2"
    })


@app.route("/api/wallet/<address>", methods=["GET"])
def get_wallet(address: str):
    """
    Fetch current ETH balance for a given Ethereum wallet.
    Validates address, queries Etherscan V2, and converts Wei to ETH.
    """
    if not is_valid_ethereum_address(address):
        return jsonify({
            "success": False,
            "error": "INVALID_ADDRESS",
            "message": "Invalid Ethereum address format. Address must be a 42-character hexadecimal string starting with 0x."
        }), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "success": False,
            "error": "API_KEY_MISSING",
            "message": "Etherscan API key is not configured. Please set ETHERSCAN_API_KEY in your .env file."
        }), 401

    clean_address = address.strip()
    params = {
        "chainid": ETHEREUM_MAINNET_CHAIN_ID,
        "module": "account",
        "action": "balance",
        "address": clean_address,
        "tag": "latest",
        "apikey": api_key
    }

    try:
        response = requests.get(ETHERSCAN_V2_URL, params=params, timeout=REQUEST_TIMEOUT)
        data = response.json()

        if data.get("status") == "0":
            res = data.get("result", "")
            if res == "Missing/Invalid API Key":
                return jsonify({
                    "success": False,
                    "error": "INVALID_API_KEY",
                    "message": "The configured Etherscan API key is invalid or unauthorized."
                }), 401
            return jsonify({
                "success": False,
                "error": "ETHERSCAN_ERROR",
                "message": data.get("message") or res or "Failed to fetch wallet balance from Etherscan."
            }), 502

        balance_wei = data.get("result", "0")
        balance_eth = wei_to_eth(balance_wei, 6)

        return jsonify({
            "success": True,
            "address": clean_address,
            "balanceWei": balance_wei,
            "balanceEth": balance_eth,
            "balanceEthFormatted": f"{balance_eth} ETH",
            "etherscanUrl": f"https://etherscan.io/address/{clean_address}"
        })

    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "TIMEOUT",
            "message": "Etherscan API request timed out after 10 seconds."
        }), 504
    except Exception as exc:
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": str(exc)
        }), 500


@app.route("/api/transactions/<address>", methods=["GET"])
def get_transactions(address: str):
    """
    Fetch the latest normal transactions and calculate transaction analytics.
    """
    if not is_valid_ethereum_address(address):
        return jsonify({
            "success": False,
            "error": "INVALID_ADDRESS",
            "message": "Invalid Ethereum address format. Address must be a 42-character hexadecimal string starting with 0x."
        }), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({
            "success": False,
            "error": "API_KEY_MISSING",
            "message": "Etherscan API key is not configured. Please set ETHERSCAN_API_KEY in your .env file."
        }), 401

    clean_address = address.strip().lower()
    page = request.args.get("page", 1, type=int)
    offset = min(request.args.get("offset", 20, type=int), 100)
    sort = "asc" if request.args.get("sort") == "asc" else "desc"

    params = {
        "chainid": ETHEREUM_MAINNET_CHAIN_ID,
        "module": "account",
        "action": "txlist",
        "address": clean_address,
        "startblock": 0,
        "endblock": 99999999,
        "page": page,
        "offset": offset,
        "sort": sort,
        "apikey": api_key
    }

    try:
        response = requests.get(ETHERSCAN_V2_URL, params=params, timeout=REQUEST_TIMEOUT)
        data = response.json()

        # Handle zero transactions or error
        if data.get("status") == "0":
            msg = str(data.get("message", "")).lower()
            res = str(data.get("result", "")).lower()

            if "no transactions" in msg or "no transactions" in res:
                return jsonify({
                    "success": True,
                    "address": address.strip(),
                    "totalFetched": 0,
                    "page": page,
                    "offset": offset,
                    "summary": {
                        "incomingCount": 0,
                        "outgoingCount": 0,
                        "selfCount": 0,
                        "failedCount": 0,
                        "successfulCount": 0,
                        "totalIncomingEth": "0",
                        "totalOutgoingEth": "0",
                        "netEthFlow": "0",
                        "averageTxValueEth": "0",
                        "totalGasFeesEth": "0"
                    },
                    "transactions": []
                })

            if data.get("result") == "Missing/Invalid API Key":
                return jsonify({
                    "success": False,
                    "error": "INVALID_API_KEY",
                    "message": "The configured Etherscan API key is invalid or unauthorized."
                }), 401

            return jsonify({
                "success": False,
                "error": "ETHERSCAN_ERROR",
                "message": data.get("message") or data.get("result") or "Failed to fetch transactions from Etherscan."
            }), 502

        raw_txs = data.get("result", [])
        if not isinstance(raw_txs, list):
            raw_txs = []

        incoming_count = 0
        outgoing_count = 0
        self_count = 0
        failed_count = 0
        successful_count = 0

        total_incoming_wei = Decimal(0)
        total_outgoing_wei = Decimal(0)
        total_gas_fees_wei = Decimal(0)
        successful_tx_value_sum_wei = Decimal(0)

        normalized_txs = []

        for tx in raw_txs:
            from_addr = str(tx.get("from", "")).lower()
            to_addr = str(tx.get("to", "")).lower()

            # Direction classification
            if from_addr == clean_address and to_addr == clean_address:
                direction = "SELF"
                self_count += 1
            elif from_addr == clean_address:
                direction = "OUTGOING"
                outgoing_count += 1
            else:
                direction = "INCOMING"
                incoming_count += 1

            # Status check
            is_failed = tx.get("isError") == "1" or tx.get("txreceipt_status") == "0"
            status = "FAILED" if is_failed else "SUCCESS"

            if is_failed:
                failed_count += 1
            else:
                successful_count += 1

            value_wei = str(tx.get("value", "0"))
            value_eth = wei_to_eth(value_wei, 6)

            # Gas fee = gasPrice * gasUsed
            fee_wei = "0"
            fee_eth = "0"
            try:
                gas_price = Decimal(str(tx.get("gasPrice", "0")))
                gas_used = Decimal(str(tx.get("gasUsed", "0")))
                fee_calc = gas_price * gas_used
                fee_wei = str(int(fee_calc))
                fee_eth = wei_to_eth(fee_wei, 6)
                if direction in ("OUTGOING", "SELF"):
                    total_gas_fees_wei += fee_calc
            except Exception:
                pass

            # Ignore failed transactions when calculating successful transfer totals
            if not is_failed:
                try:
                    val_dec = Decimal(value_wei)
                    successful_tx_value_sum_wei += val_dec
                    if direction == "INCOMING":
                        total_incoming_wei += val_dec
                    elif direction == "OUTGOING":
                        total_outgoing_wei += val_dec
                except Exception:
                    pass

            # Timestamp parsing
            timestamp_sec = int(tx.get("timeStamp", 0))
            try:
                dt_obj = datetime.fromtimestamp(timestamp_sec, tz=timezone.utc)
                date_time = dt_obj.strftime("%Y-%m-%d %H:%M:%S UTC")
            except Exception:
                date_time = "Unknown"

            tx_hash = tx.get("hash", "")
            normalized_txs.append({
                "hash": tx_hash,
                "from": tx.get("from", ""),
                "to": tx.get("to", ""),
                "valueWei": value_wei,
                "valueEth": value_eth,
                "feeWei": fee_wei,
                "feeEth": fee_eth,
                "gasPriceGwei": f"{float(tx.get('gasPrice', 0)) / 1e9:.2f}" if tx.get("gasPrice") else None,
                "blockNumber": int(tx.get("blockNumber", 0)),
                "timestamp": timestamp_sec,
                "dateTime": date_time,
                "status": status,
                "isError": is_failed,
                "direction": direction,
                "etherscanUrl": f"https://etherscan.io/tx/{tx_hash}"
            })

        total_incoming_eth = wei_to_eth(str(int(total_incoming_wei)), 6)
        total_outgoing_eth = wei_to_eth(str(int(total_outgoing_wei)), 6)
        total_gas_fees_eth = wei_to_eth(str(int(total_gas_fees_wei)), 6)

        net_flow_wei = total_incoming_wei - total_outgoing_wei
        net_eth_flow = wei_to_eth(str(int(net_flow_wei)), 6)
        if net_flow_wei > 0:
            net_eth_flow = f"+{net_eth_flow}"

        avg_tx_value_eth = "0"
        if successful_count > 0:
            avg_dec = successful_tx_value_sum_wei / Decimal(successful_count)
            avg_tx_value_eth = wei_to_eth(str(int(avg_dec)), 6)

        return jsonify({
            "success": True,
            "address": address.strip(),
            "totalFetched": len(normalized_txs),
            "page": page,
            "offset": offset,
            "summary": {
                "incomingCount": incoming_count,
                "outgoingCount": outgoing_count,
                "selfCount": self_count,
                "failedCount": failed_count,
                "successfulCount": successful_count,
                "totalIncomingEth": total_incoming_eth,
                "totalOutgoingEth": total_outgoing_eth,
                "netEthFlow": net_eth_flow,
                "averageTxValueEth": avg_tx_value_eth,
                "totalGasFeesEth": total_gas_fees_eth
            },
            "transactions": normalized_txs
        })

    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "TIMEOUT",
            "message": "Etherscan API request timed out after 10 seconds."
        }), 504
    except Exception as exc:
        return jsonify({
            "success": False,
            "error": "INTERNAL_ERROR",
            "message": str(exc)
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
