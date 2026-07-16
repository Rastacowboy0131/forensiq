import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath, fallback) {
  try {
    const raw = await readFile(path.join(rootDir, relativePath), 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function loadConfig() {
  const contracts = await readJson('config/contracts.json', {});
  const labels = await readJson('config/labels.json', { manual: {}, rules: {} });
  const alphaWallets = await readJson('config/alpha-wallets.json', null)
    || await readJson('config/alpha-wallets.example.json', { wallets: [] });

  return {
    rootDir,
    port: Number(process.env.HOODSCAN_PORT || process.env.PORT || 5177),
    chainId: Number(process.env.HOODSCAN_CHAIN_ID || contracts?.chain?.chainId || 0) || null,
    blockscoutOrigin: process.env.HOODSCAN_BLOCKSCOUT_API_URL || process.env.BLOCKSCOUT_ORIGIN || contracts?.chain?.blockscoutOrigin || 'https://robinhoodchain.blockscout.com',
    quickNode: {
      rpcUrl: process.env.HOODSCAN_RPC_HTTP_URL || process.env.QUICKNODE_RPC_URL || process.env.HOODCHAIN_RPC_URL || '',
      wsUrl: process.env.HOODSCAN_RPC_WS_URL || process.env.QUICKNODE_WS_URL || '',
      webhookSecret: process.env.QUICKNODE_WEBHOOK_SECRET || ''
    },
    hoodId: {
      registryAddress: process.env.HOODID_REGISTRY_ADDRESS || contracts?.hoodId?.registryAddress || '',
      profileBaseUrl: process.env.HOODID_PROFILE_BASE_URL || contracts?.hoodId?.profileBaseUrl || 'https://www.hoodid.domains/'
    },
    databaseUrl: process.env.DATABASE_URL || 'file:./data/hoodscan.sqlite',
    indexerPollMs: Number(process.env.INDEXER_POLL_MS || 2500),
    freeAlertDelayMinutes: Number(process.env.FREE_ALERT_DELAY_MINUTES || 20),
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      freeChatId: process.env.FREE_ALERT_CHAT_ID || '',
      premiumChatId: process.env.PREMIUM_ALERT_CHAT_ID || ''
    },
    contracts,
    labels,
    alphaWallets
  };
}
