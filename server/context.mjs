import { createBlockscoutProvider } from './providers/blockscout.mjs';
import { createRpcProvider } from './providers/rpc.mjs';
import { createHoodIdProvider } from './providers/hoodid.mjs';
import { createLabelService } from './services/labels.mjs';
import { createExplorerService } from './services/explorer.mjs';
import { createEventService } from './services/events.mjs';
import { createDbClient } from './db/client.mjs';
import { createRealtimeService } from './services/realtime.mjs';
import { createMarketIntelService } from './services/market-intel.mjs';
import { createHoodSafeService } from './services/hoodsafe.mjs';
import { createTokenIntelService } from './services/token-intel.mjs';

export function createAppContext(config) {
  const blockscout = createBlockscoutProvider(config);
  const rpc = createRpcProvider(config);
  const hoodId = createHoodIdProvider(config);
  const labels = createLabelService(config);
  const db = createDbClient(config);
  const explorer = createExplorerService({ blockscout, rpc, hoodId, labels });
  const events = createEventService(config);
  const realtime = createRealtimeService({ db, blockscout, rpc, events });
  const marketIntel = createMarketIntelService({ blockscout });
  const hoodsafe = createHoodSafeService({ blockscout, marketIntel });
  const tokenIntel = createTokenIntelService({ blockscout });
  return { config, db, blockscout, rpc, hoodId, labels, explorer, events, realtime, marketIntel, hoodsafe, tokenIntel };
}
