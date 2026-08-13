'use strict';
// 验证 C 项：插入船的核心纯函数（航向 sin·cos 插值 / 中心线最近点 / S 形 smoothstep）。
// 不依赖数据库，直接复刻 api/inject.js 内的纯逻辑做断言。

const assert = require('assert');
const {
  closestOnLine,
  tangentAt,
  projectPointToSegment,
} = require('../lib/api/channelGeometry');
const { haversine } = require('../lib/api/geometry');

let pass = 0;
const ok = (name, cond) => {
  if (!cond) throw new Error('FAIL: ' + name);
  pass++;
  console.log('  ✓', name);
};

// 1) 航向 sin·cos 插值：359 → 1 应得 0°，而非错绕 180°
function interpolateAngle(a, b, t) {
  if (a == null) return b;
  if (b == null) return a;
  const sa = Math.sin((a * Math.PI) / 180), ca = Math.cos((a * Math.PI) / 180);
  const sb = Math.sin((b * Math.PI) / 180), cb = Math.cos((b * Math.PI) / 180);
  const s = sa + (sb - sa) * t, c = ca + (cb - ca) * t;
  let deg = (Math.atan2(s, c) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return deg;
}
ok('359→1 @0.5 = 0 (not 180)', Math.abs(interpolateAngle(359, 1, 0.5) - 0) < 1e-6);
ok('0→90 @0.5 = 45', Math.abs(interpolateAngle(0, 90, 0.5) - 45) < 1e-6);
// sin·cos 插值对短弧在 t=0.25 处接近线性但非精确线性（这是环面最短弧特性，非 bug）
ok('10→20 @0.25 接近 12.5（±1° 容差）', Math.abs(interpolateAngle(10, 20, 0.25) - 12.5) < 1);

// 2) 中心线最近点投影
const line = [[121.0, 40.0], [122.0, 40.0]];
const c = closestOnLine(121.5, 40.1, line);
ok('closestOnLine 投影点 lat≈40', Math.abs(c.point[1] - 40) < 1e-6);
ok('closestOnLine 投影点 lng≈121.5', Math.abs(c.point[0] - 121.5) < 1e-6);
ok('closestOnLine dist_m 合理(<15km)', c.dist_m < 15000);

// 3) 切线方向
const tan = tangentAt(line, 0.5);
ok('tangentAt 中点 heading≈东向(±0.5°)', Math.abs(tan.heading - 90) < 0.5);
ok('tangentAt 中点 point lng≈121.5', Math.abs(tan.point[0] - 121.5) < 1e-6);

// 4) 线段垂足：点在段内
const p = projectPointToSegment(1, 5, [0, 0], [10, 0]);
ok('projectPointToSegment t≈0.1', Math.abs(p.t - 0.1) < 1e-6);

// 5) S 形 smoothstep 单调性 & 端点
function smoothstep(u) { return u * u * (3 - 2 * u); }
ok('smoothstep(0)=0', smoothstep(0) === 0);
ok('smoothstep(1)=1', Math.abs(smoothstep(1) - 1) < 1e-9);
ok('smoothstep(0.5)=0.5', Math.abs(smoothstep(0.5) - 0.5) < 1e-9);
ok('smoothstep(0.75)>线性 (S 形中段更快)', smoothstep(0.75) > 0.75);

// 6) 端到端：模拟插入一条船，航向全程应为 359→1 平滑过渡而非 180° 错绕
const startH = 359, targetH = 1;
const seq = [];
for (let i = 0; i <= 10; i++) seq.push(interpolateAngle(startH, targetH, smoothstep(i / 10)));
// 环形相邻差（处理 359→0 边界的视觉跳变，不算真实转向）
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; };
const maxJump = Math.max(...seq.slice(1).map((v, i) => angDiff(v, seq[i])));
ok('S 形航向单步环形跳变 < 30°（无 180° 错绕）', maxJump < 30);

console.log(`\n${pass} 项断言全部通过 ✅`);
