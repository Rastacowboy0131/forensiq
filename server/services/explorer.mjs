export function createExplorerService({ blockscout, rpc, hoodId, labels }) {
  async function withSource(result) {
    return { data: result.data, source: result.source };
  }

  async function stats() {
    return withSource(await blockscout.stats());
  }

  async function home() {
    const [statsResult, txsResult, blocksResult, tokensResult] = await Promise.allSettled([
      blockscout.stats(),
      blockscout.mainTransactions(),
      blockscout.mainBlocks(),
      blockscout.tokens()
    ]);
    return {
      stats: unwrap(statsResult),
      transactions: unwrap(txsResult, []),
      blocks: unwrap(blocksResult, []),
      tokens: unwrap(tokensResult, { items: [] }),
      partialErrors: collectErrors({ statsResult, txsResult, blocksResult, tokensResult })
    };
  }

  async function search(query) {
    if (String(query || '').endsWith('.hood')) {
      const resolved = await hoodId.resolveName(query);
      return { query, hoodId: resolved, items: [], source: resolved.source };
    }
    return withSource(await blockscout.search(query));
  }

  async function tokens() {
    return withSource(await blockscout.tokens());
  }

  async function token(address) {
    const [tokenResult, holdersResult, transfersResult] = await Promise.allSettled([
      blockscout.token(address),
      blockscout.tokenHolders(address),
      blockscout.tokenTransfers(address)
    ]);
    if (tokenResult.status === 'rejected') throw tokenResult.reason;
    const holders = unwrap(holdersResult, { items: [] });
    const top10 = (holders.items || []).slice(0, 10).reduce((sum, h) => sum + Number(h.value_percentage || 0), 0);
    return {
      token: tokenResult.value.data,
      holders,
      transfers: unwrap(transfersResult, { items: [] }),
      intelligence: {
        top10HolderPercentage: top10,
        labels: labels.labelsForToken(tokenResult.value.data, top10),
        hoodSafeReady: true,
        hoodLockReady: true
      },
      partialErrors: collectErrors({ holdersResult, transfersResult }),
      source: tokenResult.value.source
    };
  }

  async function address(addressValue) {
    const [detailsResult, txsResult, transfersResult, hoodIdResult] = await Promise.allSettled([
      blockscout.address(addressValue),
      blockscout.addressTransactions(addressValue),
      blockscout.addressTokenTransfers(addressValue),
      hoodId.reverseResolve(addressValue)
    ]);
    if (detailsResult.status === 'rejected') throw detailsResult.reason;
    return {
      address: detailsResult.value.data,
      transactions: unwrap(txsResult, { items: [] }),
      tokenTransfers: unwrap(transfersResult, { items: [] }),
      intelligence: {
        labels: labels.labelsForAddress(detailsResult.value.data),
        hoodId: unwrap(hoodIdResult, { address: addressValue, name: null, configured: false }),
        deployerHistoryReady: true
      },
      partialErrors: collectErrors({ txsResult, transfersResult, hoodIdResult }),
      source: detailsResult.value.source
    };
  }

  async function transaction(hash) {
    return withSource(await blockscout.transaction(hash));
  }

  async function block(height) {
    return withSource(await blockscout.block(height));
  }

  async function providerStatus() {
    let rpcBlock = null;
    let rpcError = null;
    if (rpc.rpcUrlConfigured) {
      try { rpcBlock = await rpc.blockNumber(); } catch (error) { rpcError = error.message; }
    }
    return {
      blockscout: { configured: true, origin: blockscout.origin },
      quickNode: {
        rpcConfigured: rpc.rpcUrlConfigured,
        wsConfigured: rpc.wsUrlConfigured,
        latestBlockHex: rpcBlock,
        error: rpcError
      },
      hoodId: { configured: hoodId.configured, registryAddress: hoodId.registryAddress || null }
    };
  }

  return { stats, home, search, tokens, token, address, transaction, block, providerStatus };
}

function unwrap(result, fallback = null) {
  return result.status === 'fulfilled' ? result.value.data ?? result.value : fallback;
}

function collectErrors(results) {
  return Object.fromEntries(Object.entries(results)
    .filter(([, result]) => result.status === 'rejected')
    .map(([key, result]) => [key.replace(/Result$/, ''), result.reason?.message || String(result.reason)]));
}
