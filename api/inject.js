'use strict';

const { queryTracks } = require('../lib/api/data');
const { bearing, haversine, angularDiff } = require('../lib/api/geometry');
const {
  closestOnLine,
  tangentAt,
  loadChannelCenterline,
} = require('../lib/api/channelGeometry');

const MOORED_STATUSES = new Set([1, 5]);
const DEFAULT_MIN_SOG = 3;
const FISHING_STATUS = 7;
const TOWING_STATUS = 11;

// 航向角 sin·cos 插值：避免 359°→1° 错绕 180°（复刻 interpolate.ts 的 interpolateAngle）
function interpolateAngle(a, b, t) {
  if (a == null) return b;
  if (b == null) return a;
  const sa = Math.sin((a * Math.PI) / 180);
  const ca = Math.cos((a * Math.PI) / 180);
  const sb = Math.sin((b * Math.PI) / 180);
  const cb = Math.cos((b * Math.PI) / 180);
  const s = sa + (sb - sa) * t;
  const c = ca + (cb - ca) * t;
  let deg = (Math.atan2(s, c) * 180) / Math.PI;
  // 归一化到 [0,360)，避免 -0 或 360 这类越界值
  deg = ((deg % 360) + 360) % 360;
  return deg;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 在时刻 t 由相邻轨迹点插值出某船位置（位置、SOG 线性；COG 走 sin·cos）
function interpolateAt(byMmsi, mmsi, t) {
  const arr = byMmsi.get(mmsi);
  if (!arr) return null;
  if (t <= arr[0].timestamp) return arr[0];
  if (t >= arr[arr.length - 1].timestamp) return arr[arr.length - 1];
  for (let i = 0; i < arr.length - 1; i++) {
    const p0 = arr[i];
    const p1 = arr[i + 1];
    if (t >= p0.timestamp && t <= p1.timestamp) {
      if (p1.timestamp === p0.timestamp) return p0;
      const u = (t - p0.timestamp) / (p1.timestamp - p0.timestamp);
      return {
        mmsi,
        lng: lerp(p0.lng, p1.lng, u),
        lat: lerp(p0.lat, p1.lat, u),
        sog: p0.sog != null && p1.sog != null ? lerp(p0.sog, p1.sog, u) : p0.sog != null ? p0.sog : p1.sog,
        cog: interpolateAngle(p0.cog, p1.cog, u),
        status: p0.status,
      };
    }
  }
  return arr[arr.length - 1];
}

// 在时刻 t 附近收集两艘参考船（沿某主轴方向、间距最大的邻居对）
function findNeighborPair(byMmsi, refMmsi, t, opts) {
  const ref = interpolateAt(byMmsi, refMmsi, t);
  if (!ref) return null;
  const neighbors = [];
  for (const mmsi of byMmsi.keys()) {
    if (mmsi === refMmsi) continue;
    const pos = interpolateAt(byMmsi, mmsi, t);
    if (!pos) continue;
    if (MOORED_STATUSES.has(pos.status)) continue;
    if (opts.minSog && pos.sog != null && pos.sog < opts.minSog) continue;
    if (opts.excludeFishing && pos.status === FISHING_STATUS) continue;
    if (opts.excludeTowing && pos.status === TOWING_STATUS) continue;
    const dist = haversine(ref.lng, ref.lat, pos.lng, pos.lat);
    if (dist > 50 && dist < 20000) {
      neighbors.push({ mmsi, pos, dist });
    }
  }
  if (neighbors.length === 0) return null;
  // 取与 ref 航向近似同向、且距离最近的邻居作"前船"
  neighbors.sort((a, b) => a.dist - b.dist);
  const ahead = neighbors[0];
  return { ref, ahead };
}

// 主处理函数：在两船之间插入一条虚拟船，沿航道中心线 S 形汇入。
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query;
    const refMmsi = q.ref_mmsi ? Number(q.ref_mmsi) : NaN;
    const t = q.t ? Number(q.t) : NaN;
    const horizonSec = q.horizon ? Math.max(60, Number(q.horizon)) : 600;
    const start_time = q.start_time;
    const end_time = q.end_time;
    const minSog = q.min_sog ? Math.max(0, parseFloat(q.min_sog) || 0) : DEFAULT_MIN_SOG;
    const wantFishing = !(q.exclude_fishing === '0' || q.exclude_fishing === 'false');
    const wantTowing = !(q.exclude_towing === '0' || q.exclude_towing === 'false');

    if (!Number.isFinite(refMmsi) || !Number.isFinite(t)) {
      return res.status(400).json({ error: 'ref_mmsi 与 t 为必填数字参数' });
    }

    const { data: tracks } = queryTracks({
      start_time,
      end_time,
      page: 1,
      page_size: 500000000,
    });
    if (tracks.length === 0) return res.json({ injected: null, reason: 'no tracks' });

    const byMmsi = new Map();
    for (const r of tracks) {
      if (!byMmsi.has(r.mmsi)) byMmsi.set(r.mmsi, []);
      byMmsi.get(r.mmsi).push(r);
    }
    for (const arr of byMmsi.values()) arr.sort((a, b) => a.timestamp - b.timestamp);

    const pair = findNeighborPair(byMmsi, refMmsi, t, {
      minSog,
      excludeFishing: wantFishing,
      excludeTowing: wantTowing,
    });
    if (!pair) return res.json({ injected: null, reason: 'no neighbor pair found' });

    // 航道中心线：优先默认文件，否则用两船连线作为临时中心线
    const centerline = loadChannelCenterline();
    const useTemp = centerline.length < 2;
    const line = useTemp
      ? [[pair.ref.pos.lng, pair.ref.pos.lat], [pair.ahead.pos.lng, pair.ahead.pos.lat]]
      : centerline;

    // ref 在中心线上的投影 → 目标切线方向（目标航向）
    const proj = closestOnLine(pair.ref.pos.lng, pair.ref.pos.lat, line);
    const tangent = tangentAt(line, proj.s / totalLength(line));
    const targetHeading = tangent.heading;

    // 判断"是否在航道里"：距离中心线 < 阈值（500m）视为在航道里
    const inChannel = proj.dist_m < 500;
    // 航向是否贴合航道（与切线夹角 < 30°）
    const headingAligned =
      pair.ref.pos.cog == null ||
      angularDiff(pair.ref.pos.cog, targetHeading) < 30;

    // 在两船之间取一个插入点：沿 ref→ahead 连线，距 ref 约 40% 处（S 形从旁汇入）
    const frac = 0.4;
    const insLng = lerp(pair.ref.pos.lng, pair.ahead.pos.lng, frac);
    const insLat = lerp(pair.ref.pos.lat, pair.ahead.pos.lat, frac);

    // 生成一段 S 形汇入轨迹（horizonSec 内逐步转向到 targetHeading 并贴近中心线）
    const steps = 10;
    const injected = [];
    const startHeading = pair.ref.pos.cog != null ? pair.ref.pos.cog : targetHeading;
    const startSog = pair.ref.pos.sog != null ? pair.ref.pos.sog : 8;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      // S 形：航向用 sin·cos 平滑过渡（非线性，中段偏折最大），避免直补 359→1 环绕
      const h = interpolateAngle(startHeading, targetHeading, smoothstep(u));
      // 位置：先向插入点靠拢，再贴近中心线（用切线方向移动）
      const toIns = 1 - u;
      const lng = lerp(insLng, tangent.point[0], 1 - toIns);
      const lat = lerp(insLat, tangent.point[1], 1 - toIns);
      const sog = lerp(startSog, startSog * 0.9, u);
      injected.push({
        step: i,
        t: Math.round(t + u * horizonSec),
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        cog: Number(h.toFixed(1)),
        sog: Number(sog.toFixed(1)),
        in_channel: inChannel,
      });
    }

    return res.json({
      ref_mmsi: refMmsi,
      t,
      neighbor_mmsi: pair.ahead.mmsi,
      neighbor_dist_m: Number(pair.ahead.dist.toFixed(1)),
      channel: {
        used_temp_centerline: useTemp,
        ref_dist_to_centerline_m: Number(proj.dist_m.toFixed(1)),
        in_channel: inChannel,
        target_heading_deg: Number(targetHeading.toFixed(1)),
        heading_aligned: headingAligned,
      },
      injected,
    });
  } catch (err) {
    console.error('[inject] Error:', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};

// 平滑阶跃（S 形）：中段偏折最明显，端点在 0/1
function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

function totalLength(line) {
  let len = 0;
  for (let i = 0; i < line.length - 1; i++) {
    len += haversine(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
  }
  return len;
}
