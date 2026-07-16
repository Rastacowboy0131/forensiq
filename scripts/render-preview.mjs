import sharp from 'sharp';

const W = 1280;
const H = 2048;
const green = '#35ff88';
const bg = '#031009';
const panel = '#071b10';
const panel2 = '#0a2014';
const border = '#155f36';
const text = '#effff4';
const muted = '#a6bdaa';
const blue = '#72b9ff';

const tokens = [
  ['USDE', 'Ethena USDe', '$0.999735', '$4,025,419,543', '$122,002,722', '1,308', '0x5d3a…ef34'],
  ['USDG', 'Global Dollar', '$1.001', '$3,162,534,459', '$278,932,552', '21,905', '0x5fc5…d168'],
  ['VIRTUAL', 'Virtuals Protocol', '$0.612034', '$402,257,858', '$93,825,329', '5,764', '0xc691…9c31'],
  ['CASHCAT', 'Cash Cat', '$0.107229', '$106,304,681', '$74,347,683', '30,482', '0x020b…18b4'],
  ['SYRUPUSDG', 'syrupUSDG', '$0.999641', '$93,224,935', '$944', '53', '0x4085…74f7'],
  ['NPC', 'Non-Playable Coin', '$0.006916', '$55,685,997', '$3,822,071', '36', '0x241F…0024'],
  ['WETH', 'WETH', '$1,913.78', '$37,260,637', '$17,446,609', '128,599', '0x0Bd7…AD73'],
  ['UP', 'up', '$0.072777', '$36,415,798', '$338,973', '494', '0x57C0…B4F1']
];

const txs = [
  ['0x7127…7666', 'dagSwapByOrderId', '0x850f…435c', 'DexRouter'],
  ['0xe1d7…c690', 'fulfill', '0x5915…7941', 'KeeperRandomnessCoordj'],
  ['0xe7eb…3765', 'approve', '0xA1A8…8034', 'The Amphibian'],
  ['0x1e50…4d93', '0x00000000', '0xEd57…234F', '0x7F6e…84f4'],
  ['0x2c63…945b', 'success', '0x8647…095E', '0xAcAB…568a'],
  ['0xc6da…15a5', 'execute', '0x7Cd9…CD61', 'UniversalRouter']
];

const blocks = [
  ['10878774', '5', '222,521', '3s ago'],
  ['10878773', '6', '512,626', '3s ago'],
  ['10878769', '8', '1,034,594', '4s ago'],
  ['10878768', '10', '758,001', '4s ago']
];

