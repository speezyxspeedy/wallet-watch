/**
 * WalletWatch — Client-Side Application Logic (Vanilla JS)
 */

(function () {
  'use strict';

  // State Management
  const state = {
    address: '',
    walletData: null,
    txData: null,
    isLoading: false,
    error: null,
    hasApiKey: true,
    
    // Filters & Sorting
    filterDirection: 'ALL', // 'ALL' | 'INCOMING' | 'OUTGOING' | 'SELF'
    filterStatus: 'ALL',    // 'ALL' | 'SUCCESS' | 'FAILED'
    searchQuery: '',
    sortBy: 'newest',       // 'newest' | 'oldest' | 'highest' | 'lowest'
    pageSize: 20
  };

  // DOM Elements Cache
  const elements = {
    searchForm: document.getElementById('search-form'),
    addressInput: document.getElementById('address-input'),
    clearBtn: document.getElementById('clear-btn'),
    searchBtn: document.getElementById('search-btn'),
    validationHint: document.getElementById('validation-hint'),
    sampleButtons: document.querySelectorAll('.sample-chip'),
    
    // Status/Banner
    configBanner: document.getElementById('config-banner'),
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    apiStatusDot: document.getElementById('api-status-dot'),
    apiStatusText: document.getElementById('api-status-text'),

    // Content Containers
    emptyState: document.getElementById('empty-state'),
    skeletonState: document.getElementById('skeleton-state'),
    dashboardContent: document.getElementById('dashboard-content'),

    // Overview Cards
    overviewAddress: document.getElementById('overview-address'),
    copyAddressBtn: document.getElementById('copy-address-btn'),
    etherscanAddressLink: document.getElementById('etherscan-address-link'),
    overviewBalanceEth: document.getElementById('overview-balance-eth'),
    overviewBalanceWei: document.getElementById('overview-balance-wei'),
    overviewTxCount: document.getElementById('overview-tx-count'),
    overviewNetFlow: document.getElementById('overview-net-flow'),

    // Analytics
    statIncomingCount: document.getElementById('stat-incoming-count'),
    statIncomingEth: document.getElementById('stat-incoming-eth'),
    statOutgoingCount: document.getElementById('stat-outgoing-count'),
    statOutgoingEth: document.getElementById('stat-outgoing-eth'),
    statAvgTxValue: document.getElementById('stat-avg-value'),
    statGasFees: document.getElementById('stat-gas-fees'),
    flowBarIncoming: document.getElementById('flow-bar-incoming'),
    flowBarOutgoing: document.getElementById('flow-bar-outgoing'),
    flowIncomingPercent: document.getElementById('flow-incoming-percent'),
    flowOutgoingPercent: document.getElementById('flow-outgoing-percent'),

    // Balance Trend Chart Elements (D3.js)
    chartSvg: document.getElementById('balance-chart-svg'),
    chartWrapper: document.getElementById('chart-wrapper'),
    chartTooltip: document.getElementById('chart-tooltip'),
    chartStartBalance: document.getElementById('chart-start-balance'),
    chartEndBalance: document.getElementById('chart-end-balance'),
    chartDeltaBalance: document.getElementById('chart-delta-balance'),
    chartEmptyMsg: document.getElementById('chart-empty-msg'),

    // Transaction Controls & Table
    txTableBody: document.getElementById('tx-table-body'),
    txCountBadge: document.getElementById('tx-count-badge'),
    txSearchInput: document.getElementById('tx-search-input'),
    sortSelect: document.getElementById('sort-select'),
    pageSizeSelect: document.getElementById('page-size-select'),
    directionFilters: document.querySelectorAll('[data-filter-dir]'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
  };

  // Validation regex for Ethereum address (0x + 40 hex)
  const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

  /**
   * Initialize App
   */
  async function init() {
    setupEventListeners();
    await checkApiConfig();
    
    // Check URL parameters for initial address
    const params = new URLSearchParams(window.location.search);
    const initialAddress = params.get('address');
    if (initialAddress && ETH_ADDRESS_REGEX.test(initialAddress.trim())) {
      elements.addressInput.value = initialAddress.trim();
      executeSearch(initialAddress.trim());
    }
  }

  /**
   * Check Server API Key Configuration Status
   */
  async function checkApiConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        state.hasApiKey = config.hasApiKey;
        if (!config.hasApiKey) {
          if (elements.configBanner) elements.configBanner.style.display = 'flex';
          if (elements.apiStatusDot) {
            elements.apiStatusDot.classList.add('warning');
          }
          if (elements.apiStatusText) {
            elements.apiStatusText.textContent = 'API Key Missing';
          }
        } else {
          if (elements.configBanner) elements.configBanner.style.display = 'none';
          if (elements.apiStatusDot) {
            elements.apiStatusDot.classList.remove('warning');
          }
          if (elements.apiStatusText) {
            elements.apiStatusText.textContent = 'Mainnet Live';
          }
        }
      }
    } catch (e) {
      console.warn('Could not check backend config:', e);
    }
  }

  /**
   * Setup Event Listeners
   */
  function setupEventListeners() {
    // Search Form Submit
    if (elements.searchForm) {
      elements.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const address = elements.addressInput.value.trim();
        validateAndSearch(address);
      });
    }

    // Input Validation on Typing
    if (elements.addressInput) {
      elements.addressInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (elements.clearBtn) {
          elements.clearBtn.style.display = value ? 'flex' : 'none';
        }
        validateAddressInput(value);
      });
    }

    // Clear Button
    if (elements.clearBtn) {
      elements.clearBtn.addEventListener('click', () => {
        elements.addressInput.value = '';
        elements.clearBtn.style.display = 'none';
        validateAddressInput('');
        elements.addressInput.focus();
      });
    }

    // Sample Wallets
    elements.sampleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sampleAddr = btn.getAttribute('data-address');
        if (sampleAddr) {
          elements.addressInput.value = sampleAddr;
          if (elements.clearBtn) elements.clearBtn.style.display = 'flex';
          validateAndSearch(sampleAddr);
        }
      });
    });

    // Copy Wallet Address
    if (elements.copyAddressBtn) {
      elements.copyAddressBtn.addEventListener('click', () => {
        if (state.address) {
          copyToClipboard(state.address, 'Wallet address copied to clipboard');
        }
      });
    }

    // Transaction Direction Filter Tabs
    elements.directionFilters.forEach((btn) => {
      btn.addEventListener('click', () => {
        elements.directionFilters.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterDirection = btn.getAttribute('data-filter-dir') || 'ALL';
        renderTransactionTable();
      });
    });

    // Filter Search Input
    if (elements.txSearchInput) {
      elements.txSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderTransactionTable();
      });
    }

    // Sort Dropdown
    if (elements.sortSelect) {
      elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderTransactionTable();
      });
    }

    // Page Size Dropdown
    if (elements.pageSizeSelect) {
      elements.pageSizeSelect.addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        if (state.address) {
          executeSearch(state.address);
        }
      });
    }

    // Responsive Window Resize Handler for D3 Chart
    let chartResizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(chartResizeTimer);
      chartResizeTimer = setTimeout(() => {
        if (state.walletData && state.txData && state.txData.transactions) {
          renderBalanceTrendChart();
        }
      }, 150);
    });
  }

  /**
   * Validate Address Input in UI
   */
  function validateAddressInput(address) {
    if (!elements.validationHint) return;

    if (!address) {
      elements.validationHint.textContent = '';
      elements.validationHint.className = 'validation-hint';
      elements.addressInput.classList.remove('invalid');
      return;
    }

    if (ETH_ADDRESS_REGEX.test(address)) {
      elements.validationHint.textContent = '✓ Valid Ethereum address format';
      elements.validationHint.className = 'validation-hint valid';
      elements.addressInput.classList.remove('invalid');
    } else {
      elements.validationHint.textContent = 'Address must be a 42-character hexadecimal starting with 0x';
      elements.validationHint.className = 'validation-hint error';
      elements.addressInput.classList.add('invalid');
    }
  }

  /**
   * Validate and Trigger Search
   */
  function validateAndSearch(address) {
    if (!address) {
      showError('Please enter an Ethereum address.');
      elements.addressInput.focus();
      return;
    }

    if (!ETH_ADDRESS_REGEX.test(address)) {
      showError('Invalid Ethereum address format. Address must start with 0x followed by 40 hexadecimal characters.');
      elements.addressInput.focus();
      return;
    }

    hideError();
    executeSearch(address);
  }

  /**
   * Execute Search: Call API for Balance and Transactions
   */
  async function executeSearch(address) {
    state.address = address;
    state.isLoading = true;
    updateUrl(address);
    setLoadingUI(true);

    try {
      // Parallel fetch for wallet balance and transactions list
      const [walletRes, txRes] = await Promise.all([
        fetch(`/api/wallet/${address}`),
        fetch(`/api/transactions/${address}?offset=${state.pageSize}`)
      ]);

      const walletJson = await walletRes.json();
      const txJson = await txRes.json();

      if (!walletRes.ok) {
        throw new Error(walletJson.message || 'Failed to fetch wallet balance.');
      }

      if (!txRes.ok) {
        throw new Error(txJson.message || 'Failed to fetch transaction activity.');
      }

      state.walletData = walletJson;
      state.txData = txJson;

      renderOverview();
      renderAnalytics();
      renderTransactionTable();

      setLoadingUI(false);
      showDashboard();
    } catch (err) {
      console.error('Search error:', err);
      setLoadingUI(false);
      showError(err.message || 'An error occurred while fetching blockchain data.');
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Render Wallet Overview
   */
  function renderOverview() {
    if (!state.walletData) return;

    const shortAddr = formatAddress(state.address);
    if (elements.overviewAddress) {
      elements.overviewAddress.textContent = shortAddr;
      elements.overviewAddress.title = state.address;
    }

    if (elements.etherscanAddressLink) {
      elements.etherscanAddressLink.href = `https://etherscan.io/address/${state.address}`;
    }

    if (elements.overviewBalanceEth) {
      elements.overviewBalanceEth.textContent = `${state.walletData.balanceEth} ETH`;
    }

    if (elements.overviewBalanceWei) {
      elements.overviewBalanceWei.textContent = `${state.walletData.balanceWei} Wei`;
    }

    if (elements.overviewTxCount && state.txData) {
      elements.overviewTxCount.textContent = `${state.txData.totalFetched}`;
    }

    if (elements.overviewNetFlow && state.txData) {
      const net = state.txData.summary.netEthFlow;
      const isPositive = net.startsWith('+');
      elements.overviewNetFlow.textContent = `${net} ETH`;
      elements.overviewNetFlow.style.color = isPositive ? 'var(--color-incoming)' : (net === '0' ? 'var(--text-main)' : 'var(--color-outgoing)');
    }
  }

  /**
   * Render Analytics Section
   */
  function renderAnalytics() {
    if (!state.txData || !state.txData.summary) return;
    const summary = state.txData.summary;

    if (elements.statIncomingCount) elements.statIncomingCount.textContent = summary.incomingCount;
    if (elements.statIncomingEth) elements.statIncomingEth.textContent = `${summary.totalIncomingEth} ETH`;

    if (elements.statOutgoingCount) elements.statOutgoingCount.textContent = summary.outgoingCount;
    if (elements.statOutgoingEth) elements.statOutgoingEth.textContent = `${summary.totalOutgoingEth} ETH`;

    if (elements.statAvgTxValue) elements.statAvgTxValue.textContent = `${summary.averageTxValueEth} ETH`;
    if (elements.statGasFees) elements.statGasFees.textContent = `${summary.totalGasFeesEth} ETH`;

    // Activity Ratio Bar
    const inEthNum = parseFloat(summary.totalIncomingEth) || 0;
    const outEthNum = parseFloat(summary.totalOutgoingEth) || 0;
    const totalVolume = inEthNum + outEthNum;

    let inPercent = 50;
    let outPercent = 50;

    if (totalVolume > 0) {
      inPercent = Math.round((inEthNum / totalVolume) * 100);
      outPercent = 100 - inPercent;
    } else {
      const inCount = summary.incomingCount || 0;
      const outCount = summary.outgoingCount || 0;
      const totalCount = inCount + outCount;
      if (totalCount > 0) {
        inPercent = Math.round((inCount / totalCount) * 100);
        outPercent = 100 - inPercent;
      }
    }

    if (elements.flowBarIncoming) elements.flowBarIncoming.style.width = `${inPercent}%`;
    if (elements.flowBarOutgoing) elements.flowBarOutgoing.style.width = `${outPercent}%`;
    if (elements.flowIncomingPercent) elements.flowIncomingPercent.textContent = `${inPercent}%`;
    if (elements.flowOutgoingPercent) elements.flowOutgoingPercent.textContent = `${outPercent}%`;

    // Render D3 Balance Trend Line Chart
    renderBalanceTrendChart();
  }

  /**
   * Render ETH Balance Trend Line Chart using D3.js
   * Visualizes wallet balance trajectory across the last 20 transactions
   */
  function renderBalanceTrendChart() {
    if (!elements.chartSvg || !elements.chartWrapper) return;
    const d3 = window.d3;
    if (!d3) {
      console.warn('D3.js library is not available.');
      return;
    }

    const svg = d3.select(elements.chartSvg);
    svg.selectAll('*').remove();

    if (!state.walletData || !state.txData || !state.txData.transactions) {
      return;
    }

    const currentBal = parseFloat(state.walletData.balanceEth) || 0;
    const rawTxs = state.txData.transactions.slice(0, 20);

    if (rawTxs.length === 0) {
      if (elements.chartEmptyMsg) elements.chartEmptyMsg.style.display = 'block';
      if (elements.chartStartBalance) elements.chartStartBalance.textContent = `${currentBal.toFixed(4)} ETH`;
      if (elements.chartEndBalance) elements.chartEndBalance.textContent = `${currentBal.toFixed(4)} ETH`;
      if (elements.chartDeltaBalance) elements.chartDeltaBalance.textContent = `0.0000 ETH`;
      return;
    }

    if (elements.chartEmptyMsg) elements.chartEmptyMsg.style.display = 'none';

    // Reverse to chronological sequence (oldest to newest)
    const chronoTxs = [...rawTxs].reverse();

    // Calculate balance delta for each transaction
    let totalNetChange = 0;
    const txDeltas = chronoTxs.map((tx) => {
      const val = parseFloat(tx.valueEth) || 0;
      const fee = parseFloat(tx.feeEth) || 0;
      let delta = 0;

      if (tx.direction === 'INCOMING') {
        delta = tx.isError ? 0 : val;
      } else if (tx.direction === 'OUTGOING') {
        delta = tx.isError ? -fee : -(val + fee);
      } else if (tx.direction === 'SELF') {
        delta = -fee;
      }

      totalNetChange += delta;
      return { tx, delta };
    });

    // Reconstruct start balance before this 20-tx window
    const startBal = Math.max(0, currentBal - totalNetChange);

    // Build timeline points: index 0 is baseline start, 1..N are after each transaction
    const points = [];
    points.push({
      index: 0,
      label: 'Initial',
      date: new Date(chronoTxs[0].timestamp * 1000 - 3600000),
      dateStr: 'Prior to 20 transfers',
      balance: startBal,
      delta: 0,
      tx: null,
    });

    let runningBal = startBal;
    txDeltas.forEach((item, idx) => {
      // Ensure the final point matches verified on-chain current balance
      if (idx === txDeltas.length - 1) {
        runningBal = currentBal;
      } else {
        runningBal = Math.max(0, runningBal + item.delta);
      }

      points.push({
        index: idx + 1,
        label: `Tx #${idx + 1}`,
        date: new Date(item.tx.timestamp * 1000),
        dateStr: item.tx.dateTime,
        balance: runningBal,
        delta: item.delta,
        tx: item.tx,
      });
    });

    // Update Summary Header stats
    if (elements.chartStartBalance) {
      elements.chartStartBalance.textContent = `${startBal.toFixed(4)} ETH`;
    }
    if (elements.chartEndBalance) {
      elements.chartEndBalance.textContent = `${currentBal.toFixed(4)} ETH`;
    }
    if (elements.chartDeltaBalance) {
      const deltaVal = currentBal - startBal;
      const deltaSign = deltaVal > 0 ? '+' : '';
      elements.chartDeltaBalance.textContent = `${deltaSign}${deltaVal.toFixed(4)} ETH`;
      elements.chartDeltaBalance.style.color = deltaVal > 0 
        ? 'var(--color-incoming)' 
        : (deltaVal < 0 ? 'var(--color-outgoing)' : 'var(--text-main)');
    }

    // Chart Dimensions
    const containerWidth = elements.chartWrapper.clientWidth || 800;
    const height = 280;
    const margin = { top: 20, right: 28, bottom: 42, left: 75 };
    const width = Math.max(300, containerWidth);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // X Scale (index-based for crisp, non-overlapping step visualization)
    const xScale = d3.scaleLinear()
      .domain([0, points.length - 1])
      .range([0, innerWidth]);

    // Y Scale
    let minBal = d3.min(points, d => d.balance);
    let maxBal = d3.max(points, d => d.balance);

    if (minBal === maxBal) {
      minBal = Math.max(0, minBal * 0.95);
      maxBal = maxBal * 1.05 || 1;
    } else {
      const padding = (maxBal - minBal) * 0.12;
      minBal = Math.max(0, minBal - padding);
      maxBal = maxBal + padding;
    }

    const yScale = d3.scaleLinear()
      .domain([minBal, maxBal])
      .nice()
      .range([innerHeight, 0]);

    // Defs: Gradients
    const defs = svg.append('defs');

    // Area Gradient (soft blue tint fading to transparent)
    const areaGradient = defs.append('linearGradient')
      .attr('id', 'balance-area-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');

    areaGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#2563eb')
      .attr('stop-opacity', 0.14);

    areaGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#2563eb')
      .attr('stop-opacity', 0.0);

    // Line Gradient (indigo to blue to emerald)
    const lineGradient = defs.append('linearGradient')
      .attr('id', 'balance-line-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');

    lineGradient.append('stop').attr('offset', '0%').attr('stop-color', '#4f46e5');
    lineGradient.append('stop').attr('offset', '50%').attr('stop-color', '#2563eb');
    lineGradient.append('stop').attr('offset', '100%').attr('stop-color', '#059669');

    // Subtle Horizontal Gridlines
    g.append('g')
      .attr('class', 'chart-grid')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat('')
      );

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(6, points.length))
      .tickFormat(i => {
        const p = points[Math.round(i)];
        if (!p) return '';
        if (p.index === 0) return 'Start';
        if (p.index === points.length - 1) return 'Latest';
        const d = p.date;
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      });

    g.append('g')
      .attr('class', 'chart-axis x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => {
        if (d >= 1000) return `${(d / 1000).toFixed(1)}k ETH`;
        if (d >= 1) return `${d.toFixed(2)} ETH`;
        return `${d.toFixed(4)} ETH`;
      });

    g.append('g')
      .attr('class', 'chart-axis y-axis')
      .call(yAxis);

    // Area Generator
    const areaGenerator = d3.area()
      .x(d => xScale(d.index))
      .y0(innerHeight)
      .y1(d => yScale(d.balance))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(points)
      .attr('class', 'chart-area')
      .attr('fill', 'url(#balance-area-grad)')
      .attr('d', areaGenerator);

    // Line Generator
    const lineGenerator = d3.line()
      .x(d => xScale(d.index))
      .y(d => yScale(d.balance))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(points)
      .attr('class', 'chart-line')
      .attr('fill', 'none')
      .attr('stroke', 'url(#balance-line-grad)')
      .attr('stroke-width', 2.5)
      .attr('d', lineGenerator);

    // Crosshair Line
    const crosshair = g.append('line')
      .attr('class', 'crosshair-line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', 'rgba(37, 99, 235, 0.45)')
      .attr('stroke-dasharray', '3 3')
      .attr('stroke-width', 1.5)
      .style('opacity', 0);

    // Data Point Dots
    const dotsGroup = g.append('g').attr('class', 'chart-dots');
    const dots = dotsGroup.selectAll('.chart-dot')
      .data(points)
      .enter()
      .append('circle')
      .attr('class', 'chart-dot')
      .attr('cx', d => xScale(d.index))
      .attr('cy', d => yScale(d.balance))
      .attr('r', d => (d.index === 0 || d.index === points.length - 1 ? 5.5 : 4))
      .attr('fill', d => {
        if (!d.tx) return '#64748b';
        if (d.tx.direction === 'INCOMING') return 'var(--color-incoming)';
        if (d.tx.direction === 'OUTGOING') return 'var(--color-outgoing)';
        return 'var(--color-self)';
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    // Interactive Overlay
    const tooltip = elements.chartTooltip;

    const overlay = g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    overlay
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event, this);
        const indexFloat = xScale.invert(mouseX);
        const index = Math.round(Math.max(0, Math.min(points.length - 1, indexFloat)));
        const d = points[index];

        if (!d) return;

        // Position crosshair
        crosshair
          .attr('x1', xScale(d.index))
          .attr('x2', xScale(d.index))
          .style('opacity', 1);

        // Highlight dot
        dots.attr('r', pt => (pt.index === d.index ? 7 : (pt.index === 0 || pt.index === points.length - 1 ? 5 : 4)));

        // Show Tooltip
        if (tooltip) {
          let deltaHtml = '';
          if (d.tx) {
            const isPos = d.delta > 0;
            const sign = isPos ? '+' : '';
            const color = isPos ? 'var(--color-incoming)' : (d.delta < 0 ? 'var(--color-outgoing)' : 'var(--text-muted)');
            deltaHtml = `
              <div class="tt-row">
                <span>Action:</span>
                <span style="font-weight: 600; color: ${color};">${d.tx.direction} (${sign}${d.delta.toFixed(4)} ETH)</span>
              </div>
              <div class="tt-row">
                <span>Tx Hash:</span>
                <span style="font-family: var(--font-mono);">${formatAddress(d.tx.hash, 6, 4)}</span>
              </div>
              <div class="tt-row">
                <span>Gas Fee:</span>
                <span>${d.tx.feeEth} ETH</span>
              </div>
            `;
          } else {
            deltaHtml = `
              <div class="tt-row">
                <span>Status:</span>
                <span>Baseline before 20 transfers</span>
              </div>
            `;
          }

          tooltip.innerHTML = `
            <div class="tt-title">${d.dateStr}</div>
            <div class="tt-balance">${d.balance.toFixed(6)} ETH</div>
            ${deltaHtml}
          `;

          tooltip.style.display = 'block';
          const leftPos = margin.left + xScale(d.index);
          const topPos = margin.top + yScale(d.balance) - 10;
          tooltip.style.left = `${leftPos}px`;
          tooltip.style.top = `${topPos}px`;
        }
      })
      .on('mouseleave', function() {
        crosshair.style('opacity', 0);
        dots.attr('r', pt => (pt.index === 0 || pt.index === points.length - 1 ? 5 : 4));
        if (tooltip) tooltip.style.display = 'none';
      });
  }

  /**
   * Render Transaction History Table with Filters & Sorting
   */
  function renderTransactionTable() {
    if (!state.txData || !elements.txTableBody) return;

    let transactions = [...(state.txData.transactions || [])];

    // Filter by Direction
    if (state.filterDirection !== 'ALL') {
      transactions = transactions.filter((tx) => tx.direction === state.filterDirection);
    }

    // Filter by Status
    if (state.filterStatus !== 'ALL') {
      transactions = transactions.filter((tx) => tx.status === state.filterStatus);
    }

    // Search query filter (hash, from, to, block)
    if (state.searchQuery) {
      transactions = transactions.filter((tx) => {
        return (
          tx.hash.toLowerCase().includes(state.searchQuery) ||
          tx.from.toLowerCase().includes(state.searchQuery) ||
          tx.to.toLowerCase().includes(state.searchQuery) ||
          tx.blockNumber.toString().includes(state.searchQuery)
        );
      });
    }

    // Sort Transactions
    transactions.sort((a, b) => {
      if (state.sortBy === 'newest') return b.timestamp - a.timestamp;
      if (state.sortBy === 'oldest') return a.timestamp - b.timestamp;
      if (state.sortBy === 'highest') return parseFloat(b.valueEth) - parseFloat(a.valueEth);
      if (state.sortBy === 'lowest') return parseFloat(a.valueEth) - parseFloat(b.valueEth);
      return 0;
    });

    if (elements.txCountBadge) {
      elements.txCountBadge.textContent = `${transactions.length} shown`;
    }

    elements.txTableBody.innerHTML = '';

    if (transactions.length === 0) {
      elements.txTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-dim);">
            No transactions match the selected filters.
          </td>
        </tr>
      `;
      return;
    }

    const currentAddr = state.address.toLowerCase();

    transactions.forEach((tx) => {
      const row = document.createElement('tr');

      // Direction Badge HTML
      let badgeClass = 'badge-incoming';
      let badgeLabel = '↓ IN';
      if (tx.direction === 'OUTGOING') {
        badgeClass = 'badge-outgoing';
        badgeLabel = '↑ OUT';
      } else if (tx.direction === 'SELF') {
        badgeClass = 'badge-self';
        badgeLabel = '↺ SELF';
      }

      // Status indicator
      const statusHtml = tx.isError
        ? `<span class="badge-status-failed" title="Transaction Failed">✕ Failed</span>`
        : `<span style="color: var(--color-incoming); font-size: 0.75rem;">✓ Success</span>`;

      // Value color
      let valClass = 'val-incoming';
      let valPrefix = '+';
      if (tx.direction === 'OUTGOING') {
        valClass = 'val-outgoing';
        valPrefix = '-';
      } else if (tx.direction === 'SELF') {
        valClass = 'val-self';
        valPrefix = '';
      }

      // Counterparty addresses
      const fromIsCurrent = tx.from.toLowerCase() === currentAddr;
      const toIsCurrent = tx.to.toLowerCase() === currentAddr;

      row.innerHTML = `
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="badge ${badgeClass}">${badgeLabel}</span>
            ${statusHtml}
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <a href="${tx.etherscanUrl}" target="_blank" rel="noopener noreferrer" class="hash-link" title="${tx.hash}">
              ${formatAddress(tx.hash, 8, 6)}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
            <button class="icon-btn copy-btn" data-copy="${tx.hash}" title="Copy Hash">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
            Block #${tx.blockNumber}
          </div>
        </td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-main);">${tx.dateTime.split(' ')[0]}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${tx.dateTime.split(' ')[1]} UTC</div>
        </td>
        <td>
          <div class="addr-cell ${fromIsCurrent ? 'current-wallet' : ''}">
            <span>${fromIsCurrent ? 'This Wallet' : formatAddress(tx.from, 6, 4)}</span>
            ${!fromIsCurrent ? `<button class="icon-btn copy-btn" data-copy="${tx.from}" title="Copy Address"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}
          </div>
        </td>
        <td>
          <div class="addr-cell ${toIsCurrent ? 'current-wallet' : ''}">
            <span>${toIsCurrent ? 'This Wallet' : formatAddress(tx.to, 6, 4)}</span>
            ${!toIsCurrent ? `<button class="icon-btn copy-btn" data-copy="${tx.to}" title="Copy Address"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>` : ''}
          </div>
        </td>
        <td>
          <div class="${valClass}">
            ${valPrefix}${tx.valueEth} ETH
          </div>
        </td>
        <td>
          <div style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">
            ${tx.feeEth} ETH
          </div>
          ${tx.gasPriceGwei ? `<div style="font-size: 0.72rem; color: var(--text-dim);">${tx.gasPriceGwei} Gwei</div>` : ''}
        </td>
      `;

      elements.txTableBody.appendChild(row);
    });

    // Attach copy button handlers
    elements.txTableBody.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const copyVal = btn.getAttribute('data-copy');
        if (copyVal) copyToClipboard(copyVal, 'Copied to clipboard');
      });
    });
  }

  /**
   * Format Address to Shortened form: 0x1234...5678
   */
  function formatAddress(addr, lead = 6, trail = 4) {
    if (!addr || addr.length <= lead + trail) return addr || '';
    return `${addr.substring(0, lead)}...${addr.substring(addr.length - trail)}`;
  }

  /**
   * UI State Controls
   */
  function setLoadingUI(loading) {
    if (elements.searchBtn) {
      elements.searchBtn.disabled = loading;
      elements.searchBtn.innerHTML = loading
        ? `<span class="spinner"></span> Analyzing...`
        : `Analyze Wallet`;
    }

    if (elements.skeletonState) {
      elements.skeletonState.style.display = loading ? 'block' : 'none';
    }

    if (loading) {
      if (elements.emptyState) elements.emptyState.style.display = 'none';
      if (elements.dashboardContent) elements.dashboardContent.style.display = 'none';
      if (elements.errorBanner) elements.errorBanner.style.display = 'none';
    }
  }

  function showDashboard() {
    if (elements.emptyState) elements.emptyState.style.display = 'none';
    if (elements.skeletonState) elements.skeletonState.style.display = 'none';
    if (elements.dashboardContent) elements.dashboardContent.style.display = 'block';
  }

  function showError(msg) {
    if (elements.errorBanner && elements.errorMessage) {
      elements.errorMessage.textContent = msg;
      elements.errorBanner.style.display = 'flex';
    }
  }

  function hideError() {
    if (elements.errorBanner) {
      elements.errorBanner.style.display = 'none';
    }
  }

  /**
   * Copy to Clipboard with Toast Notification
   */
  function copyToClipboard(text, message = 'Copied to clipboard') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(message);
      }).catch(() => fallbackCopy(text, message));
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      showToast(message);
    } catch (err) {
      console.error('Copy fallback failed:', err);
    }
    document.body.removeChild(el);
  }

  function showToast(message) {
    if (!elements.toast || !elements.toastMessage) return;
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 2400);
  }

  function updateUrl(address) {
    const url = new URL(window.location);
    url.searchParams.set('address', address);
    window.history.replaceState({}, '', url);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
