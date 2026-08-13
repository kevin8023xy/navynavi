'use strict';

// 统计进入航道(fairways)的船舶，及其经过的航行区域面(zone-polygon) id 列表。
// 按 MMSI 主键聚合。点面判断用 turf（用户指定）。
//
// GET /api/zone-stats?start_time=&end_time=&mmsi=&min_sog=
//   → { summary, ships: [ { mmsi, fairways:[id...], zones:[id...], points } ] }

const fs = require('fs');
const path = require('path');
const { queryTracks } = require('../lib/api/data');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { point: turfPoint } = require('@turf/helpers');

const FISHING_STATUS = 7;
const TOWING_STATUS = 11;
const DEFAULT_MIN_SOG = 3;

// 读取两个面数据集：fairways（航道）+ zone-polygon（航行区域面）
function loadPolygons() {
  const dirs = [process.cwd(), '/var/task', path.join(__dirname, '..')];
  const datasets = [
    { key: 'fairways', file: 'fairways.geojson' },
    { key: 'zones', file: 'zone-polygon.geojson' },
  ];
  const result = { fairways: [], zones: [] };
  for (const ds of datasets) {
    let geo = null;
    for (const dir of dirs) {
      const p = path.join(dir, 'public', 'data', ds.file);
      if (fs.existsSync(p)) {
        geo = JSON.parse(fs.readFileSync(p, 'utf-8'));
        break;
      }
    }
    if (!geo) continue;
    for (const f of geo.features || []) {
      if (!f.geometry) continue;
      const id = f.properties && (f.properties.id != null ? String(f.properties.id) : null);
      if (!id) continue;
      // 预计算 bbox，用于粗筛，避免对每个点都跑精确点面判断
      const bbox = polygonBbox(f.geometry);
      result[ds.key].push({ id, properties: f.properties, geometry: f.geometry, bbox });
    }
  }
  return result;
}

