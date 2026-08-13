// 验证 B 项过滤逻辑。
// 运行：npx tsx scripts/verify_filter.mjs
import { filterVesselsByMmsi } from '../src/lib/aisData.ts';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + ' ' + extra); }
}

console.log('--- 1. 3kn 以下：全程均值 < 3 才排除 ---');
const slow = [
  { mmsi: 1, lat: 0, lng: 0, sog: 1, cog: 0, status: 0, timestamp: 0 },
  { mmsi: 1, lat: 1, lng: 1, sog: 2, cog: 0, status: 0, timestamp: 10 },
];
const fast = [
  { mmsi: 2, lat: 0, lng: 0, sog: 8, cog: 0, status: 0, timestamp: 0 },
  { mmsi: 2, lat: 1, lng: 1, sog: 12, cog: 0, status: 0, timestamp: 10 },
];
// 进港减速船：部分帧 <3，但均值 >3，应保留
const decel = [
  { mmsi: 3, lat: 0, lng: 0, sog: 10, cog: 0, status: 0, timestamp: 0 },
  { mmsi: 3, lat: 1, lng: 1, sog: 2, cog: 0, status: 0, timestamp: 10 },
  { mmsi: 3, lat: 2, lng: 2, sog: 9, cog: 0, status: 0, timestamp: 20 },
];
const all = [...slow, ...fast, ...decel];
const keep = filterVesselsByMmsi(all, { minSogKn: 3 });
check('全程慢速船(mmsi=1)被排除', !keep.has(1));
check('正常船(mmsi=2)保留', keep.has(2));
check('进港减速船(mmsi=3)保留（均值>3）', keep.has(3));

console.log('--- 2. 渔船(status=7)整条排除 ---');
const fishing = [
  { mmsi: 10, lat: 0, lng: 0, sog: 6, cog: 0, status: 7, timestamp: 0 },
  { mmsi: 10, lat: 1, lng: 1, sog: 6, cog: 0, status: 7, timestamp: 10 },
];
const keep2 = filterVesselsByMmsi([...fishing, ...fast], { excludeFishing: true });
check('渔船(mmsi=10)被排除', !keep2.has(10));
check('关掉 excludeFishing 后渔船保留', filterVesselsByMmsi(fishing, { excludeFishing: false }).has(10));

console.log('--- 3. 拖带(status=11)整条排除 ---');
const towing = [
  { mmsi: 20, lat: 0, lng: 0, sog: 5, cog: 0, status: 11, timestamp: 0 },
  { mmsi: 20, lat: 1, lng: 1, sog: 5, cog: 0, status: 11, timestamp: 10 },
];
const keep3 = filterVesselsByMmsi([...towing, ...fast], { excludeTowing: true });
check('拖带船(mmsi=20)被排除', !keep3.has(20));

console.log('--- 4. 单帧渔船不算整条渔船（应保留） ---');
const mixed = [
  { mmsi: 30, lat: 0, lng: 0, sog: 8, cog: 0, status: 0, timestamp: 0 },
  { mmsi: 30, lat: 1, lng: 1, sog: 8, cog: 0, status: 7, timestamp: 10 },
];
check('仅一帧渔船状态的船保留', filterVesselsByMmsi(mixed, { excludeFishing: true }).has(30));

console.log(`\n结果： ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
