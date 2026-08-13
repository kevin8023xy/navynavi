// 验证 interpolate.ts 与 data.js 的 A 类改动。
// 运行：npx tsx scripts/verify_interpolate.mjs
import {
  interpolateRecord,
  unwrapAngles,
  detectTurnPoints,
  headingRate,
  interpolateSpline,
} from '../src/lib/interpolate.ts';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

console.log('--- 1. 航向插值：359°→1° 不绕 180°（经 interpolateRecord）---');
// 359 -> 1，t=0.5 应≈0°（而不是 180°）
const base = [
  { mmsi: 1, lat: 0, lng: 0, sog: 10, cog: 359, heading: 359, status: 0, timestamp: 0 },
  { mmsi: 1, lat: 10, lng: 10, sog: 12, cog: 1, heading: 1, status: 0, timestamp: 100 },
];
const mid = interpolateRecord(base, 50);
// atan2 还原后可能得到 0 或 360，二者等价
const midCog = mid.cog % 360;
check('359→1 @50s cog≈0° (got ' + (mid.cog ?? -1).toFixed(2) + ')', Math.abs(midCog - 0) < 1,
  'cog=' + mid.cog);
check('359→1 @25s cog≈359.5°', Math.abs(interpolateRecord(base, 25).cog - 359.5) < 1);
check('10→100 @50s cog≈55°', Math.abs(
  interpolateRecord([
    { mmsi: 1, lat: 0, lng: 0, cog: 10, sog: 1, heading: 10, status: 0, timestamp: 0 },
    { mmsi: 1, lat: 1, lng: 1, cog: 100, sog: 1, heading: 100, status: 0, timestamp: 100 },
  ], 50).cog - 55) < 1e-6);

console.log('--- 2. unwrapAngles：消除 0/360 跳变 ---');
const unwrapped = unwrapAngles([359, 1, 3, 358]);
// 展开后相邻差应均 ≤180（连续，无突跳），而非要求单调
let continuous = true;
for (let i = 1; i < unwrapped.length; i++) {
  if (unwrapped[i] == null || unwrapped[i - 1] == null) continue;
  if (Math.abs(unwrapped[i] - unwrapped[i - 1]) > 180) continuous = false;
}
check('unwrap [359,1,3,358] 相邻差均≤180（连续无突跳） got ' + JSON.stringify(unwrapped), continuous);

console.log('--- 3. 转向点检测：不抹掉真实转向 ---');
const recs = [];
let t = 0;
for (let i = 0; i < 11; i++) recs.push({ mmsi: 1, lat: i, lng: 0, cog: 0, sog: 10, status: 0, timestamp: t++ });
for (let i = 1; i <= 10; i++) recs.push({ mmsi: 1, lat: 10, lng: i, cog: 9 * i, sog: 10, status: 0, timestamp: t++ });
for (let i = 1; i < 11; i++) recs.push({ mmsi: 1, lat: 10 + i, lng: 10, cog: 90, sog: 10, status: 0, timestamp: t++ });

const rate = headingRate(recs);
const maxRateIdx = rate.indexOf(Math.max(...rate.map(Math.abs)));
check('最大航向速率在转弯区 (idx=' + maxRateIdx + ')', maxRateIdx > 8 && maxRateIdx < 25);

const knots = detectTurnPoints(recs, { rateThresholdDegPerSec: 0.5, minSegmentSec: 1 });
check('detectTurnPoints 给出分段节点（' + knots.length + ' 个，含首尾+转弯点）',
  knots.length >= 3 && knots[0] === 0 && knots[knots.length - 1] === recs.length - 1);

const sp = interpolateSpline(recs, knots, recs[15].timestamp, { tension: 0.5 });
check('spline 在转弯中点给出合理 cog (got ' + (sp ? sp.cog.toFixed(1) : 'null') + ')',
  sp && sp.cog > 30 && sp.cog < 70);

console.log('--- 4. interpolateRecord 现有调用约定不变 ---');
check('interpolateRecord @50s lat=5', Math.abs(mid.lat - 5) < 1e-6);
check('interpolateRecord @50s lng=5', Math.abs(mid.lng - 5) < 1e-6);

console.log(`\n结果： ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
