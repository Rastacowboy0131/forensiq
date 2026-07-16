import { normalizeAddress } from '../http.mjs';

export function createLabelService(config) {
  const manual = config.labels?.manual || {};
  const rules = config.labels?.rules || {};

  function labelsForAddress(details = {}) {
    const hash = normalizeAddress(details.hash || details.address || '');
    const labels = new Set(manual[hash] || manual[details.hash] || []);
    const name = String(details.name || '').toLowerCase();

    if (details.is_contract) labels.add('Contract');
    else labels.add('EOA wallet');
    if (details.is_verified) labels.add('Verified');
    if (details.proxy_type || rules.proxyNameIncludes?.some(term => name.includes(term))) labels.add('Proxy');
    if (rules.routerNameIncludes?.some(term => name.includes(term))) labels.add('Router');
    if (rules.factoryNameIncludes?.some(term => name.includes(term))) labels.add('Factory');
    if (details.reputation && details.reputation !== 'ok') labels.add(`Reputation: ${details.reputation}`);
    labels.add('HoodID ready');

    return Array.from(labels);
  }

  function labelsForToken(token = {}, holderConcentration = null) {
    const labels = new Set([token.type || 'ERC-20']);
    if (token.exchange_rate) labels.add('Priced');
    if (Number(token.holders_count || 0) >= 1000) labels.add('1k+ holders');
    if (holderConcentration !== null) {
      if (holderConcentration > 50) labels.add('High concentration');
      else if (holderConcentration > 25) labels.add('Moderate concentration');
      else labels.add('Holder distribution ok');
    }
    if (token.reputation && token.reputation !== 'ok') labels.add(`Reputation: ${token.reputation}`);
    labels.add('HoodSafe ready');
    return Array.from(labels);
  }

  return { labelsForAddress, labelsForToken };
}
