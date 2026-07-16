import { HttpError } from '../http.mjs';

export function createRpcProvider(config) {
  const rpcUrl = config.quickNode.rpcUrl;
  const wsUrl = config.quickNode.wsUrl;

  async function call(method, params = []) {
    if (!rpcUrl) throw new HttpError(503, 'QuickNode/Hood Chain RPC URL is not configured', { missing: 'QUICKNODE_RPC_URL' });
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    });
    const data = await res.json();
    if (data.error) throw new HttpError(502, `RPC error: ${data.error.message || data.error.code}`, { method, code: data.error.code });
    return data.result;
  }

  return {
    rpcUrlConfigured: Boolean(rpcUrl),
    wsUrlConfigured: Boolean(wsUrl),
    call,
    blockNumber: () => call('eth_blockNumber'),
    getLogs: (filter) => call('eth_getLogs', [filter]),
    getTransactionReceipt: (hash) => call('eth_getTransactionReceipt', [hash]),
    getCode: (address, block = 'latest') => call('eth_getCode', [address, block])
  };
}