function esc(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function textEl(x,y,s,size=18,fill=text,weight=600,extra='') { return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="Inter, Arial, sans-serif" ${extra}>${esc(s)}</text>`; }
function rect(x,y,w,h,r=22,fill=panel,stroke=border,sw=1) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; }
function pill(x,y,w,h,label,fill='rgba(53,255,136,.07)',stroke=border,color=muted) { return `${rect(x,y,w,h,h/2,fill,stroke)}${textEl(x+16,y+h/2+6,label,16,color,500)}`; }

let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#04150c"/><stop offset=".55" stop-color="#062c15"/><stop offset="1" stop-color="#020604"/></linearGradient>
  <radialGradient id="glow" cx="80%" cy="20%" r="60%"><stop offset="0" stop-color="#0aa84e" stop-opacity=".75"/><stop offset="1" stop-color="#031009" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect x="0" y="0" width="${W}" height="78" fill="#020604" opacity=".9"/>
${rect(48,17,44,44,14,'#5dff9d','#5dff9d')}
${textEl(61,46,'HS',14,'#031009',900)}
${textEl(105,35,'HoodScan',18,text,800)}
${textEl(105,55,'Hood Chain explorer',14,muted,500)}
${pill(898,19,80,38,'Tokens')}
${pill(988,19,124,38,'New deploys')}
${pill(1122,19,110,38,'Blockscout')}

${pill(20,201,324,31,'LIVE DATA · robinhoodchain.blockscout.com','rgba(53,255,136,.08)',border,green)}
${textEl(20,321,'Search the chain. Track the',84,text,900)}
${textEl(20,402,'wallets. Scan before you ape.',84,text,900)}
${textEl(20,453,'Solscan-style explorer UI for Hood Chain: wallets, tokens, transactions, holders,',22,muted,500)}
${textEl(20,485,'contracts, deployers, and HoodID-ready identity hooks.',22,muted,500)}
${rect(20,516,766,52,16,'#031009',border)}
${textEl(38,548,'Search wallet, tx, token, block, symbol, or .hood name',16,'#789181',500)}
${rect(798,516,82,52,16,'#63ffa0','#63ffa0')}${textEl(817,549,'Search',14,'#031009',800)}
${pill(20,581,116,36,'Search HOOD')}${pill(146,581,130,36,'Search HOODID')}${pill(286,581,142,36,'Search HOODRAT')}
`;

const metrics = [
  ['Total transactions','79,364,605','Blockscout live'], ['Total addresses','2,229,735','wallets/contracts'], ['Daily transactions','10,514,753','today'], ['Average block time','0.1s','Gas avg 0.07 gwei']
];
metrics.forEach((m,i)=>{ const x=20+i*314; svg += `${rect(x,650,298,112,18,panel2,border)}${textEl(x+18,680,m[0],14,muted,500)}${textEl(x+18,720,m[1],34,text,900)}${textEl(x+18,743,m[2],14,muted,500)}`; });

svg += `${rect(20,780,1240,628,20,'#06150d',border)}${textEl(38,819,'Trending / top tokens',26,text,900)}${pill(1154,795,88,30,'View tokens','rgba(53,255,136,.08)',border,green)}
<line x1="38" y1="843" x2="1242" y2="843" stroke="${border}"/>
${textEl(52,869,'TOKEN',13,muted,800,'letter-spacing="2"')}${textEl(302,869,'PRICE',13,muted,800,'letter-spacing="2"')}${textEl(432,869,'MARKET CAP',13,muted,800,'letter-spacing="2"')}${textEl(605,869,'24H VOLUME',13,muted,800,'letter-spacing="2"')}${textEl(762,869,'HOLDERS',13,muted,800,'letter-spacing="2"')}${textEl(878,869,'CONTRACT',13,muted,800,'letter-spacing="2"')}${textEl(1040,869,'ACTIONS',13,muted,800,'letter-spacing="2"')}`;
let y=904;
tokens.forEach((t,i)=>{ svg += `<line x1="38" y1="${y-18}" x2="1242" y2="${y-18}" stroke="${border}" opacity=".85"/>${rect(52,y-2,28,28,14,i%2?'#a6d84c':'#dfe8e1','#2b4b36')}${textEl(92,y+16,t[0],16,green,900)}${textEl(92,y+38,t[1],14,muted,500)}${textEl(302,y+18,t[2],16,text,700)}${textEl(432,y+18,t[3],16,text,700)}${textEl(605,y+18,t[4],16,text,700)}${textEl(762,y+18,t[5],16,text,700)}${textEl(878,y+18,t[6],16,green,800)}${pill(1040,y,48,28,'Copy','rgba(255,255,255,.03)',border,muted)}${pill(1096,y,96,28,'Blockscout ↗','rgba(114,185,255,.05)',border,blue)}`; y+=63; });

svg += `${rect(20,1425,612,492,20,'#06150d',border)}${textEl(38,1464,'Latest transactions',26,text,900)}${pill(576,1442,40,28,'live','rgba(53,255,136,.08)',border,green)}<line x1="38" y1="1488" x2="615" y2="1488" stroke="${border}"/>${textEl(52,1515,'TXN',13,muted,800)}${textEl(148,1515,'METHOD / STATUS',13,muted,800)}${textEl(310,1515,'FROM',13,muted,800)}${textEl(406,1515,'TO',13,muted,800)}`;
y=1556; txs.forEach(t=>{ svg+=`<line x1="38" y1="${y-26}" x2="615" y2="${y-26}" stroke="${border}"/>${textEl(52,y,t[0],16,green,800)}${pill(148,y-20,132,28,t[1],'rgba(53,255,136,.05)',border,green)}${textEl(310,y,t[2],16,green,800)}${textEl(406,y,t[3],16,green,800)}`; y+=98; });

svg += `${rect(648,1425,612,492,20,'#06150d',border)}${textEl(666,1464,'Latest batches / blocks',26,text,900)}<line x1="666" y1="1488" x2="1242" y2="1488" stroke="${border}"/>${textEl(680,1515,'BLOCK',13,muted,800)}${textEl(836,1515,'TXN',13,muted,800)}${textEl(920,1515,'GAS USED',13,muted,800)}${textEl(1066,1515,'AGE',13,muted,800)}${textEl(1178,1515,'ACTIONS',13,muted,800)}`;
y=1560; blocks.forEach(b=>{ svg+=`<line x1="666" y1="${y-28}" x2="1242" y2="${y-28}" stroke="${border}"/>${textEl(680,y,b[0],17,green,800)}${textEl(836,y,b[1],17,text,700)}${textEl(920,y,b[2],17,text,700)}${textEl(1066,y,b[3],17,text,700)}${pill(1180,y-22,48,28,'Copy','rgba(255,255,255,.03)',border,muted)}`; y+=56; });

svg += `<rect x="0" y="1942" width="1280" height="1" fill="${border}"/>${pill(322,1975,138,34,'HoodScan MVP')}${pill(478,1975,220,34,'Powered by Blockscout API')}${pill(716,1975,242,34,'HoodID integration layer ready')}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('/Users/rasta/hoodscan/hoodscan-home-preview.png');
console.log('/Users/rasta/hoodscan/hoodscan-home-preview.png');
