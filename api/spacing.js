'use strict';

const fs = require('fs');
const path = require('path');
const { queryTracks } = require('../lib/api/data');
const {
  pointInPolygon,
  projectOntoAxis,
  angularDiff,
} = require('../lib/api/geometry');

// 读取 zone-polygon.geojson，返回 [{ id, ring:[[lng,lat]...] }]
function loadZones() {
  const dirs = [
    path.join(process.cwd(), 'public', 'data'),
    path.join('/var/task', 'public', 'data'),
    path.join(__dirname, '..', 'public', 'data'),
  ];
  for (const dir of dirs) {
    const p = path.join(dir, 'zone-polygon.geojson');
    if (fs.existsSync(p)) {
      const geo = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return geo.features.map((f) => ({
        id: f.properties && f.properties.id,
        ring: f.geometry.coordinates[0],
      }));
    }
  }
  return [];
}

// 锚泊/停泊状态：1=at anchor, 5=moored（按需求排除，避免间距被静止船拉偏）
const MOORED_STATUSES = new Set([1, 5]);

// 低速船（3kn 以下）/ 渔船 / 拖轮默认排除，对应地图显示规则。
// 数据仅有 Navigational Status（无 shiptype），故渔船/拖轮按 status 近似：
//   7  = engaged in fishing
//   11 = power-driven vessel towing
const DEFAULT_MIN_SOG = 3;
const FISHING_STATUS = 7;
const TOWING_STATUS = 11;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 在时刻 t 由相邻轨迹点线性插值出某船位置（取最接近 t 的前后可用的点）
function interpolateAt(tracksByMmsi, mmsi, t) {
  const arr = tracksByMmsi.get(mmsi);
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
        sog: p0.sog != null && p1.sog != null ? lerp(p0.sog, p1.sog, u) : (p0.sog != null ? p0.sog : p1.sog),
        cog: p0.cog != null ? p0.cog : p1.cog,
        status: p0.status,
      };
    }
  }
  return arr[arr.length - 1];
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      start_time,
      end_time,
      zone_id,
      frame_sec,
      include_moored,
      min_sog,
      exclude_fishing,
      exclude_towing,
      mmsi_prefix,
    } = req.query;

    const startTs =
      start_time && typeof start_time === 'string'
        ? parseInt(start_time, 10)
        : undefined;
    const endTs =
      end_time && typeof end_time === 'string'
        ? parseInt(end_time, 10)
        : undefined;
    const frameSec =
      frame_sec && typeof frame_sec === 'string'
        ? Math.max(1, parseInt(frame_sec, 10) || 60)
        : 60;
    const wantMoored =
      include_moored === '1' || include_moored === 'true';
    // 低速船阈值（单帧 SOG 低于此值不计入航道分析）
    const minSog =
      min_sog && typeof min_sog === 'string'
        ? Math.max(0, parseFloat(min_sog) || 0)
        : DEFAULT_MIN_SOG;
    const wantFishing =
      !(exclude_fishing === '0' || exclude_fishing === 'false');
    const wantTowing =
      !(exclude_towing === '0' || exclude_towing === 'false');
    // MMSI 前缀白名单（如 ^41[234]），逗号分隔多个；空则不限制
    const mmsiPrefixes =
      mmsi_prefix && typeof mmsi_prefix === 'string' && mmsi_prefix.trim()
        ? mmsi_prefix.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    // 全量轨迹（按时间升序）
    const { data: tracks } = queryTracks({
      start_time,
      end_time,
      page: 1,
      page_size: 500000000,
    });

    if (tracks.length === 0) {
      return res.json({ frames: 0, summary: null, frames_detail: [] });
    }

    // 按 mmsi 分组并按时间排序
    const byMmsi = new Map();
    for (const r of tracks) {
      if (!byMmsi.has(r.mmsi)) byMmsi.set(r.mmsi, []);
      byMmsi.get(r.mmsi).push(r);
    }
    for (const arr of byMmsi.values()) {
      arr.sort((a, b) => a.timestamp - b.timestamp);
    }

    const globalMin = Math.min(
      ...Array.from(byMmsi.values()).map((a) => a[0].timestamp),
    );
    const globalMax = Math.max(
      ...Array.from(byMmsi.values()).map((a) => a[a.length - 1].timestamp),
    );
    const tStart = startTs != null ? Math.max(startTs, globalMin) : globalMin;
    const tEnd = endTs != null ? Math.min(endTs, globalMax) : globalMax;

    // 选 zone
    const allZones = loadZones();
    let zones = allZones;
    if (zone_id && typeof zone_id === 'string' && zone_id.trim()) {
      const ids = zone_id.split(',').map((s) => parseInt(s.trim(), 10));
      zones = allZones.filter((z) => ids.includes(z.id));
    }

    const frames_detail = [];
    const allGapsM = [];
    const allTimeGapsS = [];

    for (const zone of zones) {
      const frameCount = Math.floor((tEnd - tStart) / frameSec);
      for (let f = 0; f <= frameCount; f++) {
        const t = tStart + f * frameSec;

        // 收集本帧在 zone 内的船
        const ships = [];
        for (const mmsi of byMmsi.keys()) {
          // MMSI 前缀白名单过滤（对应需求：MMSIXXXXXXXX 区域）
          if (mmsiPrefixes.length > 0) {
            const mStr = String(mmsi);
            if (!mmsiPrefixes.some((p) => mStr.startsWith(p))) continue;
          }
          const pos = interpolateAt(byMmsi, mmsi, t);
          if (!pos) continue;
          if (!wantMoored && MOORED_STATUSES.has(pos.status)) continue;
          // 低速船（3kn 以下）不计入航道分析
          if (pos.sog != null && pos.sog < minSog) continue;
          // 渔船 / 拖轮按 status 近似排除
          if (wantFishing && pos.status === FISHING_STATUS) continue;
          if (wantTowing && pos.status === TOWING_STATUS) continue;
          if (pointInPolygon([pos.lng, pos.lat], zone.ring)) {
            ships.push(pos);
          }
        }
        if (ships.length < 2) {
          frames_detail.push({
            zone_id: zone.id,
            t,
            iso: new Date(t * 1000).toISOString(),
            count: ships.length,
            gaps_m: [],
          });
          continue;
        }

        // 按 COG 分方向组（±20° 归为一股流）
        const groups = [];
        for (const s of ships) {
          if (s.cog == null) continue;
          let placed = false;
          for (const g of groups) {
            if (angularDiff(g.refCog, s.cog) <= 20) {
              g.members.push(s);
              // 更新参考航向为均值
              const sum = g.members.reduce((acc, m) => acc + (m.cog || 0), 0);
              g.refCog = sum / g.members.length;
              placed = true;
              break;
            }
          }
          if (!placed) groups.push({ refCog: s.cog, members: [s] });
        }

        const gapsM = [];
        const timeGapsS = [];
        for (const g of groups) {
          if (g.members.length < 2) continue;
          // 主轴 = 组内 COG 均值；原点取组内第一个点
          const axisBearing = g.refCog;
          const o = g.members[0];
          const proj = g.members.map((m) => ({
            mmsi: m.mmsi,
            s: projectOntoAxis(m.lng, m.lat, o.lng, o.lat, axisBearing),
            sog: m.sog || 0,
          }));
          proj.sort((a, b) => a.s - b.s);
          for (let i = 0; i < proj.length - 1; i++) {
            const d = Math.abs(proj[i + 1].s - proj[i].s);
            const relSpeedKn =
              ((proj[i].sog || 0) + (proj[i + 1].sog || 0)) / 2; // kn
            gapsM.push(Number(d.toFixed(1)));
            if (relSpeedKn > 0.1) {
              const dt = d / 1852 / (relSpeedKn / 3600); // 秒
              timeGapsS.push(Number(dt.toFixed(0)));
            }
          }
        }

        gapsM.forEach((g) => allGapsM.push(g));
        timeGapsS.forEach((g) => allTimeGapsS.push(g));

        frames_detail.push({
          zone_id: zone.id,
          t,
          iso: new Date(t * 1000).toISOString(),
          count: ships.length,
          gaps_m: gapsM,
        });
      }
    }

    const summarize = (arr) => {
      if (arr.length === 0) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      return {
        samples: sorted.length,
        min_m: Number(sorted[0].toFixed(1)),
        mean_m: Number((sum / sorted.length).toFixed(1)),
        max_m: Number(sorted[sorted.length - 1].toFixed(1)),
        min_nm: Number((sorted[0] / 1852).toFixed(3)),
        mean_nm: Number((sum / sorted.length / 1852).toFixed(3)),
        max_nm: Number((sorted[sorted.length - 1] / 1852).toFixed(3)),
      };
    };

    const summary = {
      gaps_m: summarize(allGapsM),
      time_gaps_s: summarize(allTimeGapsS),
    };

    return res.json({
      zone_id: zone_id || 'all',
      frame_sec: frameSec,
      include_moored: wantMoored,
      min_sog: minSog,
      exclude_fishing: wantFishing,
      exclude_towing: wantTowing,
      mmsi_prefix: mmsiPrefixes,
      frames: frames_detail.length,
      summary,
      frames_detail,
    });
  } catch (err) {
    console.error('[spacing] Error:', err);
    return res.status(500).json({
      error: err && err.message ? err.message : 'Internal server error',
    });
  }
};
