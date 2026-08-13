'use strict';

const fs = require('fs');
const path = require('path');
const { queryTracks } = require('../lib/api/data');
const { segmentsIntersect, bearing, haversine } = require('../lib/api/geometry');

// 读取断面线坐标（[lng,lat] 数组）。优先从 public/data 下读取，
// 兼容 Vercel（/var/task）与本地开发（process.cwd()）路径。
function loadLineCoords(filename) {
  const dirs = [
    path.join(process.cwd(), 'public', 'data'),
    path.join('/var/task', 'public', 'data'),
    path.join(__dirname, '..', 'public', 'data'),
  ];
  for (const dir of dirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      const geo = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const feature = geo.features && geo.features[0];
      if (feature && feature.geometry && feature.geometry.type === 'LineString') {
        return feature.geometry.coordinates;
      }
    }
  }
  return null;
}

function lineSegments(coords) {
  const segs = [];
  for (let i = 0; i < coords.length - 1; i++) {
    segs.push([coords[i], coords[i + 1]]);
  }
  return segs;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const LINES = {
  green: { id: 'green', label: '绿线', file: 'line1.geojson' },
  red: { id: 'red', label: '红线', file: 'line1-2.geojson' },
};

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
    const { mmsi, start_time, end_time, lines } = req.query;

    if (!mmsi || typeof mmsi !== 'string') {
      return res.status(400).json({ error: 'mmsi is required' });
    }

    // 选择要计算的线
    let lineKeys = ['green', 'red'];
    if (typeof lines === 'string' && lines.trim()) {
      const requested = lines.split(',').map((s) => s.trim()).filter(Boolean);
      lineKeys = requested.filter((k) => LINES[k]);
      if (lineKeys.length === 0) lineKeys = ['green', 'red'];
    }

    // 取该船轨迹（按时间升序）
    const { data: tracks } = queryTracks({
      mmsi,
      start_time:
        start_time && typeof start_time === 'string'
          ? parseInt(start_time, 10)
          : undefined,
      end_time:
        end_time && typeof end_time === 'string'
          ? parseInt(end_time, 10)
          : undefined,
      page: 1,
      page_size: 500000000,
    });

    if (tracks.length < 2) {
      return res.json({
        mmsi: parseInt(mmsi, 10),
        crossings: [],
        code: 'INSUFFICIENT_TRACKS',
        message: '该船在指定时间范围内轨迹点不足',
      });
    }

    const result = [];
    for (const key of lineKeys) {
      const coords = loadLineCoords(LINES[key].file);
      if (!coords) {
        continue;
      }
      const segs = lineSegments(coords);

      for (let i = 0; i < tracks.length - 1; i++) {
        const p0 = tracks[i];
        const p1 = tracks[i + 1];
        if (p1.timestamp === p0.timestamp) continue;

        const segA = [p0.lng, p0.lat];
        const segB = [p1.lng, p1.lat];

        for (const [a, b] of segs) {
          const inter = segmentsIntersect(segA, segB, a, b);
          if (!inter.cross) continue;

          const t = inter.t;
          const crossTs = lerp(p0.timestamp, p1.timestamp, t);
          const crossLng = lerp(p0.lng, p1.lng, t);
          const crossLat = lerp(p0.lat, p1.lat, t);

          // 速度：优先插值 sog；缺则取最近点
          let sog;
          if (p0.sog != null && p1.sog != null) {
            sog = lerp(p0.sog, p1.sog, t);
          } else {
            sog = (p0.sog != null ? p0.sog : p1.sog) || 0;
          }
          // 方向：两个口径都给
          const cog = p0.cog != null ? p0.cog : p1.cog;
          const geomBearing = bearing(p0.lng, p0.lat, p1.lng, p1.lat);

          result.push({
            line: key,
            line_label: LINES[key].label,
            cross_time: Math.round(crossTs),
            cross_iso: new Date(crossTs * 1000).toISOString(),
            lng: Number(crossLng.toFixed(6)),
            lat: Number(crossLat.toFixed(6)),
            sog_kn: Number(sog.toFixed(2)),
            cog_deg: cog != null ? Number(cog.toFixed(1)) : null,
            geom_bearing_deg: Number(geomBearing.toFixed(1)),
          });
        }
      }
    }

    result.sort((x, y) => x.cross_time - y.cross_time);

    // 相邻两次穿越之间的航行用时 / 区间平均速度
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const cur = result[i];
      const dtSec = cur.cross_time - prev.cross_time;
      const distM = haversine(prev.lng, prev.lat, cur.lng, cur.lat);
      const avgKn = dtSec > 0 ? distM / 1852 / (dtSec / 3600) : null;
      cur.time_since_prev_s = dtSec;
      cur.avg_speed_kn = avgKn != null ? Number(avgKn.toFixed(2)) : null;
    }

    if (result.length === 0) {
      return res.json({
        mmsi: parseInt(mmsi, 10),
        crossing_count: 0,
        crossings: [],
        code: 'NO_CROSSING',
        message: '该船轨迹未穿越所选断面线（绿线/红线）',
      });
    }

    return res.json({
      mmsi: parseInt(mmsi, 10),
      crossing_count: result.length,
      crossings: result,
    });
  } catch (err) {
    console.error('[crossings] Error:', err);
    return res.status(500).json({
      error: err && err.message ? err.message : 'Internal server error',
    });
  }
};
