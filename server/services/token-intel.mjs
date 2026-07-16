const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctFromValue(value, totalSupply) {
  try {
    const v = BigInt(String(value || 0));
    const s = BigInt(String(totalSupply || 0));
    if (s <= 0n) return 0;
    return Number((v * 1_000_000n) / s) / 10_000;
  } catch {
    return 0;
  }
}

function shortAddress(address = '') {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
}

async function withRetry(fn, fallback = null) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { return await fn(); } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 350 + attempt * 250));
  }
  if (fallback !== null) return fallback;
  throw lastError;
}

function addressName(address = {}) {
  return address.name || address.ens_domain_name || address.metadata?.name || shortAddress(address.hash || '');
}

function contractLabel(address = {}) {
  const name = String(addressName(address) || '').toLowerCase();
  const hash = String(address.hash || '').toLowerCase();
  const tags = [];
  if (address.is_contract) tags.push('contract');
  if (address.is_verified) tags.push('verified');
  if (hash === ZERO_ADDRESS.toLowerCase() || hash === DEAD_ADDRESS.toLowerCase()) tags.push('burn');
  if (/lock|locker|vesting|timelock/.test(name)) tags.push('possible lock');
  if (/pool|uniswap|pancake|pair|amm|swap/.test(name)) tags.push('liquidity pool');
  if (/vault|safe|escrow|treasury/.test(name)) tags.push('vault/custody');
  return tags;
}

function normalizeHolder(holder = {}, index = 0, totalSupply = '0') {
  const address = holder.address || {};
  const hash = address.hash || holder.address_hash || holder.hash || ZERO_ADDRESS;
  const percentage = num(holder.value_percentage, pctFromValue(holder.value, totalSupply));
  const tags = contractLabel({ ...address, hash });
  return {
    rank: index + 1,
    address: hash,
    label: addressName({ ...address, hash }),
    value: holder.value || '0',
    percentage,
    isContract: Boolean(address.is_contract),
    isVerified: Boolean(address.is_verified),
    tags,
    lockRelevant: tags.some(tag => ['burn', 'possible lock', 'liquidity pool', 'vault/custody'].includes(tag))
  };
}

function normalizeTx(tx = {}) {
  const created = tx.created_contract || null;
  return {
    hash: tx.hash,
    method: tx.method || tx.transaction_tag || 'transaction',
    timestamp: tx.timestamp,
    status: tx.status || tx.result,
    from: tx.from?.hash || null,
    to: tx.to?.hash || null,
    createdContract: created ? {
      address: created.hash,
      name: created.name || created.token?.symbol || created.hash,
      isVerified: created.is_verified,
      token: created.token || null
    } : null
  };
}

function classifyDeployer({ deployer, createdContracts, tokenAddress }) {
  const findings = [];
  const contractCount = createdContracts.length;
  const failed = createdContracts.filter(tx => tx.status === 'error' || tx.status === 'failed').length;
  let risk = 22;

  if (!deployer) {
    risk += 35;
    findings.push({ severity: 'high', title: 'Unknown deployer', detail: 'Blockscout did not return a creator address for this token.' });
  } else {
    findings.push({ severity: 'low', title: 'Creator identified', detail: `Creator wallet ${shortAddress(deployer)} is available for tracing.` });
  }

  if (contractCount >= 8) {
    risk += 20;
    findings.push({ severity: 'high', title: 'Serial deployer', detail: `Recent history shows ${contractCount} contract creations.` });
  } else if (contractCount >= 3) {
    risk += 10;
    findings.push({ severity: 'medium', title: 'Repeat deployer', detail: `Recent history shows ${contractCount} contract creations.` });
  } else {
    risk -= 4;
    findings.push({ severity: 'low', title: 'Limited recent deploy history', detail: `${contractCount} recent contract creation(s) found in the sampled page.` });
  }

  if (failed > 0) {
    risk += Math.min(12, failed * 4);
    findings.push({ severity: 'medium', title: 'Failed creator transactions', detail: `${failed} failed tx(s) found in sampled deployer history.` });
  }

  if (createdContracts.some(tx => tx.createdContract?.address?.toLowerCase() === tokenAddress.toLowerCase())) {
    findings.push({ severity: 'low', title: 'Creation transaction matched', detail: 'The sampled creator history includes this token contract.' });
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(risk)));
  return {
    riskScore,
    level: riskScore >= 70 ? 'high' : riskScore >= 45 ? 'medium' : 'low',
    verdict: riskScore >= 70 ? 'High deployer caution' : riskScore >= 45 ? 'Review deployer history' : 'Deployer looks cleaner',
    findings
  };
}

