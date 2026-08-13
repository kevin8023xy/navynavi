'use strict';

// 航道中心线的几何工具：把任意点投影到中心线上、求最近点、切线方向（用于判断"是否在航道里"与给出目标航向）。
// 复用地理解 bearing/haversine，坐标系约定经纬度为 [lng, lat]。

const fs = require('fs');
const path = require('path');
const { bearing, haversine } = require('./geometry');

// 沿线最近点：遍历中心线相邻节点，求点到每段线段的垂足（按经纬差近似），
// 返回 { dist_m, t(段内归一化比例), segIndex, point:[lng,lat], s(沿轴累计弧长 m) }
function closestOnLine(lng, lat, line) {
  let best = null;
  let acc = 0; // 沿轴累计弧长
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = haversine(a[0], a[1], b[0], b[1]);
    const proj = projectPointToSegment(lng, lat, a, b);
    const dist = haversine(lng, lat, proj.point[0], proj.point[1]);
    const s = acc + proj.t * segLen;
    if (!best || dist < best.dist_m) {
      best = {
        dist_m: dist,
        t: proj.t,
        segIndex: i,
        point: proj.point,
        s,
        segLen,
      };
    }
    acc += segLen;
  }
  return best;
}

// 点到线段 (a->b) 的垂足（局部笛卡尔近似，单位：经纬差）
function projectPointToSegment(lng, lat, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const denom = abx * abx + aby * aby;
  let t = 0;
  if (denom > 1e-18) {
    t = ((lng - a[0]) * abx + (lat - a[1]) * aby) / denom;
    t = Math.max(0, Math.min(1, t));
  }
  return { t, point: [a[0] + abx * t, a[1] + aby * t] };
}

// 中心线在归一化弧长比例 u∈[0,1] 处的位置与切线方向（度）。
// 用于让插入船沿中心线行进，切线方向即目标 COG/HDG。
function tangentAt(line, u) {
  const n = line.length - 1;
  const f = Math.max(0, Math.min(1, u)) * n;
  let i = Math.floor(f);
  if (i >= n) i = n - 1;
  const localT = f - i;
  const a = line[i];
  const b = line[i + 1];
  const point = [a[0] + (b[0] - a[0]) * localT, a[1] + (b[1] - a[1]) * localT];
  const heading = bearing(a[0], a[1], b[0], b[1]);
  return { point, heading, segIndex: i };
}

// 加载默认的航道中心线 geojson（public/data/channel-centerline.geojson）。
// 文件不存在时返回 []，由调用方决定 fallback（用 crossings 线或显式传入）。
function loadChannelCenterline() {
  const dirs = [
    path.join(process.cwd(), 'public', 'data'),
    path.join('/var/task', 'public', 'data'),
    path.join(__dirname, '..', 'public', 'data'),
  ];
  for (const dir of dirs) {
    const p = path.join(dir, 'channel-centerline.geojson');
    if (fs.existsSync(p)) {
      const geo = JSON.parse(fs.readFileSync(p, 'utf-8'));
      // 支持 LineString 或 FeatureCollection 内含 LineString
      if (geo.type === 'LineString') return geo.coordinates;
      if (geo.type === 'FeatureCollection') {
        const ls = geo.features.find(
          (f) => f.geometry && f.geometry.type === 'LineString',
        );
        if (ls) return ls.geometry.coordinates;
      }
    }
  }
  return [];
}

module.exports = {
  closestOnLine,
  tangentAt,
  loadChannelCenterline,
  projectPointToSegment,
};
