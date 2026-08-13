// 验证 api/spacing.js 的 ships 过滤分支（复刻关键逻辑）。
// 运行：node scripts/verify_spacing_filter.cjs
const MOORED_STATUSES = new Set([1, 5]);
const DEFAULT_MIN_SOG = 3;
const FISHING_STATUS = 7;
const TOWING_STATUS = 11;

function collectShips(byMmsiKeys, t, opts) {
  const {
    wantMoored = false,
    minSog = DEFAULT_MIN_SOG,
    wantFishing = true,
    wantTowing = true,
    mmsiPrefixes = [],
  } = opts;
  const ships = [];
  for (const mmsi of byMmsiKeys) {
    if (mmsiPrefixes.length > 0) {
      const mStr = String(mmsi);
      if (!mmsiPrefixes.some((p) => mStr.startsWith(p))) continue;
    }
    const pos = { mmsi, sog: opts.sogMap[mmsi], status: opts.statusMap[mmsi] };
    if (!wantMoored && MOORED_STATUSES.has(pos.status)) continue;
    if (pos.sog != null && pos.sog < minSog) continue;
    if (wantFishing && pos.status === FISHING_STATUS) continue;
    if (wantTowing && pos.status === TOWING_STATUS) continue;
    ships.push(mmsi);
  }
  return ships;
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + ' ' + extra); }
}

console.log('--- spacing ships 过滤 ---');
const keys = [101, 102, 103, 104, 105, 412001, 413002];
const sogMap = { 101: 1, 102: 10, 103: 8, 104: 9, 105: 7, 412001: 12, 413002: 11 };
const statusMap = { 101: 0, 102: 0, 103: 7, 104: 11, 105: 5, 412001: 0, 413002: 0 };

// 默认：排除 101(<3kn), 103(渔船), 104(拖带), 105(锚泊)
let res = collectShips(keys, 0, { sogMap, statusMap });
check('默认排除低速/渔船/拖轮/锚泊，保留 102,412001,413002',
  JSON.stringify(res.sort()) === JSON.stringify([102, 412001, 413002].sort()), 'got ' + JSON.stringify(res));

// 含锚泊
res = collectShips(keys, 0, { sogMap, statusMap, wantMoored: true });
check('含锚泊后 105 进入', res.includes(105) && !res.includes(101));

// MMSI 前缀 41
res = collectShips(keys, 0, { sogMap, statusMap, mmsiPrefixes: ['41'] });
check('MMSI 前缀 41 → 仅 412001,413002', JSON.stringify(res.sort()) === JSON.stringify([412001, 413002].sort()),
  'got ' + JSON.stringify(res));

// 关闭渔船/拖轮排除
res = collectShips(keys, 0, { sogMap, statusMap, wantFishing: false, wantTowing: false });
check('关闭渔船/拖轮排除 → 含 103,104', res.includes(103) && res.includes(104));

console.log(`\n结果： ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
