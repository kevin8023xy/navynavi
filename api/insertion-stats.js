'use strict';

const fs = require('fs');
const path = require('path');
const { point: turfPoint } = require('@turf/helpers');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { queryTracks, ensureLoaded } = require('../lib/api/data');
const { segmentsIntersect, bearing, angularDiff } = require('../lib/api/geometry');

const FISHING_STATUS = 7;
const TOWING_STATUS = 11;
const EXCLUDED_FAIRWAYS = new Set(['6', '7']);
const EXCLUDED_ZONES = new Set(['6', '7']);
const MAX_ENTRY_GAP_SECONDS = 300;
const MIN_INSIDE_POINTS = 3;
const SIDE_EDGE_MAX_ANGLE_DEG = 45;

let polygonCache = null;

function loadPolygons() {
  if (polygonCache) return polygonCache;

  const publicDir = path.resolve(__dirname, '..', 'public', 'data');
  const fairwayGeo = JSON.parse(fs.readFileSync(path.join(publicDir, 'fairways.geojson'), 'utf8'));
  const zoneGeo = JSON.parse(fs.readFileSync(path.join(publicDir, 'zone-polygon.geojson'), 'utf8'));

  polygonCache = {
    fairways: prepareFeatures(fairwayGeo.features || []),
    zones: prepareFeatures(zoneGeo.features || []),
  };
  return polygonCache;
}

function prepareFeatures(features) {
  return features.map((feature, index) => {
    const coordinates = feature.geometry && feature.geometry.coordinates;
    const flat = flattenCoordinates(coordinates || []);
    const lngs = flat.map((point) => point[0]);
    const lats = flat.map((point) => point[1]);
    return {
      id: String(feature.properties && feature.properties.id != null ? feature.properties.id : index + 1),
      name: feature.properties && feature.properties.name ? feature.properties.name : '',
      orient: numberOrNull(feature.properties && feature.properties.orient),
      geometry: feature.geometry,
      bbox: {
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
      },
    };
  });
}

