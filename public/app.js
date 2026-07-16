const app = document.querySelector('#app');
const searchForm = document.querySelector('#searchForm');
const searchInput = document.querySelector('#searchInput');
const BLOCKSCOUT_ORIGIN = 'https://robinhoodchain.blockscout.com';

const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const shortAddr = (value = '') => value ? `${String(value).slice(0, 6)}…${String(value).slice(-4)}` : '—';
const isTxHash = (value = '') => /^0x[a-fA-F0-9]{64}$/.test(value);
const isAddress = (value = '') => /^0x[a-fA-F0-9]{40}$/.test(value);

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function numberText(value, decimals = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(numeric);
}

function tokenAmount(value, decimals = 18) {
  if (!value) return '0';
  try {
    const raw = BigInt(String(value));
    const d = BigInt(decimals || 0);
    const base = 10n ** d;
    const whole = raw / base;
    const frac = raw % base;
    const trimmed = frac.toString().padStart(Number(d), '0').slice(0, 4).replace(/0+$/, '');
    return `${fmtInt.format(Number(whole))}${trimmed ? `.${trimmed}` : ''}`;
  } catch {
    return String(value);
  }
}

function age(timestamp) {
  if (!timestamp) return '—';
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function eventLabel(event = {}) {
  const labels = {
    BLOCK_SEEN: 'New block indexed',
    TX_SEEN: 'Transaction indexed',
    TOKEN_DEPLOYED: 'Token deployed',
    TOKEN_TRENDING: 'Token trending',
    ALPHA_WALLET_BUY: 'Alpha wallet buy',
    WHALE_BUY: 'Whale buy',
    WHALE_SELL: 'Whale sell'
  };
  return labels[event.eventType] || event.eventType || 'Realtime event';
}

function eventTone(event = {}) {
  if (event.severity === 'high' || /WHALE|ALPHA/.test(event.eventType || '')) return 'yellow';
  if (/TOKEN|BLOCK|TX/.test(event.eventType || '')) return 'green';
  return '';
}

function eventTable(events = []) {
  if (!events.length) return '<p class="muted">No local realtime events yet. Run <code>npm run worker:indexer</code> to seed the dry-run feed.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Signal</th><th>Subject</th><th>Block</th><th>Age</th><th>Payload</th><th>Actions</th></tr></thead><tbody>${events.map(event => {
    const payload = event.payload || {};
    const subject = event.txHash || event.tokenAddress || event.walletAddress || event.subjectAddress || payload.txHash || payload.blockNumber || 'Hood Chain';
    const kind = isTxHash(subject) ? 'tx' : isAddress(subject) ? 'address' : 'block';
    const details = [payload.method, payload.transactionsCount ? `${payload.transactionsCount} txs` : '', payload.source].filter(Boolean).join(' · ') || 'local indexer';
    return `<tr>
      <td data-label="Signal"><span class="badge ${eventTone(event)}">${escapeHtml(eventLabel(event))}</span></td>
      <td data-label="Subject"><span class="mono">${escapeHtml(String(subject).startsWith('0x') ? shortAddr(subject) : subject)}</span></td>
      <td data-label="Block">${event.blockNumber ? `<a class="row-link" href="#/block/${event.blockNumber}">${event.blockNumber}</a>` : '—'}</td>
      <td data-label="Age">${age(event.createdAt)}</td>
      <td data-label="Payload"><span class="muted">${escapeHtml(details)}</span></td>
      <td data-label="Actions">${String(subject).startsWith('0x') ? actions(kind, subject) : ''}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function blockscoutUrl(kind, value) {
  const safe = encodeURIComponent(value || '');
  if (kind === 'token') return `${BLOCKSCOUT_ORIGIN}/token/${safe}`;
  if (kind === 'address') return `${BLOCKSCOUT_ORIGIN}/address/${safe}`;
  if (kind === 'tx') return `${BLOCKSCOUT_ORIGIN}/tx/${safe}`;
  if (kind === 'block') return `${BLOCKSCOUT_ORIGIN}/block/${safe}`;
  return BLOCKSCOUT_ORIGIN;
}

function copyButton(value, label = 'Copy') {
  if (!value) return '';
  return `<button class="copy-button" data-copy="${escapeHtml(value)}" title="Copy ${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function externalLink(kind, value, label = 'Blockscout') {
  if (!value) return '';
  return `<a class="copy-button external" href="${blockscoutUrl(kind, value)}" target="_blank" rel="noreferrer">${escapeHtml(label)} ↗</a>`;
}

function actions(kind, value) {
  return `<div class="actions">${copyButton(value)}${externalLink(kind, value)}</div>`;
}

function setPageTitle(title, description = '') {
  const safeTitle = title ? `${title} · HoodScan` : 'HoodScan — Solscan-style explorer for Hood Chain';
  document.title = safeTitle;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
  }
  meta.content = description || 'Search Hood Chain wallets, tokens, transactions, blocks, and .hood names.';
}

function labelBadges(labels = []) {
  return labels.map(label => `<span class="badge ${label.tone || ''}">${escapeHtml(label.text)}</span>`).join(' ');
}

function addressLabels(details = {}) {
  const labels = [];
  labels.push({ text: details.is_contract ? 'Contract' : 'EOA wallet', tone: details.is_contract ? 'green' : '' });
  if (details.is_verified) labels.push({ text: 'Verified', tone: 'green' });
  if (details.proxy_type) labels.push({ text: `${details.proxy_type} proxy`, tone: 'yellow' });
  if (details.name) labels.push({ text: details.name, tone: 'green' });
  if (details.reputation && details.reputation !== 'ok') labels.push({ text: details.reputation, tone: 'red' });
  labels.push({ text: 'HoodID ready' });
  return labelBadges(labels);
}

function tokenLabels(token = {}, top10 = 0) {
  const labels = [{ text: token.type || 'ERC-20', tone: 'green' }];
  if (token.reputation && token.reputation !== 'ok') labels.push({ text: token.reputation, tone: 'red' });
  if (token.exchange_rate) labels.push({ text: 'Priced', tone: 'green' });
  if (Number(token.holders_count || 0) > 1000) labels.push({ text: '1k+ holders', tone: 'green' });
  if (top10 > 50) labels.push({ text: 'High concentration', tone: 'red' });
  else if (top10 > 25) labels.push({ text: 'Moderate concentration', tone: 'yellow' });
  else labels.push({ text: 'Holder distribution ok', tone: 'green' });
  labels.push({ text: 'HoodSafe ready' });
  return labelBadges(labels);
}

async function api(path) {
  const res = await fetch(path);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok) throw new Error(data?.message || data?.error || `API ${res.status}`);
  if (data && data.data && data.source && !data.token && !data.address) return data.data;
  return data;
}

function setLoading(title = 'Loading live Hood Chain data…') {
  app.innerHTML = `<section class="card"><div class="loading">${escapeHtml(title)}</div></section>`;
}

function setError(error) {
  app.innerHTML = `<section class="card"><div class="card-body"><h2 class="error">Could not load data</h2><p>${escapeHtml(error.message || error)}</p></div></section>`;
}

function card(title, body, action = '') {
  return `<section class="card"><div class="card-header"><h2>${title}</h2>${action}</div><div class="card-body">${body}</div></section>`;
}

function sectionError(title, error, hint = 'This Blockscout endpoint is temporarily unavailable. HoodScan kept the rest of the page loaded.') {
  return card(title, `<p class="error">${escapeHtml(error.message || error)}</p><p class="muted">${escapeHtml(hint)}</p>`, '<span class="badge red">partial</span>');
}

