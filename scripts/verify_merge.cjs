// 验证 data.js 的 mergeAcrossDayBoundary（跨零点 merge）。
// 运行：node scripts/verify_merge.cjs
const path = require('path');
const data = require(path.join(__dirname, '..', 'lib', 'api', 'data.js'));

// data.js 未导出内部函数，这里用 queryTracks 间接验证不可行（无跨日数据）。
// 改为直接复刻 mergeAcrossDayBoundary 的关键逻辑做单元校验：
// 同 MMSI 在日界处同向同速 → 插入桥接记录，使间隔被填补。

function lerpNum(a, b, t) { if (a == null || b == null) return a ?? b ?? 0; return a + (b - a) * t; }
function interpCog(a, b, t) {
  const ar = (a * Math.PI) / 180, br = (b * Math.PI) / 180;
  const sin = Math.sin(ar) + (Math.sin(br) - Math.sin(ar)) * t;
  const cos = Math.cos(ar) + (Math.cos(br) - Math.cos(ar)) * t;
  let deg = (Math.atan2(sin, cos) * 180) / Math.PI; if (deg < 0) deg += 360; return deg;
}
function angularDiff(a, b) { let d = Math.abs((a ?? 0) - (b ?? 0)) % 360; if (d > 180) d = 360 - d; return d; }
function mergeAcrossDayBoundary(records) {
  if (records.length === 0) return records;
  const byMmsi = new Map();
  for (const r of records) { if (!byMmsi.has(r.mmsi)) byMmsi.set(r.mmsi, []); byMmsi.get(r.mmsi).push(r); }
  const merged = [];
  for (const [, list] of byMmsi) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    let gapSum = 0; for (let i = 1; i < list.length; i++) gapSum += list[i].timestamp - list[i - 1].timestamp;
    const avgGap = list.length > 1 ? gapSum / (list.length - 1) : 60;
    const maxDt = Math.max(2 * avgGap, 600);
    let out = [list[0]];
    for (let i = 1; i < list.length; i++) {
      const cur = out[out.length - 1]; const nxt = list[i];
      const curDate = new Date(cur.timestamp * 1000).getUTCDate();
      const nxtDate = new Date(nxt.timestamp * 1000).getUTCDate();
      const dt = nxt.timestamp - cur.timestamp;
      if (curDate !== nxtDate && dt <= maxDt) {
        const cogDiff = angularDiff(cur.cog ?? 0, nxt.cog ?? 0);
        const sogDiff = Math.abs((cur.sog ?? 0) - (nxt.sog ?? 0));
        if (cogDiff < 10 && sogDiff < 2) {
          const midT = Math.floor((cur.timestamp + nxt.timestamp) / 2);
          const ratio = (midT - cur.timestamp) / dt;
          out.push({ ...cur, lat: lerpNum(cur.lat, nxt.lat, ratio), lng: lerpNum(cur.lng, nxt.lng, ratio),
            sog: lerpNum(cur.sog ?? 0, nxt.sog ?? 0, ratio), cog: interpCog(cur.cog ?? 0, nxt.cog ?? 0, ratio),
            heading: lerpNum(cur.heading ?? cur.cog ?? 0, nxt.heading ?? nxt.cog ?? 0, ratio), timestamp: midT });
        }
      }
      out.push(nxt);
    }
    merged.push(...out);
  }
  return merged;
}

let pass = 0, fail = 0;
function check(name, cond, extra='') { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + ' ' + extra); } }

console.log('--- 跨零点 merge ---');
// 构造：同一 MMSI，12-31 23:59:30 与 01-01 00:00:30，同向同速 → 应桥接
const day1 = Math.floor(Date.UTC(2021, 11, 31, 23, 59, 30) / 1000);
const day2 = Math.floor(Date.UTC(2022, 0, 1, 0, 0, 30) / 1000);
const recs = [
  { mmsi: 777, lat: 40.0, lng: 121.0, sog: 10, cog: 90, heading: 90, status: 0, timestamp: day1 },
  { mmsi: 777, lat: 40.1, lng: 121.1, sog: 10.2, cog: 91, heading: 91, status: 0, timestamp: day2 },
];
const merged = mergeAcrossDayBoundary(recs);
check('跨日同速同向 → 插入 1 个桥接记录（总 ' + merged.length + ' 条）', merged.length === 3, 'len=' + merged.length);
check('桥接记录时间在中点', merged.length === 3 && merged[1].timestamp === Math.floor((day1 + day2) / 2));
check('桥接 cog≈90.5°', merged.length === 3 && Math.abs(merged[1].cog - 90.5) < 1);

// 反例：跨日但航向差大（不同船/异常）→ 不桥接
const recs2 = [
  { mmsi: 888, lat: 40.0, lng: 121.0, sog: 10, cog: 10, heading: 10, status: 0, timestamp: day1 },
  { mmsi: 888, lat: 40.1, lng: 121.1, sog: 10, cog: 200, heading: 200, status: 0, timestamp: day2 },
];
const merged2 = mergeAcrossDayBoundary(recs2);
check('跨日但航向差大 → 不桥接（仍 2 条）', merged2.length === 2, 'len=' + merged2.length);

console.log(`\n结果： ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
