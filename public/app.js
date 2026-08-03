(() => {
  'use strict';

  // ===== CONFIG =====
  const TIER_BADGE = {
    'LEGIT-REAL': 'assets/badge-legit-real.png',
    'EARLY-REAL': 'assets/badge-early-real.png',
    'NARRATIVE-ONLY': 'assets/badge-narrative-only.png',
    'SKETCHY': 'assets/badge-sketchy.png',
    'PURE-LARP': 'assets/badge-pure-larp.png',
    'AVOID': 'assets/badge-avoid.png',
  };

  const SECTION_META = {
    'CHART': { label: 'CHART', desc: 'Market data, mcap / liquidity / volume / txns, pair age, wash-trade heuristics.' },
    'CONTRACT/HOLDERS': { label: 'CONTRACT / HOLDERS', desc: 'Honeypot check, taxes, ownership, holder concentration, sniper clusters.' },
    'GITHUB': { label: 'GITHUB', desc: 'Repo discovery, commit-history forensics, backdating / burst-commit detection.' },
    'SITE': { label: 'SITE', desc: 'Website substance, SPA / template detection.' },
    'SOCIALS': { label: 'SOCIALS', desc: 'Twitter presence, account age, engagement.' },
  };
  const SECTION_ORDER = ['CHART', 'CONTRACT/HOLDERS', 'GITHUB', 'SITE', 'SOCIALS'];

  // Placeholders — swap in real values when available
  const SOCIALS = {
    x: 'https://x.com/forensiq_placeholder',
    telegram: 'https://t.me/forensiq_placeholder',
  };
  const CONTRACT_ADDRESS_PLACEHOLDER = null; // set to the real CA string when live

  // ===== DOM =====
  const $ = (sel) => document.querySelector(sel);

  const scanForm = $('#scanForm');
  const addressInput = $('#addressInput');
  const scanBtn = $('#scanBtn');
  const scanBtnText = scanBtn.querySelector('.scan-btn-text');
  const scanBtnLoading = scanBtn.querySelector('.scan-btn-loading');
  const scanError = $('#scanError');
  const moreOptionsToggle = $('#moreOptionsToggle');
  const moreOptions = $('#moreOptions');
  const githubHint = $('#githubHint');
  const siteHint = $('#siteHint');
  const twitterHint = $('#twitterHint');

  const verdictPanel = $('#verdictPanel');
  const tokenName = $('#tokenName');
  const tokenAddress = $('#tokenAddress');
  const tierBadge = $('#tierBadge');
  const tierPlaceholder = $('#tierPlaceholder');
  const confidenceValue = $('#confidenceValue');
  const confidenceFill = $('#confidenceFill');
  const flagCount = $('#flagCount');
  const verdictSummary = $('#verdictSummary');

  const statBar = $('#statBar');
  const breakdownList = $('#breakdownList');
  const chartEmbedWrap = $('#chartEmbedWrap');
  const contractStatus = $('#contractStatus');
  const contractStatusSub = $('#contractStatusSub');
  const logSections = $('#logSections');
  const recentList = $('#recentList');

  const caBox = $('#caBox');
  const caValue = $('#caValue');

  // ===== INIT SOCIALS / CA =====
  document.querySelectorAll('.social-link').forEach(a => {
    const kind = a.dataset.social;
    a.href = kind === 'x' ? SOCIALS.x : SOCIALS.telegram;
  });
  if (CONTRACT_ADDRESS_PLACEHOLDER) {
    caValue.textContent = truncateAddr(CONTRACT_ADDRESS_PLACEHOLDER);
  }
  caBox.addEventListener('click', () => {
    if (!CONTRACT_ADDRESS_PLACEHOLDER) return;
    navigator.clipboard?.writeText(CONTRACT_ADDRESS_PLACEHOLDER).then(() => {
      caBox.classList.add('copied');
      setTimeout(() => caBox.classList.remove('copied'), 1500);
    });
  });

  function truncateAddr(a) {
    if (!a) return '';
    return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  }

  // ===== SKELETON SCAN LOG =====
  function renderSkeletonLog() {
    logSections.innerHTML = SECTION_ORDER.map(key => {
      const meta = SECTION_META[key];
      return `
        <div class="log-section">
          <div class="log-section-header">${meta.label}</div>
          <p class="log-section-desc">${meta.desc}</p>
          <div class="shimmer-line w-80" style="margin-bottom:6px"></div>
          <div class="shimmer-line w-60"></div>
        </div>`;
    }).join('');
  }
  renderSkeletonLog();

  // ===== MORE OPTIONS TOGGLE =====
  moreOptionsToggle.addEventListener('click', () => {
    const expanded = moreOptionsToggle.getAttribute('aria-expanded') === 'true';
    moreOptionsToggle.setAttribute('aria-expanded', String(!expanded));
    moreOptions.hidden = expanded;
  });

  // ===== SCAN FLOW =====
  scanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const address = addressInput.value.trim();
    if (!address) return;
    await runScan(address, {
      github: githubHint.value.trim() || undefined,
      site: siteHint.value.trim() || undefined,
      twitter: twitterHint.value.trim() || undefined,
    });
  });

  async function runScan(address, hints = {}) {
    setLoading(true);
    hideError();
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, chain: 'robinhood', ...hints }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Scan failed (${res.status})`);
      }
      renderReport(data);
      history.pushState({}, '', `/r/${data.id}`);
      loadHistory();
    } catch (err) {
      showError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    scanBtn.disabled = isLoading;
    scanBtnText.hidden = isLoading;
    scanBtnLoading.hidden = !isLoading;
    if (isLoading) {
      verdictPanel.dataset.state = 'loading';
      tokenName.textContent = 'SCANNING…';
      tokenAddress.textContent = 'Running chart, contract, github, site, and social checks. This takes 10–30s.';
      renderSkeletonLog();
    }
  }

  function showError(msg) {
    scanError.textContent = msg;
    scanError.hidden = false;
  }
  function hideError() {
    scanError.hidden = true;
    scanError.textContent = '';
  }

  // ===== RENDER REPORT =====
  function renderReport(r) {
    verdictPanel.dataset.state = 'ready';
    verdictPanel.dataset.tier = r.tier;

    tokenName.textContent = r.name || r.market?.symbol || 'UNKNOWN TOKEN';
    tokenAddress.textContent = r.address;

    tierBadge.src = TIER_BADGE[r.tier] || TIER_BADGE['SKETCHY'];
    tierBadge.alt = r.tier;
    tierBadge.hidden = false;
    tierPlaceholder.hidden = true;

    confidenceValue.textContent = `${r.score}/100`;
    requestAnimationFrame(() => { confidenceFill.style.width = `${Math.max(0, Math.min(100, r.score))}%`; });

    const severity = r.score >= 70 ? 'good' : r.score >= 40 ? 'warn' : 'danger';
    flagCount.textContent = `${r.total_flags} flag${r.total_flags === 1 ? '' : 's'} found${r.cached ? ' · cached' : ''}`;
    flagCount.dataset.severity = severity;

    verdictSummary.textContent = r.summary || r.report || 'No summary returned.';

    renderStats(r.market, r.score);
    renderBreakdown(r.sections);
    renderChart(r.market);
    renderContractStatus(r.sections?.['CONTRACT/HOLDERS']);
    renderLog(r.sections);
  }

  function renderStats(market = {}, score) {
    const fmt = (n) => (n === undefined || n === null) ? '--' : `$${abbreviateNumber(n)}`;
    statBar.querySelector('[data-stat="mcap"]').textContent = fmt(market.mcap);
    statBar.querySelector('[data-stat="liq"]').textContent = fmt(market.liq);
    statBar.querySelector('[data-stat="vol24"]').textContent = fmt(market.vol24);
    statBar.querySelector('[data-stat="txns"]').textContent =
      (market.buys24 !== undefined || market.sells24 !== undefined)
        ? `${market.buys24 ?? 0}B / ${market.sells24 ?? 0}S` : '--';
    statBar.querySelector('[data-stat="age"]').textContent =
      market.age_days !== undefined ? `${market.age_days.toFixed(1)}d` : '--';
    statBar.querySelector('[data-stat="risk"]').textContent =
      score !== undefined ? `${100 - score}/100` : '--';
  }

  function abbreviateNumber(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(2);
  }

  const SEVERITY_ICON = {
    danger: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2 1 21h22L12 2Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="10"/></svg>',
    good: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m20 6-11 11-5-5"/></svg>',
    neutral: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  };

  function renderBreakdown(sections = {}) {
    const rows = [];
    for (const key of SECTION_ORDER) {
      const s = sections[key];
      if (!s) continue;
      (s.hard_flags || []).forEach(t => rows.push({ text: t, sev: 'danger', section: key }));
    }
    for (const key of SECTION_ORDER) {
      const s = sections[key];
      if (!s) continue;
      (s.flags || []).forEach(t => rows.push({ text: t, sev: 'warn', section: key }));
    }
    for (const key of SECTION_ORDER) {
      const s = sections[key];
      if (!s) continue;
      (s.good || []).forEach(t => rows.push({ text: t, sev: 'good', section: key }));
    }

    if (!rows.length) {
      breakdownList.innerHTML = `<p class="breakdown-empty">No notable findings surfaced.</p>`;
      return;
    }

    breakdownList.innerHTML = rows.map(row => `
      <div class="breakdown-item" data-severity="${row.sev}">
        <span class="breakdown-icon">${SEVERITY_ICON[row.sev]}</span>
        <div>
          <span class="breakdown-text">${escapeHtml(row.text)}</span>
          <span class="breakdown-section-tag">${SECTION_META[row.section]?.label || row.section}</span>
        </div>
      </div>
    `).join('');
  }

  function renderChart(market = {}) {
    if (market.pair_addr) {
      chartEmbedWrap.innerHTML = `<iframe src="https://dexscreener.com/robinhood/${market.pair_addr}?embed=1&theme=dark&trades=0&info=0" loading="lazy"></iframe>`;
    } else {
      chartEmbedWrap.innerHTML = `
        <div class="chart-placeholder">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="m18 9-5 5-3-3-4 4"/></svg>
          <span>No pair data available</span>
        </div>`;
    }
  }

  function renderContractStatus(section) {
    if (!section) {
      contractStatus.dataset.status = 'pending';
      contractStatus.querySelector('.contract-status-text').textContent = 'PENDING';
      contractStatusSub.textContent = 'Runs automatically as part of the CONTRACT/HOLDERS section.';
      return;
    }
    const hard = (section.hard_flags || []).length;
    const soft = (section.flags || []).length;
    let status = 'passed', label = 'PASSED', sub = 'No honeypot or ownership red flags detected.';
    if (hard > 0) { status = 'failed'; label = 'FAILED'; sub = `${hard} dealbreaker${hard === 1 ? '' : 's'} found — see full log below.`; }
    else if (soft > 0) { status = 'warnings'; label = 'WARNINGS'; sub = `${soft} warning${soft === 1 ? '' : 's'} found — review before trading.`; }
    contractStatus.dataset.status = status;
    contractStatus.querySelector('.contract-status-text').textContent = label;
    contractStatusSub.textContent = sub;
  }

  function renderLog(sections = {}) {
    logSections.innerHTML = SECTION_ORDER.map(key => {
      const meta = SECTION_META[key];
      const s = sections[key];
      const lines = [];
      if (s) {
        (s.hard_flags || []).forEach(t => lines.push({ tag: '[HARD FLAG]', sev: 'danger', text: t }));
        (s.flags || []).forEach(t => lines.push({ tag: '[FLAG]', sev: 'warn', text: t }));
        (s.good || []).forEach(t => lines.push({ tag: '[GOOD]', sev: 'good', text: t }));
        (s.findings || []).forEach(t => lines.push({ tag: '[NOTE]', sev: 'neutral', text: t }));
      }
      const body = lines.length
        ? lines.map(l => `<div class="log-line" data-severity="${l.sev}"><span class="tag">${l.tag}</span>${escapeHtml(l.text)}</div>`).join('')
        : `<div class="log-line" data-severity="neutral"><span class="tag">[NOTE]</span>No findings recorded for this section.</div>`;
      return `
        <div class="log-section">
          <div class="log-section-header">${meta.label}</div>
          ${body}
        </div>`;
    }).join('');
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ===== HISTORY =====
  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) return;
      const items = await res.json();
      if (!Array.isArray(items) || !items.length) {
        recentList.innerHTML = `<p class="recent-empty">No scans yet — history will populate here.</p>`;
        return;
      }
      recentList.innerHTML = items.map(item => `
        <a class="recent-row" href="/r/${item.id}" data-id="${item.id}">
          <div class="recent-row-left">
            <span class="recent-name">${escapeHtml(item.name || 'UNKNOWN')}</span>
            <span class="recent-addr">${truncateAddr(item.address)}</span>
          </div>
          <span class="recent-tier" data-tier="${item.tier}">${item.tier} · ${item.score}</span>
        </a>
      `).join('');
      recentList.querySelectorAll('.recent-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.preventDefault();
          const id = row.dataset.id;
          history.pushState({}, '', `/r/${id}`);
          loadReportById(id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    } catch { /* silent — history is non-critical */ }
  }

  async function loadReportById(id) {
    setLoading(true);
    hideError();
    try {
      const res = await fetch(`/api/report/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Report not found');
      addressInput.value = data.address;
      renderReport(data);
    } catch (err) {
      showError(err.message || 'Could not load that report.');
    } finally {
      setLoading(false);
    }
  }

  // ===== ROUTING =====
  function initRoute() {
    const match = window.location.pathname.match(/^\/r\/([a-f0-9]{12})$/i);
    if (match) {
      loadReportById(match[1]);
    }
  }

  window.addEventListener('popstate', initRoute);

  // ===== BOOT =====
  loadHistory();
  initRoute();
})();