function flattenCoordinates(value, output = []) {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number') {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const child of value) flattenCoordinates(child, output);
  }
  return output;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inBbox(lng, lat, bbox) {
  return lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function containingFeatures(record, features) {
  const point = turfPoint([record.lng, record.lat]);
  return features.filter(
    (feature) => inBbox(record.lng, record.lat, feature.bbox)
      && booleanPointInPolygon(point, feature.geometry)
  );
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function findEntryCrossing(previous, current, fairways) {
  const start = [previous.lng, previous.lat];
  const end = [current.lng, current.lat];
  const crossings = [];

  for (const fairway of fairways) {
    for (const ring of geometryRings(fairway.geometry)) {
      for (let index = 0; index < ring.length - 1; index++) {
        const intersection = segmentsIntersect(start, end, ring[index], ring[index + 1]);
        if (!intersection.cross) continue;

        const edgeBearing = bearing(ring[index][0], ring[index][1], ring[index + 1][0], ring[index + 1][1]);
        const orientationDifference = fairway.orient == null
          ? null
          : Math.min(angularDiff(edgeBearing, fairway.orient), angularDiff(edgeBearing, fairway.orient + 180));

        crossings.push({
          fairway,
          t: intersection.t,
          edgeBearing,
          orientationDifference,
        });
      }
    }
  }

  crossings.sort((a, b) => a.t - b.t);
  return crossings[0] || null;
}

function interpolateNullable(a, b, t) {
  if (a != null && b != null) return a + (b - a) * t;
  if (a != null) return a;
  if (b != null) return b;
  return null;
}

function hasSustainedInsideRun(points, startIndex, fairways) {
  let insidePoints = 0;
  for (let index = startIndex; index < points.length; index++) {
    const point = points[index];
    if (index > startIndex && point.timestamp - points[index - 1].timestamp > MAX_ENTRY_GAP_SECONDS) break;
    if (containingFeatures(point, fairways).length === 0) break;
    insidePoints++;
    if (insidePoints >= MIN_INSIDE_POINTS) return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await ensureLoaded();
    const query = req.query || {};
    const startTime = query.start_time ? Number(query.start_time) : undefined;
    const endTime = query.end_time ? Number(query.end_time) : undefined;
    const minSog = query.min_sog != null ? Number(query.min_sog) : 3;
    const excludeFishing = query.exclude_fishing !== '0';
    const excludeTowing = query.exclude_towing !== '0';
    const mmsiFilter = query.mmsi
      ? new Set(query.mmsi.split(',').map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isFinite))
      : null;

    const polygons = loadPolygons();
    const { data: tracks } = queryTracks({
      start_time: startTime,
      end_time: endTime,
      mmsi: mmsiFilter ? Array.from(mmsiFilter).join(',') : undefined,
      page: 1,
      page_size: 500000000,
    });

    const tracksByMmsi = new Map();
    for (const record of tracks) {
      if (mmsiFilter && !mmsiFilter.has(record.mmsi)) continue;
      if (!tracksByMmsi.has(record.mmsi)) tracksByMmsi.set(record.mmsi, []);
      tracksByMmsi.get(record.mmsi).push(record);
    }

    const events = [];
    for (const [mmsi, points] of tracksByMmsi) {
      points.sort((a, b) => a.timestamp - b.timestamp);

      const visitedZones = new Set();
      const visitedFairways = new Set();
      let firstZoneTimestamp = Infinity;
      let previousFairways = [];

      for (let index = 0; index < points.length; index++) {
        const current = points[index];
        const currentZones = containingFeatures(current, polygons.zones);
        const currentFairways = containingFeatures(current, polygons.fairways);

        for (const zone of currentZones) {
          visitedZones.add(zone.id);
          firstZoneTimestamp = Math.min(firstZoneTimestamp, current.timestamp);
        }
        for (const fairway of currentFairways) visitedFairways.add(fairway.id);

        if (index > 0 && previousFairways.length === 0 && currentFairways.length > 0) {
          const previous = points[index - 1];
          const gapSeconds = current.timestamp - previous.timestamp;
          const crossing = gapSeconds > 0 && gapSeconds <= MAX_ENTRY_GAP_SECONDS
            ? findEntryCrossing(previous, current, currentFairways)
            : null;
          const entryTimestamp = crossing
            ? previous.timestamp + gapSeconds * crossing.t
            : current.timestamp;
          const entrySog = crossing
            ? interpolateNullable(previous.sog, current.sog, crossing.t)
            : current.sog;
          const isSideEntry = crossing
            && crossing.orientationDifference != null
            && crossing.orientationDifference <= SIDE_EDGE_MAX_ANGLE_DEG;
          const validStatus = (!excludeFishing || current.status !== FISHING_STATUS)
            && (!excludeTowing || current.status !== TOWING_STATUS);

          if (
            isSideEntry
            && firstZoneTimestamp < entryTimestamp
            && entrySog != null
            && entrySog >= minSog
            && validStatus
            && hasSustainedInsideRun(points, index, polygons.fairways)
          ) {
            events.push({
              mmsi,
              fairwayId: crossing.fairway.id,
              fairwayName: crossing.fairway.name,
              entryTime: Math.round(entryTimestamp),
              entryIso: new Date(entryTimestamp * 1000).toISOString(),
              entryLng: previous.lng + (current.lng - previous.lng) * crossing.t,
              entryLat: previous.lat + (current.lat - previous.lat) * crossing.t,
              entrySogKn: entrySog,
              entryCogDeg: interpolateNullable(previous.cog, current.cog, crossing.t),
              aisGapSeconds: gapSeconds,
              edgeBearingDeg: crossing.edgeBearing,
              fairwayOrientationDeg: crossing.fairway.orient,
              zones: Array.from(visitedZones),
            });
          }
        }

        previousFairways = currentFairways;
      }

      if (
        Array.from(visitedZones).some((id) => EXCLUDED_ZONES.has(id))
        || Array.from(visitedFairways).some((id) => EXCLUDED_FAIRWAYS.has(id))
      ) {
        for (let index = events.length - 1; index >= 0; index--) {
          if (events[index].mmsi === mmsi) events.splice(index, 1);
        }
      }
    }

    events.sort((a, b) => a.entryTime - b.entryTime || a.mmsi - b.mmsi);
    const uniqueShipCount = new Set(events.map((event) => event.mmsi)).size;
    const speeds = events.map((event) => event.entrySogKn).filter(Number.isFinite);
    const averageEntrySpeedKn = speeds.length
      ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length
      : null;

    return res.json({
      summary: {
        uniqueShipCount,
        insertionEventCount: events.length,
        averageEntrySpeedKn,
        filters: {
          min_sog: minSog,
          exclude_fishing: excludeFishing,
          exclude_towing: excludeTowing,
          max_entry_gap_seconds: MAX_ENTRY_GAP_SECONDS,
          min_inside_points: MIN_INSIDE_POINTS,
        },
      },
      events,
    });
  } catch (error) {
    console.error('[insertion-stats] Error:', error);
    return res.status(500).json({ error: error && error.message ? error.message : 'Internal server error' });
  }
};