function classifyHoodLock({ holders, token, addressDetails }) {
  const lockRows = holders.filter(holder => holder.lockRelevant);
  const lockedPct = lockRows.reduce((sum, holder) => sum + holder.percentage, 0);
  const burnPct = holders.filter(holder => holder.tags.includes('burn')).reduce((sum, holder) => sum + holder.percentage, 0);
  const lpPct = holders.filter(holder => holder.tags.includes('liquidity pool')).reduce((sum, holder) => sum + holder.percentage, 0);
  const possibleLockPct = holders.filter(holder => holder.tags.includes('possible lock')).reduce((sum, holder) => sum + holder.percentage, 0);
  const custodyPct = holders.filter(holder => holder.tags.includes('vault/custody')).reduce((sum, holder) => sum + holder.percentage, 0);
  const topHolderPct = holders[0]?.percentage || 0;
  const verified = Boolean(addressDetails?.is_verified);

  const findings = [];
  let lockScore = 20;
  if (verified) {
    lockScore += 12;
    findings.push({ severity: 'low', title: 'Verified token contract', detail: 'The token contract is verified on Blockscout.' });
  } else {
    findings.push({ severity: 'medium', title: 'Unverified token contract', detail: 'Source verification is missing or unavailable.' });
  }

  if (possibleLockPct > 0) {
    lockScore += Math.min(35, possibleLockPct);
    findings.push({ severity: 'low', title: 'Possible lock holder detected', detail: `${possibleLockPct.toFixed(2)}% sits in lock/vesting-like contracts.` });
  } else {
    findings.push({ severity: 'medium', title: 'No explicit lock contract detected', detail: 'No holder name matched lock/locker/vesting/timelock in the top holder sample.' });
  }

  if (lpPct > 0) findings.push({ severity: 'low', title: 'Liquidity pool holder detected', detail: `${lpPct.toFixed(2)}% appears in pool-like contracts.` });
  if (burnPct > 0) findings.push({ severity: 'low', title: 'Burn holder detected', detail: `${burnPct.toFixed(2)}% appears burned/null.` });
  if (custodyPct > 0) findings.push({ severity: 'medium', title: 'Vault/custody holder detected', detail: `${custodyPct.toFixed(2)}% is in vault/safe/escrow/treasury-like contracts.` });

  if (topHolderPct >= 35 && possibleLockPct <= 0) {
    lockScore -= 22;
    findings.push({ severity: 'high', title: 'Large unlocked-looking holder', detail: `Top holder controls ${topHolderPct.toFixed(2)}% and is not identified as a lock.` });
  }

  const score = Math.max(0, Math.min(100, Math.round(lockScore)));
  return {
    lockScore: score,
    level: score >= 70 ? 'strong' : score >= 45 ? 'partial' : 'weak',
    verdict: score >= 70 ? 'Lock evidence looks stronger' : score >= 45 ? 'Partial lock evidence' : 'No strong lock proof yet',
    lockedPct,
    burnPct,
    lpPct,
    possibleLockPct,
    custodyPct,
    findings,
    rows: lockRows
  };
}