function polygonBbox(geom) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : null;
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates || [];
  for (const poly of rings) {
    for (const c of poly) {
      if (c[0] < minLng) minLng = c[0];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[1] > maxLat) maxLat = c[1];
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query;
    const start_time = q.start_time ? Number(q.start_time) : undefined;
    const end_time = q.end_time ? Number(q.end_time) : undefined;
    const minSog = q.min_sog ? Math.max(0, parseFloat(q.min_sog) || 0) : DEFAULT_MIN_SOG;
    const wantFishing = !(q.exclude_fishing === '0' || q.exclude_fishing === 'false');
    const wantTowing = !(q.exclude_towing === '0' || q.exclude_towing === 'false');
    const mmsiFilter = q.mmsi
      ? new Set(q.mmsi.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)))
      : null;

    const polys = loadPolygons();
    if (polys.fairways.length === 0) {
      return res.status(500).json({ error: '未找到 fairways.geojson（请先运行 scripts/extract_fairways.py）' });
    }

    const { data: tracks } = queryTracks({
      start_time,
      end_time,
      mmsi: mmsiFilter ? Array.from(mmsiFilter).join(',') : undefined,
      page: 1,
      page_size: 500000000,
    });

    // 按 MMSI 聚合：进入的航道集合 + 经过的区域面集合 + 点数
    const agg = new Map();
    let evaluatedPoints = 0;

    for (const r of tracks) {
      // 低速/渔船/拖轮过滤（与 B 项 semantics 保持一致：单点 SOG 过滤）
      if (r.sog != null && r.sog < minSog) continue;
      if (wantFishing && r.status === FISHING_STATUS) continue;
      if (wantTowing && r.status === TOWING_STATUS) continue;
      if (mmsiFilter && !mmsiFilter.has(r.mmsi)) continue;

      if (!agg.has(r.mmsi)) {
        agg.set(r.mmsi, {
          mmsi: r.mmsi,
          fairways: new Set(),
          zones: new Set(),
          points: 0,
          firstZoneTs: Infinity,
          firstFairwayTs: Infinity,
          // 每个 zone / fairway 的首次进入时间，用于按实际经过顺序排序
          zoneEnterTs: new Map(),
          fairwayEnterTs: new Map(),
        });
      }
      const a = agg.get(r.mmsi);
      a.points++;

      const pt = turfPoint([r.lng, r.lat]);
      const ts = r.timestamp != null ? r.timestamp : null;

      // 航道（fairways）：进入任一航道即记录，并记首次命中时间
      for (const fw of polys.fairways) {
        if (a.fairways.has(fw.id)) continue;
        if (!inBbox(r.lng, r.lat, fw.bbox)) continue;
        evaluatedPoints++;
        if (booleanPointInPolygon(pt, fw.geometry)) {
          a.fairways.add(fw.id);
          if (ts != null) {
            if (ts < a.firstFairwayTs) a.firstFairwayTs = ts;
            if (!a.fairwayEnterTs.has(fw.id) || ts < a.fairwayEnterTs.get(fw.id)) {
              a.fairwayEnterTs.set(fw.id, ts);
            }
          }
        }
      }
      // 航行区域面（zones）：经过即记录，并记首次命中时间
      for (const z of polys.zones) {
        if (a.zones.has(z.id)) continue;
        if (!inBbox(r.lng, r.lat, z.bbox)) continue;
        evaluatedPoints++;
        if (booleanPointInPolygon(pt, z.geometry)) {
          a.zones.add(z.id);
          if (ts != null) {
            if (ts < a.firstZoneTs) a.firstZoneTs = ts;
            if (!a.zoneEnterTs.has(z.id) || ts < a.zoneEnterTs.get(z.id)) {
              a.zoneEnterTs.set(z.id, ts);
            }
          }
        }
      }
    }

    // 仅保留满足顺序约束的船舶：
    //   1) 进入过航道
    //   2) 至少经过一个航行区域面
    //   3) 顺序：先经过航行区域面（firstZoneTs），后进入航道（firstFairwayTs）
    //      —— 即 firstZoneTs < firstFairwayTs；反之（先在航道、后进区域面）不统计
    const ships = [];
    let excludedByOrder = 0;
    let excludedByFairway = 0;
    let excludedByZone = 0;
    const EXCLUDED_FAIRWAYS = new Set(['6', '7']);
    const EXCLUDED_ZONES = new Set(['6', '7']);
    for (const a of agg.values()) {
      if (a.fairways.size === 0) continue;
      if (a.zones.size === 0) continue;
      // 排除进入过航道 6 / 7 的船舶
      if (Array.from(a.fairways).some((id) => EXCLUDED_FAIRWAYS.has(id))) {
        excludedByFairway++;
        continue;
      }
      // 排除经过航行区域面 6 / 7 的船舶（这些船不是目标对象）
      if (Array.from(a.zones).some((id) => EXCLUDED_ZONES.has(id))) {
        excludedByZone++;
        continue;
      }
      if (!(a.firstZoneTs < a.firstFairwayTs)) {
        excludedByOrder++;
        continue;
      }
      // 按首次进入时间先后排序（而非按 id 数字），反映船舶实际经过顺序
      const zonesByOrder = Array.from(a.zones).sort(
        (x, y) => (a.zoneEnterTs.get(x) ?? Infinity) - (a.zoneEnterTs.get(y) ?? Infinity)
      );
      const fairwaysByOrder = Array.from(a.fairways).sort(
        (x, y) => (a.fairwayEnterTs.get(x) ?? Infinity) - (a.fairwayEnterTs.get(y) ?? Infinity)
      );
      ships.push({
        mmsi: a.mmsi,
        fairways: fairwaysByOrder,
        zones: zonesByOrder,
        points: a.points,
        zoneCount: a.zones.size,
        fairwayCount: a.fairways.size,
      });
    }
    ships.sort((x, y) => y.zoneCount - x.zoneCount || x.mmsi - y.mmsi);

    const summary = {
      totalShipsInFairway: ships.length,
      totalTrackPoints: tracks.length,
      evaluatedPointInPolygonTests: evaluatedPoints,
      fairwayCount: polys.fairways.length,
      zoneCount: polys.zones.length,
      excludedByOrder,
      excludedByFairway,
      excludedByZone,
      filters: { min_sog: minSog, exclude_fishing: wantFishing, exclude_towing: wantTowing },
    };

    return res.json({ summary, ships });
  } catch (err) {
    console.error('[zone-stats] Error:', err);
    return res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
};

function inBbox(lng, lat, b) {
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat;
}