function metric(label, value, note = '') {
  return `<div class="metric"><label>${label}</label><strong>${value}</strong>${note ? `<small class="muted">${note}</small>` : ''}</div>`;
}

function pathFor(item) {
  const type = item?.type || item?.token_type;
  if (item?.hash && isTxHash(item.hash)) return `#/tx/${item.hash}`;
  if (item?.address_hash && (type === 'token' || item?.token_type)) return `#/token/${item.address_hash}`;
  if (item?.address_hash) return `#/address/${item.address_hash}`;
  if (item?.hash) return `#/address/${item.hash}`;
  return '#/';
}

function searchKind(item) {
  const type = String(item?.type || item?.token_type || '').toLowerCase();
  if (item?.address_hash && (type === 'token' || item?.token_type)) return 'tokens';
  if (item?.hash && isTxHash(item.hash)) return 'transactions';
  if (item?.block_number || type === 'block') return 'blocks';
  if (item?.address_hash || item?.hash) return 'addresses';
  return 'other';
}

function addressCell(addr, label = '') {
  if (!addr) return '—';
  const hash = typeof addr === 'string' ? addr : addr.hash;
  const name = typeof addr === 'object' ? (addr.name || addr.ens_domain_name || addr.metadata?.name) : label;
  const display = name || shortAddr(hash);
  return `<span class="cell-stack"><a class="row-link mono" href="#/address/${hash}">${escapeHtml(display)}</a><small class="muted mono">${escapeHtml(shortAddr(hash))}</small></span>`;
}

function tokenCell(token) {
  if (!token) return '—';
  const address = token.address_hash || token.address || token.token?.address_hash;
  const symbol = token.symbol || token.token?.symbol || 'TOKEN';
  const name = token.name || token.token?.name || '';
  const icon = token.icon_url || token.token?.icon_url;
  return `<div class="token-cell">
    ${icon ? `<img alt="" src="${escapeHtml(icon)}">` : `<span class="token-fallback">${escapeHtml(symbol.slice(0, 2))}</span>`}
    <span><a class="row-link" href="#/token/${address}">${escapeHtml(symbol)}</a><br><small class="muted">${escapeHtml(name)}</small></span>
  </div>`;
}

