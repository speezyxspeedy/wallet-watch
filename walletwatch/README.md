# WalletWatch — Ethereum Wallet Activity Analyzer

**WalletWatch** is a responsive web application that analyzes Ethereum wallet transactions using the **Etherscan API V2** (Ethereum Mainnet, Chain ID 1).

> **Educational Disclaimer:**
> WalletWatch is an educational blockchain activity analyzer and data exploration tool. It is designed solely for inspecting on-chain transaction flows, gas expenditures, and address balances. It does **not** provide financial, investment, trading, or legal advice.

---

## Features

- **Wallet Search & Validation**: Input any Ethereum address (`0x...`), with live format validation and error feedback.
- **Wallet Overview**:
  - Shortened address display with one-click copy to clipboard
  - Live ETH balance in ETH & Wei
  - Total transactions fetched
  - Incoming vs. Outgoing ETH totals
  - Net flow (+/-) indicator
- **Transaction Analytics**:
  - Incoming vs. outgoing transaction counts
  - Total incoming vs. outgoing ETH volume
  - Visual activity ratio distribution bar
  - Average transaction value
  - Total gas fees spent on transactions
- **Transaction History**:
  - Latest transactions (hashes, counterparty addresses, values, timestamps, blocks, gas fees)
  - Color-coded badges: `INCOMING` (green), `OUTGOING` (red), `SELF` (purple)
  - Status indicators: `SUCCESS` vs `FAILED`
  - Instant search/filter by tx hash or address
  - Filter by direction (All / Incoming / Outgoing / Self) and status (All / Success / Failed)
  - Sort by Newest, Oldest, Highest Value, or Lowest Value
  - Direct links to inspect each transaction on Etherscan
- **Modern Dark UI**:
  - Dark navy fintech aesthetic
  - Shimmer skeleton loaders during data fetch
  - Empty states, rate-limit warnings, and error banners
  - Responsive design across desktop, tablet, and mobile screens

---

## Project Structure

```
walletwatch/
├── app.py                # Python Flask backend
├── requirements.txt      # Python dependencies (Flask, requests, python-dotenv)
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore file (excludes .env, pycache)
├── README.md             # Documentation and run instructions
├── templates/
│   └── index.html        # Clean Vanilla HTML interface
└── static/
    ├── css/
    │   └── style.css     # Dark navy fintech styling & animations
    └── js/
        └── app.js        # Vanilla JavaScript client logic
```

---

## Getting an Etherscan API Key

1. Go to [https://etherscan.io/register](https://etherscan.io/register) and create a free account.
2. Navigate to your [API-KEYs page](https://etherscan.io/myapikey).
3. Click **Add** to create an API key.
4. Copy the API key to your `.env` file.

---

## Windows PowerShell Setup & Run Instructions

Open **Windows PowerShell** in the project folder:

```powershell
# 1. Navigate to the walletwatch directory
cd walletwatch

# 2. Create a Python virtual environment
python -m venv venv

# 3. Activate the virtual environment
.\venv\Scripts\Activate.ps1

# (If PowerShell displays an execution policy error, run:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser)

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create your .env file
Copy-Item .env.example .env

# 6. Edit .env and paste your Etherscan API key:
# ETHERSCAN_API_KEY=YOUR_ACTUAL_API_KEY

# 7. Run the application
python app.py
```

The app will be available at: **`http://localhost:5000`**

---

## macOS & Linux Setup & Run Instructions

```bash
# 1. Navigate to directory
cd walletwatch

# 2. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file
cp .env.example .env

# 5. Add your API key to .env
# nano .env

# 6. Run the application
python3 app.py
```

Open **`http://localhost:5000`** in your browser.

---

## API Endpoints

- `GET /api/config`  
  Returns whether `ETHERSCAN_API_KEY` is configured and active network metadata.
- `GET /api/wallet/<address>`  
  Returns address balance in Wei and ETH, and formatted strings.
- `GET /api/transactions/<address>?page=1&offset=20&sort=desc`  
  Returns transaction list, normalized direction (`INCOMING`, `OUTGOING`, `SELF`), status (`SUCCESS`, `FAILED`), and calculated analytics.

---

## Calculation Rules Implemented

- **Conversion**: $1 \text{ ETH} = 10^{18} \text{ Wei}$.
- **Incoming**: Transaction `to` address matches the queried wallet.
- **Outgoing**: Transaction `from` address matches the queried wallet.
- **Self-Transfer**: Both `from` and `to` match the queried wallet.
- **Failed Transactions**: Transactions with `isError == "1"` or `txreceipt_status == "0"` are marked `FAILED` and excluded from successful transfer totals.
- **Gas Fees**: $\text{Fee} = \text{gasPrice} \times \text{gasUsed}$ in Wei, converted to ETH and Gwei.