export function createTokenIntelService({ blockscout }) {
  async function deployerIntel(tokenAddress) {
    const [tokenResult, addressResult] = await Promise.allSettled([
      withRetry(() => blockscout.token(tokenAddress)),
      withRetry(() => blockscout.address(tokenAddress))
    ]);
    const token = tokenResult.status === 'fulfilled' ? tokenResult.value.data : { address_hash: tokenAddress, symbol: 'TOKEN', name: 'Unknown token' };
    const details = addressResult.status === 'fulfilled' ? addressResult.value.data : {};
    const deployer = details.creator_address_hash || null;
    const creationTx = details.creation_transaction_hash || null;
    let deployerAddress = null;
    let deployerTxs = [];
    let createdContracts = [];
    let source = addressResult.status === 'fulfilled' ? addressResult.value.source : null;
    let error = null;

    if (deployer) {
      try {
        const [deployerRes, txRes] = await Promise.all([withRetry(() => blockscout.address(deployer)), withRetry(() => blockscout.addressTransactions(deployer))]);
        deployerAddress = deployerRes.data;
        deployerTxs = (txRes.data.items || []).map(normalizeTx);
        createdContracts = deployerTxs.filter(tx => tx.createdContract);
        source = txRes.source;
      } catch (e) {
        error = e.message;
      }
    }

    const deployerScore = classifyDeployer({ deployer, createdContracts, tokenAddress });
    return {
      token: {
        address: token.address_hash || tokenAddress,
        symbol: token.symbol || 'TOKEN',
        name: token.name || 'Unknown token',
        holdersCount: num(token.holders_count, 0),
        marketCapUsd: token.circulating_market_cap || null
      },
      contract: {
        address: tokenAddress,
        name: details.name || token.name || 'Token contract',
        isVerified: Boolean(details.is_verified),
        proxyType: details.proxy_type || null,
        creationStatus: details.creation_status || null,
        creationTx,
        creator: deployer
      },
      deployer: deployerAddress ? {
        address: deployer,
        name: deployerAddress.name || deployerAddress.ens_domain_name || shortAddress(deployer),
        isContract: Boolean(deployerAddress.is_contract),
        isVerified: Boolean(deployerAddress.is_verified),
        reputation: deployerAddress.reputation || 'ok',
        coinBalance: deployerAddress.coin_balance || '0'
      } : deployer ? { address: deployer, name: shortAddress(deployer) } : null,
      score: deployerScore,
      createdContracts: createdContracts.slice(0, 20),
      recentTransactions: deployerTxs.slice(0, 20),
      partialErrors: { token: tokenResult.reason?.message, address: addressResult.reason?.message, deployer: error },
      source,
      updatedAt: new Date().toISOString()
    };
  }

  async function hoodLockScan(tokenAddress) {
    const [tokenResult, addressResult, holdersResult] = await Promise.allSettled([
      withRetry(() => blockscout.token(tokenAddress)),
      withRetry(() => blockscout.address(tokenAddress)),
      withRetry(() => blockscout.tokenHolders(tokenAddress))
    ]);
    const token = tokenResult.status === 'fulfilled' ? tokenResult.value.data : { address_hash: tokenAddress, symbol: 'TOKEN', name: 'Unknown token', total_supply: '0' };
    const details = addressResult.status === 'fulfilled' ? addressResult.value.data : {};
    const holders = holdersResult.status === 'fulfilled'
      ? (holdersResult.value.data.items || []).map((holder, index) => normalizeHolder(holder, index, token.total_supply))
      : [];
    const proof = classifyHoodLock({ holders, token, addressDetails: details });
    return {
      token: {
        address: token.address_hash || tokenAddress,
        symbol: token.symbol || 'TOKEN',
        name: token.name || 'Unknown token',
        totalSupply: token.total_supply || '0',
        holdersCount: num(token.holders_count, holders.length)
      },
      contract: {
        address: tokenAddress,
        name: details.name || token.name || 'Token contract',
        isVerified: Boolean(details.is_verified),
        creator: details.creator_address_hash || null,
        creationTx: details.creation_transaction_hash || null
      },
      proof,
      holders: holders.slice(0, 24),
      source: holdersResult.status === 'fulfilled' ? holdersResult.value.source : addressResult.value?.source || null,
      partialErrors: { token: tokenResult.reason?.message, address: addressResult.reason?.message, holders: holdersResult.reason?.message },
      updatedAt: new Date().toISOString(),
      note: 'HoodLock MVP scans visible holders for burn, liquidity-pool, vault/custody, and lock/vesting-like contracts. It is evidence, not a legal lock certificate yet.'
    };
  }

  return { deployerIntel, hoodLockScan };
}