function txTable(txs = []) {
  if (!txs.length) return '<p class="muted">No transactions returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Txn</th><th>Method / Status</th><th>From</th><th>To</th><th>Value</th><th>Age</th><th>Actions</th></tr></thead><tbody>
    ${txs.map(tx => `<tr>
      <td data-label="Txn"><a class="row-link mono" href="#/tx/${tx.hash}">${shortAddr(tx.hash)}</a></td>
      <td data-label="Method / Status"><span class="badge ${tx.status === 'error' ? 'red' : 'green'}">${escapeHtml(tx.method || tx.transaction_tag || tx.result || 'txn')}</span></td>
      <td data-label="From">${addressCell(tx.from)}</td>
      <td data-label="To">${tx.to ? addressCell(tx.to) : '<span class="badge yellow">Contract creation</span>'}</td>
      <td data-label="Value">${tokenAmount(tx.value, 18)} ETH</td>
      <td data-label="Age">${age(tx.timestamp)}</td>
      <td data-label="Actions">${actions('tx', tx.hash)}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function tokenTable(tokens = []) {
  if (!tokens.length) return '<p class="muted">No tokens returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Token</th><th>Price</th><th>Market Cap</th><th>24h Volume</th><th>Holders</th><th>Contract</th><th>Actions</th></tr></thead><tbody>
    ${tokens.map(token => `<tr>
      <td data-label="Token">${tokenCell(token)}</td>
      <td data-label="Price">${token.exchange_rate ? `$${numberText(token.exchange_rate, 6)}` : '—'}</td>
      <td data-label="Market Cap">${token.circulating_market_cap ? `$${numberText(token.circulating_market_cap, 0)}` : '—'}</td>
      <td data-label="24h Volume">${token.volume_24h ? `$${numberText(token.volume_24h, 0)}` : '—'}</td>
      <td data-label="Holders">${numberText(token.holders_count, 0)}</td>
      <td data-label="Contract"><a class="mono row-link" href="#/address/${token.address_hash}">${shortAddr(token.address_hash)}</a></td>
      <td data-label="Actions">${actions('token', token.address_hash)}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function holderTable(items = [], decimals = 18) {
  if (!items.length) return '<p class="muted">No holders returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Holder</th><th>Amount</th><th>% Supply</th><th>HoodID</th><th>Actions</th></tr></thead><tbody>
    ${items.map((holder, index) => {
      const hash = holder.address?.hash;
      return `<tr>
        <td data-label="Rank">#${index + 1}</td>
        <td data-label="Holder">${addressCell(holder.address)}</td>
        <td data-label="Amount">${tokenAmount(holder.value, decimals)}</td>
        <td data-label="% Supply">${holder.value_percentage ? `${numberText(holder.value_percentage, 3)}%` : '—'}</td>
        <td data-label="HoodID"><span class="badge">ready for .hood resolve</span></td>
        <td data-label="Actions">${actions('address', hash)}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}

function transferTable(items = []) {
  if (!items.length) return '<p class="muted">No token transfers returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Token</th><th>From</th><th>To</th><th>Amount</th><th>Txn</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr><td data-label="Token">${tokenCell(item.token)}</td><td data-label="From">${addressCell(item.from)}</td><td data-label="To">${addressCell(item.to)}</td><td data-label="Amount">${tokenAmount(item.total?.value || item.amount, item.token?.decimals || item.total?.decimals || 18)}</td><td data-label="Txn"><a class="row-link mono" href="#/tx/${item.transaction_hash}">${shortAddr(item.transaction_hash)}</a></td><td data-label="Actions">${actions('tx', item.transaction_hash)}</td></tr>`).join('')}</tbody></table></div>`;
}

function blockTable(blocks = []) {
  if (!blocks.length) return '<p class="muted">No blocks returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Block</th><th>Txn</th><th>Gas used</th><th>Age</th><th>Actions</th></tr></thead><tbody>${blocks.map(block => `<tr><td data-label="Block"><a class="row-link" href="#/block/${block.height}">${block.height}</a></td><td data-label="Txn">${block.transactions_count}</td><td data-label="Gas used">${numberText(block.gas_used, 0)}</td><td data-label="Age">${age(block.timestamp)}</td><td data-label="Actions">${actions('block', String(block.height))}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderHome() {
  setPageTitle('Home', 'Live Hood Chain stats, tokens, transactions, and blocks.');
  setLoading();
  const [statsResult, txsResult, blocksResult, tokensResult, realtimeResult] = await Promise.allSettled([
    api('/api/stats'),
    api('/api/transactions/latest'),
    api('/api/blocks/latest'),
    api('/api/tokens'),
    api('/api/realtime/latest-events?limit=8')
  ]);

  if (statsResult.status === 'rejected') {
    app.innerHTML = sectionError('Chain stats', statsResult.reason, 'Stats are required for the homepage header. Try refreshing.');
    return;
  }

  const stats = statsResult.value;
  const tokenSection = tokensResult.status === 'fulfilled'
    ? card('Trending / top tokens', tokenTable((tokensResult.value.items || []).slice(0, 8)), '<a class="badge green" href="#/tokens">View tokens</a>')
    : sectionError('Trending / top tokens', tokensResult.reason);
  const txSection = txsResult.status === 'fulfilled'
    ? card('Latest transactions', txTable(Array.isArray(txsResult.value) ? txsResult.value.slice(0, 8) : []), '<span class="badge green">live</span>')
    : sectionError('Latest transactions', txsResult.reason);
  const blockSection = blocksResult.status === 'fulfilled'
    ? card('Latest batches / blocks', blockTable(Array.isArray(blocksResult.value) ? blocksResult.value.slice(0, 5) : []))
    : sectionError('Latest batches / blocks', blocksResult.reason);
  const realtimeSection = realtimeResult.status === 'fulfilled'
    ? card('Local realtime feed', eventTable(realtimeResult.value.items || []), '<a class="badge green" href="#/realtime">Open feed</a>')
    : sectionError('Local realtime feed', realtimeResult.reason, 'Run the local indexer once to activate the feed.');

  app.innerHTML = `
    <section class="grid-4">
      ${metric('Total transactions', numberText(stats.total_transactions, 0), 'Blockscout live')}
      ${metric('Total addresses', numberText(stats.total_addresses, 0), 'wallets/contracts')}
      ${metric('Daily transactions', numberText(stats.transactions_today, 0), 'today')}
      ${metric('Average block time', `${numberText((stats.average_block_time || 0) / 1000, 2)}s`, `Gas avg ${stats.gas_prices?.average ?? '—'} gwei`)}
    </section>
    ${realtimeSection}
    ${tokenSection}
    <section class="grid-2">${txSection}${blockSection}</section>
  `;
}

async function renderTokens(newOnly = false) {
  setPageTitle(newOnly ? 'New token deploys' : 'Token directory', 'Browse Hood Chain ERC-20 tokens with live Blockscout data.');
  setLoading(newOnly ? 'Loading new Hood Chain token deploys…' : 'Loading Hood Chain tokens…');
  try {
    const data = await api('/api/tokens');
    const title = newOnly ? 'New token deploys' : 'Token directory';
    const intro = newOnly
      ? '<p class="muted">MVP uses Blockscout token index sorted by API default. Next step: add contract-created timestamp and true newest deployment sorting.</p>'
      : '<p class="muted">Top ERC-20 tokens from the Hood Chain Blockscout API with Solscan-style columns.</p>';
    app.innerHTML = `${card(title, `${intro}${tokenTable(data.items || [])}`, '<a class="badge green" href="https://robinhoodchain.blockscout.com/tokens" target="_blank" rel="noreferrer">Blockscout tokens ↗</a>')}`;
  } catch (error) { setError(error); }
}

function searchResultsTable(items = []) {
  if (!items.length) return '<p class="muted">No results in this category.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Address / Link</th><th>Meta</th><th>Actions</th></tr></thead><tbody>${items.map(item => {
    const value = item.address_hash || item.hash || item.block_number || '';
    const kind = item.address_hash && (item.type === 'token' || item.token_type) ? 'token' : isTxHash(item.hash) ? 'tx' : item.block_number ? 'block' : 'address';
    return `<tr><td data-label="Name">${escapeHtml(item.name || item.symbol || value || 'Result')}</td><td data-label="Type"><span class="badge green">${escapeHtml(item.type || item.token_type || 'result')}</span></td><td data-label="Address / Link"><a class="row-link mono" href="${pathFor(item)}">${escapeHtml(shortAddr(value))}</a></td><td data-label="Meta">${item.exchange_rate ? `$${numberText(item.exchange_rate, 6)}` : item.is_smart_contract_verified ? 'verified contract' : item.certified ? 'certified' : '—'}</td><td data-label="Actions">${actions(kind, value)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

async function renderSearch(query) {
  setPageTitle(`Search: ${query}`, `HoodScan search results for ${query}.`);
  setLoading(`Searching ${query}…`);
  if (query.endsWith('.hood')) {
    app.innerHTML = card('HoodID search', `<p><strong>${escapeHtml(query)}</strong> looks like a .hood name.</p><p class="muted">The HoodID registry resolver hook is ready here. Once the registry ABI/address is plugged in, HoodScan will resolve this to its wallet and open the address page.</p>`);
    return;
  }
  if (isTxHash(query)) return renderTx(query);
  if (isAddress(query)) return renderAddress(query);
  if (/^\d+$/.test(query)) return renderBlock(query);
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    const items = data.items || [];
    const groups = {
      tokens: items.filter(item => searchKind(item) === 'tokens'),
      addresses: items.filter(item => searchKind(item) === 'addresses'),
      transactions: items.filter(item => searchKind(item) === 'transactions'),
      blocks: items.filter(item => searchKind(item) === 'blocks'),
      other: items.filter(item => searchKind(item) === 'other')
    };
    const total = items.length;
    app.innerHTML = `
      ${card(`Search results for “${escapeHtml(query)}”`, `<p class="muted">${total} result${total === 1 ? '' : 's'} grouped by type for faster scanning.</p>`)}
      <section class="grid-2">
        ${card(`Tokens (${groups.tokens.length})`, searchResultsTable(groups.tokens))}
        ${card(`Wallets / Contracts (${groups.addresses.length})`, searchResultsTable(groups.addresses))}
      </section>
      <section class="grid-2">
        ${card(`Transactions (${groups.transactions.length})`, searchResultsTable(groups.transactions))}
        ${card(`Blocks / Other (${groups.blocks.length + groups.other.length})`, searchResultsTable([...groups.blocks, ...groups.other]))}
      </section>`;
  } catch (error) {
    app.innerHTML = card(`Search results for “${escapeHtml(query)}”`, `<p class="muted">Blockscout search returned an error for this exact query. Try a contract/address directly, or search a broader symbol like <code>HOOD</code>.</p><p class="error">${escapeHtml(error.message || error)}</p>`);
  }
}

async function renderAddress(address) {
  setPageTitle(`Address ${shortAddr(address)}`, `HoodScan address intelligence for ${address}.`);
  setLoading(`Loading wallet ${shortAddr(address)}…`);
  const [detailsResult, txsResult, transfersResult] = await Promise.allSettled([
    api(`/api/addresses/${address}`),
    api(`/api/addresses/${address}/transactions`),
    api(`/api/addresses/${address}/token-transfers`)
  ]);

  if (detailsResult.status === 'rejected') return setError(detailsResult.reason);
  const detailsPayload = detailsResult.value;
  const details = detailsPayload.address || detailsPayload;
  const intelligence = detailsPayload.intelligence || null;
  const isContract = details.is_contract;
  const txSection = txsResult.status === 'fulfilled' ? card('Latest transactions', txTable(txsResult.value.items || txsResult.value || [])) : sectionError('Latest transactions', txsResult.reason);
  const transferSection = transfersResult.status === 'fulfilled' ? card('Token transfers', transferTable(transfersResult.value.items || [])) : sectionError('Token transfers', transfersResult.reason);

  app.innerHTML = `
    <section class="grid-4">
      ${metric(isContract ? 'Contract' : 'Wallet', shortAddr(details.hash || address), details.name || 'HoodID resolution ready')}
      ${metric('Native balance', `${tokenAmount(details.coin_balance, 18)} ETH`, 'raw on-chain balance')}
      ${metric('Transactions', numberText(details.transactions_count, 0), 'confirmed')}
      ${metric('Token transfers', transfersResult.status === 'fulfilled' ? numberText(transfersResult.value.items?.length || 0, 0) : '—', 'latest page')}
    </section>
    ${card('Address intelligence', `<p>${labelBadges((intelligence?.labels || []).map(text => ({ text, tone: /Verified|Contract|HoodID/.test(text) ? 'green' : /Proxy|Reputation/.test(text) ? 'yellow' : '' })))} <span class="badge">HoodSafe deployer history ready</span></p><p class="mono muted">${escapeHtml(details.hash || address)}</p>`, actions('address', details.hash || address))}
    ${txSection}
    ${transferSection}
  `;
}

async function renderToken(address) {
  setPageTitle(`Token ${shortAddr(address)}`, `HoodScan token intelligence for ${address}.`);
  setLoading(`Loading token ${shortAddr(address)}…`);
  const [tokenResult, holdersResult, transfersResult] = await Promise.allSettled([
    api(`/api/tokens/${address}`),
    api(`/api/tokens/${address}/holders`),
    api(`/api/tokens/${address}/transfers`)
  ]);

  if (tokenResult.status === 'rejected') return setError(tokenResult.reason);
  const tokenPayload = tokenResult.value;
  const token = tokenPayload.token || tokenPayload;
  const tokenIntel = tokenPayload.intelligence || null;
  const decimals = Number(token.decimals || 18);
  const holders = holdersResult.status === 'fulfilled' ? (holdersResult.value.items || []) : [];
  const top10 = holders.slice(0, 10).reduce((sum, h) => sum + Number(h.value_percentage || 0), 0);
  const riskBadge = tokenIntel?.labels
    ? labelBadges(tokenIntel.labels.map(text => ({ text, tone: /Priced|Holder distribution|ERC-20/.test(text) ? 'green' : /High|Reputation/.test(text) ? 'red' : /Moderate/.test(text) ? 'yellow' : '' })))
    : tokenLabels(token, top10);
  const holdersSection = holdersResult.status === 'fulfilled' ? card('Top holders', holderTable(holders.slice(0, 15), decimals)) : sectionError('Top holders', holdersResult.reason);
  const transfersSection = transfersResult.status === 'fulfilled' ? card('Latest transfers', transferTable((transfersResult.value.items || []).slice(0, 15))) : sectionError('Latest transfers', transfersResult.reason);

  app.innerHTML = `
    <section class="grid-4">
      ${metric(token.symbol || 'TOKEN', escapeHtml(token.name || 'Token'), escapeHtml(address))}
      ${metric('Price', token.exchange_rate ? `$${numberText(token.exchange_rate, 8)}` : '—', 'Blockscout/CoinGecko if available')}
      ${metric('Market cap', token.circulating_market_cap ? `$${numberText(token.circulating_market_cap, 0)}` : '—', 'circulating')}
      ${metric('Holders', numberText(token.holders_count, 0), `${numberText(token.transfers_count, 0)} transfers`)}
    </section>
    ${card('Token overview', `<p>${riskBadge} <a class="badge yellow" href="#/hoodsafe/${address}">HoodSafe scan</a> <a class="badge green" href="#/bubble-map/${address}">Bubble map</a> <a class="badge yellow" href="#/deployer/${address}">Deployer intel</a> <a class="badge green" href="#/hoodlock/${address}">HoodLock</a></p><p>Total supply: <strong>${tokenAmount(token.total_supply, decimals)} ${escapeHtml(token.symbol || '')}</strong></p><p class="mono muted">${escapeHtml(address)}</p>`, actions('token', address))}
    <section class="grid-2">${holdersSection}${transfersSection}</section>
  `;
}

async function renderTx(hash) {
  setPageTitle(`Txn ${shortAddr(hash)}`, `HoodScan transaction summary for ${hash}.`);
  setLoading(`Loading transaction ${shortAddr(hash)}…`);
  try {
    const tx = await api(`/api/tx/${hash}`);
    app.innerHTML = `${card('Transaction summary', `
      <p><span class="badge ${tx.status === 'error' ? 'red' : 'green'}">${escapeHtml(tx.status || tx.result || 'success')}</span> <span class="badge">${escapeHtml(tx.method || tx.transaction_tag || 'contract call')}</span></p>
      <div class="grid-3">
        ${metric('Value', `${tokenAmount(tx.value, 18)} ETH`)}
        ${metric('Gas fee', `${tokenAmount(tx.fee?.value || tx.transaction_fee || tx.transaction_burnt_fee, 18)} ETH`)}
        ${metric('Confirmations', numberText(tx.confirmations, 0))}
      </div>
      <p><strong>From</strong><br>${addressCell(tx.from)}</p>
      <p><strong>To</strong><br>${tx.to ? addressCell(tx.to) : '<span class="badge yellow">Contract creation</span>'}</p>
      <p class="mono muted">${escapeHtml(hash)}</p>
    `, actions('tx', hash))}`;
  } catch (error) { setError(error); }
}

async function renderBlock(height) {
  setPageTitle(`Block ${height}`, `HoodScan block summary for ${height}.`);
  setLoading(`Loading block ${height}…`);
  try {
    const block = await api(`/api/blocks/${height}`);
    app.innerHTML = `${card(`Block ${escapeHtml(height)}`, `
      <section class="grid-4">
        ${metric('Transactions', numberText(block.transactions_count, 0))}
        ${metric('Gas used', numberText(block.gas_used, 0))}
        ${metric('Gas limit', numberText(block.gas_limit, 0))}
        ${metric('Age', age(block.timestamp))}
      </section>
      <p><strong>Miner</strong><br>${addressCell(block.miner)}</p>
      <p class="mono muted">${escapeHtml(block.hash || '')}</p>
    `, actions('block', String(height)))}`;
  } catch (error) { setError(error); }
}

function money(value, decimals = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `$${numberText(n / 1_000_000_000, decimals)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${numberText(n / 1_000_000, decimals)}M`;
  if (Math.abs(n) >= 1_000) return `$${numberText(n / 1_000, decimals)}K`;
  return `$${numberText(n, n < 1 ? 6 : decimals)}`;
}

function pct(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${numberText(n, 2)}%`;
}

function marketTable(items = []) {
  if (!items.length) return '<p class="muted">No market rows returned yet.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Market</th><th>Venue</th><th>Price</th><th>1H</th><th>24H</th><th>Liquidity</th><th>24H Volume</th><th>Buys / Sells</th><th>Traders</th><th>Risk</th><th>Actions</th></tr></thead><tbody>${items.map((m, index) => {
    const address = m.address || m.pairAddress || m.poolAddress || m.tokenAddress;
    const label = m.pair || m.name || [m.baseToken?.symbol, m.quoteToken?.symbol].filter(Boolean).join(' / ') || `${m.tokenSymbol || 'TOKEN'} / WETH`;
    return `<tr>
      <td data-label="#">${m.rank || index + 1}</td>
      <td data-label="Market"><span class="cell-stack"><strong>${escapeHtml(label)}</strong><small class="mono muted">${escapeHtml(address ? shortAddr(address) : 'Hood Chain')}</small></span></td>
      <td data-label="Venue">${escapeHtml(m.venue || m.dex || m.exchange || '—')}</td>
      <td data-label="Price">${money(m.priceUsd ?? m.price ?? m.usdPrice, 6)}</td>
      <td data-label="1H"><span class="${Number(m.change1h || m.priceChange1h || 0) < 0 ? 'error' : 'row-link'}">${pct(m.change1h ?? m.priceChange1h)}</span></td>
      <td data-label="24H"><span class="${Number(m.change24h || m.priceChange24h || 0) < 0 ? 'error' : 'row-link'}">${pct(m.change24h ?? m.priceChange24h)}</span></td>
      <td data-label="Liquidity">${money(m.liquidityUsd ?? m.liquidity)}</td>
      <td data-label="24H Volume">${money(m.volume24hUsd ?? m.volume24h)}</td>
      <td data-label="Buys / Sells">${m.buys24h || '—'} / ${m.sells24h || '—'}</td>
      <td data-label="Traders">${numberText(m.traders24h || m.holders, 0)}</td>
      <td data-label="Risk"><span class="badge ${/flag|scan|risk|needs/i.test(m.risk || '') ? 'yellow' : 'green'}">${escapeHtml(m.risk || 'HoodSafe scan pending')}</span></td>
      <td data-label="Actions">${address ? actions(isAddress(address) ? 'token' : 'address', address) : ''}</td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function stockTokenTable(items = []) {
  if (!items.length) return '<p class="muted">No stock-token registry rows returned yet.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Underlying / Token</th><th>Registry</th><th>Reference</th><th>DEX</th><th>24H</th><th>Onchain Value</th><th>Holders</th><th>Contract</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr>
    <td data-label="Underlying / Token">${tokenCell({ symbol: item.symbol, name: item.name, icon_url: item.logoUrl, address_hash: item.address })}</td>
    <td data-label="Registry"><span class="badge green">${escapeHtml(item.registryStatus || 'canonical')}</span></td>
    <td data-label="Reference">${money(item.referencePriceUsd, 2)} <small class="muted">quote</small></td>
    <td data-label="DEX">${money(item.dexPriceUsd, 2)}</td>
    <td data-label="24H"><span class="${Number(item.priceChange24h || 0) < 0 ? 'error' : 'row-link'}">${pct(item.priceChange24h)}</span></td>
    <td data-label="Onchain Value">${money(item.onchainMarketCapUsd, 2)}</td>
    <td data-label="Holders">${numberText(item.holders, 0)}</td>
    <td data-label="Contract"><a class="row-link mono" href="#/token/${item.address}">${shortAddr(item.address)}</a></td>
    <td data-label="Actions">${actions('token', item.address)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function protocolBreakdown(items = []) {
  if (!items.length) return '<p class="muted">No DeFi category rows returned yet.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Category</th><th>Protocols</th><th>TVL</th></tr></thead><tbody>${items.map(row => `<tr><td data-label="Category">${escapeHtml(row.category || 'Other')}</td><td data-label="Protocols">${numberText(row.protocolCount, 0)}</td><td data-label="TVL">${money(row.tvlUsd, 2)}</td></tr>`).join('')}</tbody></table></div>`;
}

function depositsTable(items = []) {
  if (!items.length) return '<p class="muted">No bridge deposits returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Status</th><th>Origin</th><th>L1 block</th><th>Txn</th><th>Age</th></tr></thead><tbody>${items.slice(0, 20).map(item => `<tr><td data-label="ID">#${item.id}</td><td data-label="Status"><span class="badge yellow">${escapeHtml(item.status || 'pending')}</span></td><td data-label="Origin">${addressCell(item.originationAddress)}</td><td data-label="L1 block">${numberText(item.originationBlockNumber, 0)}</td><td data-label="Txn"><span class="mono">${shortAddr(item.originationTxHash)}</span></td><td data-label="Age">${age(item.originationTimestamp)}</td></tr>`).join('')}</tbody></table></div>`;
}

function userOpsTable(items = []) {
  if (!items.length) return '<p class="muted">No user operations returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>UserOp</th><th>Sender</th><th>EntryPoint</th><th>Txn</th><th>Block</th><th>Status</th><th>Age</th></tr></thead><tbody>${items.slice(0, 20).map(item => `<tr><td data-label="UserOp"><span class="mono">${shortAddr(item.hash)}</span></td><td data-label="Sender">${addressCell(item.sender)}</td><td data-label="EntryPoint"><span class="mono">${shortAddr(item.entryPoint)}</span></td><td data-label="Txn"><a class="row-link mono" href="#/tx/${item.transactionHash}">${shortAddr(item.transactionHash)}</a></td><td data-label="Block"><a class="row-link" href="#/block/${item.blockNumber}">${item.blockNumber}</a></td><td data-label="Status"><span class="badge ${item.success ? 'green' : 'red'}">${item.success ? 'success' : 'failed'}</span></td><td data-label="Age">${age(item.timestamp)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderMarkets(tab = 'top') {
  setPageTitle('Market terminal', 'HoodScan market terminal for Hood Chain liquidity, momentum, and risk.');
  setLoading('Loading Hood Chain market terminal…');
  try {
    const [markets, gas] = await Promise.allSettled([api(`/api/markets?tab=${encodeURIComponent(tab)}`), api('/api/gas-tracker')]);
    if (markets.status === 'rejected') return setError(markets.reason);
    const data = markets.value;
    const tabs = ['top', 'trending', 'gainers', 'new', 'all'].map(name => `<a class="tab-button ${name === tab ? 'active' : ''}" href="#/markets/${name}">${name.toUpperCase()}</a>`).join('');
    app.innerHTML = `
      <section class="grid-4">
        ${metric('Visible markets', numberText((data.items || []).length, 0), data.upstreamOk ? 'live market feed' : 'Blockscout fallback')}
        ${metric('Gas', gas.status === 'fulfilled' ? `${gas.value.average?.gwei ?? '—'} gwei` : '—', 'avg')}
        ${metric('Mode', tab.toUpperCase(), 'market ranking')}
        ${metric('Risk layer', 'HoodSafe', 'scoring hooks ready')}
      </section>
      ${card('Market terminal', `<div class="tabbar">${tabs}</div><p class="muted">Liquidity, volume, momentum, buys/sells, traders, and first-pass risk. Our next edge is HoodSafe + .hood identity overlays.</p>${data.error ? `<p class="error">Upstream note: ${escapeHtml(data.error)}</p>` : ''}${marketTable(data.items || [])}`, '<span class="badge green">inspired by market desk</span>')}`;
  } catch (error) { setError(error); }
}

async function renderStockTokens() {
  setPageTitle('Stock Token Desk', 'Canonical Robinhood stock tokens with reference prices, DEX prices, holders, and onchain value.');
  setLoading('Loading canonical stock-token desk…');
  try {
    const data = await api('/api/stock-tokens');
    const items = data.items || [];
    const holders = items.reduce((sum, item) => sum + Number(item.holders || 0), 0);
    const value = items.reduce((sum, item) => sum + Number(item.onchainMarketCapUsd || 0), 0);
    app.innerHTML = `
      <section class="grid-4">
        ${metric('Registered assets', numberText(items.length, 0), 'canonical contracts')}
        ${metric('Quote coverage', numberText(items.filter(i => i.quoteStatus !== 'missing').length, 0), 'reference feed')}
        ${metric('Holders', numberText(holders, 0), 'across contracts')}
        ${metric('Onchain value', money(value, 2), 'reported market cap')}
      </section>
      ${card('Stock Token Desk', `<p class="muted">Robinhood stock-token narrative page: reference price vs DEX price, holders, canonical status, and future HoodSafe wrappers.</p>${data.error ? `<p class="error">Upstream note: ${escapeHtml(data.error)}</p>` : ''}${stockTokenTable(items)}`, '<span class="badge green">canonical registry</span>')}`;
  } catch (error) { setError(error); }
}

async function renderDefi() {
  setPageTitle('DeFi command center', 'HoodScan DeFi overview for TVL, volume, stablecoins, and protocol categories.');
  setLoading('Loading DeFi command center…');
  try {
    const data = await api('/api/defi/overview');
    app.innerHTML = `
      <section class="grid-4">
        ${metric('TVL', money(data.tvlUsd, 2), `${pct(data.tvlChange1d)} 1d`)}
        ${metric('DEX volume 24h', money(data.dexVolume24hUsd, 2), 'chain trading')}
        ${metric('Stablecoin supply', money(data.stablecoinSupplyUsd, 2), 'reported')}
        ${metric('Protocols', numberText(data.protocolCount, 0), 'tracked')}
      </section>
      ${card('DeFi category breakdown', `${data.error ? `<p class="error">Upstream note: ${escapeHtml(data.error)}</p>` : ''}${protocolBreakdown(data.categoryBreakdown || [])}`, '<span class="badge green">TVL desk</span>')}`;
  } catch (error) { setError(error); }
}

async function renderFlows() {
  setPageTitle('Flow feeds', 'Bridge activity and account abstraction operations on Hood Chain.');
  setLoading('Loading flow feeds…');
  const [deposits, userOps] = await Promise.allSettled([api('/api/bridge/deposits'), api('/api/user-operations')]);
  app.innerHTML = `
    <section class="grid-2">
      ${deposits.status === 'fulfilled' ? card('Bridge deposits', depositsTable(deposits.value.items || []), '<span class="badge yellow">L1 → L2</span>') : sectionError('Bridge deposits', deposits.reason)}
      ${userOps.status === 'fulfilled' ? card('User operations', userOpsTable(userOps.value.items || []), '<span class="badge green">AA feed</span>') : sectionError('User operations', userOps.reason)}
    </section>`;
}


function riskTone(levelOrScore) {
  const score = Number(levelOrScore);
  const level = String(levelOrScore || '').toLowerCase();
  if (level === 'extreme' || level === 'high' || score >= 55) return 'red';
  if (level === 'medium' || score >= 35) return 'yellow';
  return 'green';
}

function hoodsafeSummary(score = {}) {
  return `<div class="risk-gauge ${riskTone(score.level || score.riskScore)}">
    <div><span>HoodSafe</span><strong>${numberText(score.safetyScore, 0)}</strong><small>safety</small></div>
    <div><span>Risk</span><strong>${numberText(score.riskScore, 0)}</strong><small>${escapeHtml(score.level || 'unknown')}</small></div>
    <p>${escapeHtml(score.verdict || 'Scan pending')}</p>
  </div>`;
}

function findingList(findings = []) {
  if (!findings.length) return '<p class="muted">No findings returned yet.</p>';
  return `<div class="finding-list">${findings.map(item => `<div class="finding ${riskTone(item.severity)}"><span class="badge ${riskTone(item.severity)}">${escapeHtml(item.severity || 'info')}</span><strong>${escapeHtml(item.title || 'Finding')}</strong><p>${escapeHtml(item.detail || '')}</p></div>`).join('')}</div>`;
}

function hoodsafeWatchlistTable(items = []) {
  if (!items.length) return '<p class="muted">No watchlist rows yet.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Token</th><th>Risk</th><th>Liquidity</th><th>Volume</th><th>Holders</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr>
    <td data-label="#">${item.rank}</td>
    <td data-label="Token"><span class="cell-stack"><strong>${escapeHtml(item.symbol || 'TOKEN')}</strong><small>${escapeHtml(item.name || shortAddr(item.address))}</small></span></td>
    <td data-label="Risk"><span class="badge ${riskTone(item.riskScore)}">${numberText(item.riskScore, 0)} · ${escapeHtml(item.level)}</span></td>
    <td data-label="Liquidity">${money(item.liquidityUsd, 2)}</td>
    <td data-label="Volume">${money(item.volume24hUsd, 2)}</td>
    <td data-label="Holders">${numberText(item.holders, 0)}</td>
    <td data-label="Reason">${escapeHtml(item.reason || 'Scan needed')}</td>
    <td data-label="Actions">${isAddress(item.address) ? `<div class="actions"><a class="copy-button" href="#/bubble-map/${item.address}">Bubble map</a><a class="copy-button" href="#/hoodsafe/${item.address}">Risk scan</a></div>` : '<span class="muted">No token address</span>'}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function bubbleMapSvg(map = {}) {
  const nodes = map.nodes || [];
  const links = map.links || [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const toneColor = (node) => node.kind === 'token' ? '#35ff88' : node.bucket === 'whale' ? '#ff557a' : node.bucket === 'large' ? '#ffe66d' : node.bucket === 'mid' ? '#72b9ff' : '#9eb8a9';
  return `<svg class="bubble-map" viewBox="0 0 100 100" role="img" aria-label="Token holder bubble map">
    ${links.map(link => {
      const a = nodeById.get(link.source);
      const b = nodeById.get(link.target);
      if (!a || !b) return '';
      const width = Math.max(0.18, Math.min(1.5, Number(link.value || 1) / 12));
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${link.kind === 'cluster-hint' ? '#ffe66d' : '#35ff88'}" stroke-opacity="${link.kind === 'cluster-hint' ? '0.32' : '0.18'}" stroke-width="${width}" />`;
    }).join('')}
    ${nodes.map(node => `<g>
      <circle cx="${node.x}" cy="${node.y}" r="${node.size / 2}" fill="${toneColor(node)}" fill-opacity="${node.kind === 'token' ? '0.9' : '0.34'}" stroke="${toneColor(node)}" stroke-width="0.7" />
      <title>${escapeHtml(`${node.label || shortAddr(node.address)} · ${numberText(node.percentage, 2)}%`)}</title>
      ${node.size >= 14 ? `<text x="${node.x}" y="${node.y + 0.7}" text-anchor="middle" font-size="2.4" fill="#effff4">${escapeHtml(node.kind === 'token' ? node.label : `#${node.rank}`)}</text>` : ''}
    </g>`).join('')}
  </svg>`;
}

function holderRiskTable(holders = []) {
  if (!holders.length) return '<p class="muted">No holders returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Holder</th><th>% Supply</th><th>Bucket</th><th>Tags</th><th>Actions</th></tr></thead><tbody>${holders.slice(0, 24).map(holder => `<tr>
    <td data-label="Rank">#${holder.rank}</td>
    <td data-label="Holder"><a class="row-link mono" href="#/address/${holder.address}">${escapeHtml(holder.hoodName || shortAddr(holder.address))}</a><br><small class="muted mono">${escapeHtml(shortAddr(holder.address))}</small></td>
    <td data-label="% Supply">${numberText(holder.percentage, 3)}%</td>
    <td data-label="Bucket"><span class="badge ${riskTone(holder.bucket === 'whale' ? 'high' : holder.bucket === 'large' ? 'medium' : 'low')}">${escapeHtml(holder.bucket)}</span></td>
    <td data-label="Tags">${(holder.riskTags || []).map(tag => `<span class="badge yellow">${escapeHtml(tag)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
    <td data-label="Actions">${actions('address', holder.address)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

async function renderHoodSafe(address = '') {
  if (!address) {
    setPageTitle('HoodSafe', 'Risk watchlist for Hood Chain tokens.');
    setLoading('Loading HoodSafe watchlist…');
    try {
      const data = await api('/api/hoodsafe/watchlist');
      app.innerHTML = `
        <section class="grid-4">
          ${metric('Watchlist rows', numberText((data.items || []).length, 0), data.upstreamOk ? 'market feed' : 'fallback')}
          ${metric('Risk engine', 'MVP', 'holder + market signals')}
          ${metric('Bubble map', 'Ready', 'token holder graph')}
          ${metric('Identity overlay', '.hood next', 'BENS-ready')}
        </section>
        ${card('HoodSafe risk watchlist', `<p class="muted">First-pass risk queue from market rows. Open a token to run holder concentration scoring and bubble map visualization.</p>${hoodsafeWatchlistTable(data.items || [])}`, '<span class="badge yellow">MVP scoring</span>')}`;
    } catch (error) { setError(error); }
    return;
  }

  setPageTitle(`HoodSafe ${shortAddr(address)}`, `HoodSafe token risk scan for ${address}.`);
  setLoading(`Scanning token ${shortAddr(address)}…`);
  try {
    const data = await api(`/api/hoodsafe/token/${address}`);
    const score = data.score || {};
    const c = data.concentration || {};
    app.innerHTML = `
      <section class="grid-4">
        ${metric('Safety score', numberText(score.safetyScore, 0), score.verdict || 'scan')}
        ${metric('Risk score', numberText(score.riskScore, 0), score.level || 'risk')}
        ${metric('Top 10 holders', `${numberText(c.top10, 2)}%`, `${numberText(c.holderCount, 0)} holders`)}
        ${metric('Top holder', `${numberText(c.top1, 2)}%`, 'visible supply')}
      </section>
      <section class="grid-2">
        ${card(`${escapeHtml(data.token?.symbol || 'TOKEN')} HoodSafe scan`, `${hoodsafeSummary(score)}<p class="mono muted">${escapeHtml(address)}</p>`, actions('token', address))}
        ${card('Risk findings', findingList(data.findings || []), '<span class="badge yellow">heuristic</span>')}
      </section>
      ${card('Holder bubble map', `${bubbleMapSvg(data.map || {})}<p class="muted">Circle size = visible holder percentage. Yellow links are MVP cluster hints between large wallets. Next pass can add transfer-history links.</p>`, '<span class="badge green">visual graph</span>')}
      ${card('Top holder table', holderRiskTable(data.holders || []))}`;
  } catch (error) { setError(error); }
}

async function renderBubbleMap(address) {
  setPageTitle(`Bubble map ${shortAddr(address)}`, `Holder bubble map for ${address}.`);
  setLoading(`Loading bubble map ${shortAddr(address)}…`);
  try {
    const data = await api(`/api/bubble-map/${address}`);
    const c = data.concentration || {};
    app.innerHTML = `
      <section class="grid-4">
        ${metric('Safety score', numberText(data.score?.safetyScore, 0), data.score?.verdict || 'scan')}
        ${metric('Top holder', `${numberText(c.top1, 2)}%`, 'visible supply')}
        ${metric('Top 5', `${numberText(c.top5, 2)}%`, 'concentration')}
        ${metric('Top 10', `${numberText(c.top10, 2)}%`, `${numberText(c.holderCount, 0)} holders`)}
      </section>
      ${card(`${escapeHtml(data.token?.symbol || 'TOKEN')} bubble map`, `${bubbleMapSvg(data.map || {})}<p class="muted">This MVP uses Blockscout holder snapshots. Next version will add transfer graph edges, deployer clusters, and .hood labels.</p>`, `<a class="badge yellow" href="#/hoodsafe/${address}">Open HoodSafe scan</a>`)}
    `;
  } catch (error) { setError(error); }
}

function compactTxTable(items = []) {
  if (!items.length) return '<p class="muted">No recent deployer transactions returned.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Txn</th><th>Method</th><th>Created contract</th><th>Status</th><th>Age</th><th>Actions</th></tr></thead><tbody>${items.map(tx => `<tr>
    <td data-label="Txn"><a class="row-link mono" href="#/tx/${tx.hash}">${shortAddr(tx.hash)}</a></td>
    <td data-label="Method">${escapeHtml(tx.method || 'transaction')}</td>
    <td data-label="Created contract">${tx.createdContract ? `<a class="row-link mono" href="#/address/${tx.createdContract.address}">${escapeHtml(tx.createdContract.name || shortAddr(tx.createdContract.address))}</a><br><small class="muted mono">${shortAddr(tx.createdContract.address)}</small>` : '<span class="muted">—</span>'}</td>
    <td data-label="Status"><span class="badge ${/fail|error/i.test(tx.status || '') ? 'red' : 'green'}">${escapeHtml(tx.status || 'success')}</span></td>
    <td data-label="Age">${age(tx.timestamp)}</td>
    <td data-label="Actions">${actions('tx', tx.hash)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function deployerContractTable(items = []) {
  if (!items.length) return '<p class="muted">No created contracts in the sampled recent deployer transaction page.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Contract</th><th>Txn</th><th>Status</th><th>Age</th><th>Actions</th></tr></thead><tbody>${items.map((tx, index) => `<tr>
    <td data-label="#">${index + 1}</td>
    <td data-label="Contract"><span class="cell-stack"><a class="row-link" href="#/address/${tx.createdContract.address}">${escapeHtml(tx.createdContract.name || 'Contract')}</a><small class="mono muted">${shortAddr(tx.createdContract.address)}</small></span></td>
    <td data-label="Txn"><a class="row-link mono" href="#/tx/${tx.hash}">${shortAddr(tx.hash)}</a></td>
    <td data-label="Status"><span class="badge ${/fail|error/i.test(tx.status || '') ? 'red' : 'green'}">${escapeHtml(tx.status || 'success')}</span></td>
    <td data-label="Age">${age(tx.timestamp)}</td>
    <td data-label="Actions">${actions('address', tx.createdContract.address)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function lockHolderTable(items = []) {
  if (!items.length) return '<p class="muted">No lock-relevant holder rows detected in the top holder sample.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Rank</th><th>Holder</th><th>% Supply</th><th>Evidence</th><th>Verified</th><th>Actions</th></tr></thead><tbody>${items.map(row => `<tr>
    <td data-label="Rank">#${row.rank}</td>
    <td data-label="Holder"><a class="row-link mono" href="#/address/${row.address}">${escapeHtml(row.label || shortAddr(row.address))}</a><br><small class="mono muted">${shortAddr(row.address)}</small></td>
    <td data-label="% Supply">${numberText(row.percentage, 3)}%</td>
    <td data-label="Evidence">${(row.tags || []).map(tag => `<span class="badge ${/lock|burn/i.test(tag) ? 'green' : /pool|vault|custody/i.test(tag) ? 'yellow' : ''}">${escapeHtml(tag)}</span>`).join(' ') || '—'}</td>
    <td data-label="Verified"><span class="badge ${row.isVerified ? 'green' : 'yellow'}">${row.isVerified ? 'verified' : 'unknown'}</span></td>
    <td data-label="Actions">${actions('address', row.address)}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

async function renderDeployerIntel(address) {
  setPageTitle(`Deployer intel ${shortAddr(address)}`, `Creator wallet intelligence for token ${address}.`);
  setLoading(`Loading deployer intel ${shortAddr(address)}…`);
  try {
    const data = await api(`/api/deployer-intel/${address}`);
    const s = data.score || {};
    const creator = data.contract?.creator;
    app.innerHTML = `
      <section class="grid-4">
        ${metric('Deployer risk', numberText(s.riskScore, 0), s.verdict || 'scan')}
        ${metric('Creator', creator ? shortAddr(creator) : 'Unknown', data.deployer?.name || 'Blockscout creator')}
        ${metric('Recent creates', numberText((data.createdContracts || []).length, 0), 'sampled tx page')}
        ${metric('Verified token', data.contract?.isVerified ? 'Yes' : 'No', data.contract?.name || 'contract')}
      </section>
      <section class="grid-2">
        ${card(`${escapeHtml(data.token?.symbol || 'TOKEN')} deployer`, `<p><span class="badge ${riskTone(s.level)}">${escapeHtml(s.level || 'unknown')}</span> <span class="badge">${escapeHtml(data.contract?.creationStatus || 'creation status unknown')}</span></p><p><strong>Creator:</strong><br>${creator ? addressCell({ hash: creator, name: data.deployer?.name }) : '<span class="muted">Unknown</span>'}</p><p><strong>Creation tx:</strong><br>${data.contract?.creationTx ? `<a class="row-link mono" href="#/tx/${data.contract.creationTx}">${shortAddr(data.contract.creationTx)}</a>` : '—'}</p><p class="mono muted">${escapeHtml(address)}</p>`, actions('token', address))}
        ${card('Deployer findings', findingList(s.findings || []), '<span class="badge yellow">creator scan</span>')}
      </section>
      ${card('Created contracts by deployer', deployerContractTable(data.createdContracts || []), '<span class="badge green">history</span>')}
      ${card('Recent deployer txs', compactTxTable(data.recentTransactions || []))}`;
  } catch (error) { setError(error); }
}

async function renderHoodLock(address) {
  setPageTitle(`HoodLock ${shortAddr(address)}`, `Lock and liquidity proof scan for token ${address}.`);
  setLoading(`Loading HoodLock scan ${shortAddr(address)}…`);
  try {
    const data = await api(`/api/hoodlock/${address}`);
    const proof = data.proof || {};
    app.innerHTML = `
      <section class="grid-4">
        ${metric('HoodLock score', numberText(proof.lockScore, 0), proof.verdict || 'scan')}
        ${metric('Lock-like', `${numberText(proof.possibleLockPct, 2)}%`, 'explicit lock/vesting')}
        ${metric('LP / Pool', `${numberText(proof.lpPct, 2)}%`, 'pool-like holders')}
        ${metric('Burned', `${numberText(proof.burnPct, 2)}%`, 'burn/null holders')}
      </section>
      <section class="grid-2">
        ${card(`${escapeHtml(data.token?.symbol || 'TOKEN')} HoodLock`, `<p><span class="badge ${proof.level === 'strong' ? 'green' : proof.level === 'partial' ? 'yellow' : 'red'}">${escapeHtml(proof.level || 'unknown')}</span> <span class="badge ${data.contract?.isVerified ? 'green' : 'yellow'}">${data.contract?.isVerified ? 'verified token' : 'unverified token'}</span></p><p>${escapeHtml(data.note || '')}</p><p class="mono muted">${escapeHtml(address)}</p>`, actions('token', address))}
        ${card('Lock findings', findingList(proof.findings || []), '<span class="badge green">HoodLock MVP</span>')}
      </section>
      ${card('Lock-relevant holders', lockHolderTable(proof.rows || []), '<span class="badge yellow">evidence rows</span>')}
      ${card('Top holders sampled', holderRiskTable((data.holders || []).map(h => ({ ...h, riskTags: h.tags || [], bucket: h.percentage >= 10 ? 'whale' : h.percentage >= 3 ? 'large' : h.percentage >= 1 ? 'mid' : 'retail' }))))}`;
  } catch (error) { setError(error); }
}

async function renderRealtime() {
  setPageTitle('Realtime feed', 'Local HoodScan realtime/indexer feed, ready for QuickNode keys.');
  setLoading('Loading local realtime indexer feed…');
  const [statusResult, eventsResult, blocksResult, txsResult] = await Promise.allSettled([
    api('/api/realtime/status'),
    api('/api/realtime/latest-events?limit=25'),
    api('/api/realtime/latest-blocks?limit=10'),
    api('/api/realtime/latest-transactions?limit=10')
  ]);
  if (statusResult.status === 'rejected') return setError(statusResult.reason);
  const status = statusResult.value;
  const events = eventsResult.status === 'fulfilled' ? eventsResult.value.items || [] : [];
  const blocks = blocksResult.status === 'fulfilled' ? blocksResult.value.items || [] : [];
  const txs = txsResult.status === 'fulfilled' ? (txsResult.value.items || []).map(tx => ({
    hash: tx.hash,
    method: tx.method,
    status: tx.status,
    from: tx.from_address ? { hash: tx.from_address } : null,
    to: tx.to_address ? { hash: tx.to_address } : null,
    value: tx.value,
    timestamp: tx.timestamp
  })) : [];
  app.innerHTML = `
    <section class="grid-4">
      ${metric('Mode', status.quickNodeRpcConfigured ? 'QuickNode-ready' : 'Dry-run', status.quickNodeRpcConfigured ? 'RPC key configured' : 'waiting for keys')}
      ${metric('Events', numberText(status.counts.events, 0), 'local SQLite')}
      ${metric('Blocks cached', numberText(status.counts.blocks, 0), 'latest seen')}
      ${metric('Txs cached', numberText(status.counts.transactions, 0), 'latest seen')}
    </section>
    ${card('Realtime foundation status', `<p><span class="badge ${status.quickNodeRpcConfigured ? 'green' : 'yellow'}">QuickNode RPC ${status.quickNodeRpcConfigured ? 'configured' : 'not configured yet'}</span> <span class="badge ${status.quickNodeWsConfigured ? 'green' : 'yellow'}">WebSocket ${status.quickNodeWsConfigured ? 'configured' : 'not configured yet'}</span></p><p class="muted mono">${escapeHtml(status.databasePath)}</p><p class="muted">Until keys are added, the worker seeds this feed from Blockscout so the DB/API/UI path is fully built and testable.</p>`)}
    ${card('Latest local events', eventTable(events), '<span class="badge green">DB-backed</span>')}
    <section class="grid-2">
      ${card('Indexed blocks', blockTable(blocks))}
      ${card('Indexed transactions', txTable(txs))}
    </section>
  `;
}

function route() {
  const [page, value] = location.hash.replace(/^#\/?/, '').split('/');
  const decoded = decodeURIComponent(value || '');
  if (!page) return renderHome();
  if (page === 'markets') return renderMarkets(decoded || 'top');
  if (page === 'stock-tokens') return renderStockTokens();
  if (page === 'hoodsafe') return renderHoodSafe(decoded || '');
  if (page === 'bubble-map') return renderBubbleMap(decoded);
  if (page === 'deployer') return renderDeployerIntel(decoded);
  if (page === 'hoodlock') return renderHoodLock(decoded);
  if (page === 'defi') return renderDefi();
  if (page === 'flows') return renderFlows();
  if (page === 'tokens') return renderTokens(false);
  if (page === 'new-tokens') return renderTokens(true);
  if (page === 'realtime') return renderRealtime();
  if (page === 'search') return renderSearch(decoded);
  if (page === 'address') return renderAddress(decoded);
  if (page === 'token') return renderToken(decoded);
  if (page === 'tx') return renderTx(decoded);
  if (page === 'block') return renderBlock(decoded);
  return renderHome();
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const nextHash = `#/search/${encodeURIComponent(query)}`;
  if (location.hash === nextHash) route();
  else location.hash = nextHash;
});

document.querySelectorAll('[data-query]').forEach(button => {
  button.addEventListener('click', () => {
    searchInput.value = button.dataset.query;
    const nextHash = `#/search/${encodeURIComponent(button.dataset.query)}`;
    if (location.hash === nextHash) route();
    else location.hash = nextHash;
  });
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const value = button.dataset.copy;
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = 'Copied';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copied');
    }, 1000);
  } catch {
    window.prompt('Copy this value:', value);
  }
});

window.addEventListener('hashchange', route);
route();
