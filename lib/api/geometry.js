'use strict';

// 纯函数几何工具，供 crossings / spacing API 复用。
// 坐标系约定：传入的经纬度为 [lng, lat]，与 geojson 一致。

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// 线段 (p1->p2) 与 (a->b) 是否相交，返回交点在 p1->p2 上的归一化比例 t。
// p/a 为 [lng, lat]。无交点返回 { cross:false }。
function segmentsIntersect(p1, p2, a, b) {
  const r = [p2[0] - p1[0], p2[1] - p1[1]];
  const s = [b[0] - a[0], b[1] - a[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-12) return { cross: false }; // 平行或共线
  const qp = [a[0] - p1[0], a[1] - p1[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { cross: true, t, u };
  }
  return { cross: false };
}

// 大圆初始方位角（度，0~360），输入 [lng, lat]
function bearing(lng1, lat1, lng2, lat2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

// 两点大圆距离（米），输入 [lng, lat]
function haversine(lng1, lat1, lng2, lat2) {
  const R = 6371000;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = toRad(lat2 - lat1);
  const dλ = toRad(lng2 - lng1);
  const a =
    Math.sin(dφ / 2) * Math.sin(dφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ray-casting 判断点是否在多边形内。point=[lng,lat]，ring=[[lng,lat],...]
function pointInPolygon(point, ring) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 把点投影到以 origin 为起点、方位角 axisBearing(度) 为方向的主轴上，
// 返回沿轴的带符号标量距离（米）。点、origin 为 [lng,lat]。
function projectOntoAxis(lng, lat, originLng, originLat, axisBearing) {
  const θ = toRad(axisBearing);
  // 主轴的单位方向向量（在局部经纬差近似下）
  const dxAxis = Math.sin(θ); // 沿经度方向分量
  const dyAxis = Math.cos(θ); // 沿纬度方向分量
  // 把经纬差按赤道/经线弧长换算成米，避免高纬经度压缩
  const dLng = (lng - originLng) * Math.cos(toRad(originLat)) * 111320;
  const dLat = (lat - originLat) * 110540;
  return dLng * dxAxis + dLat * dyAxis;
}

// 航向角合并：用于把相近的 COG 归为同一股流。处理 0/360 环绕。
function angularDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

module.exports = {
  segmentsIntersect,
  bearing,
  haversine,
  pointInPolygon,
  projectOntoAxis,
  angularDiff,
};
