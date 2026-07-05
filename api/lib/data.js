'use strict';

const fs = require('fs');
const path = require('path');

// 直接 require JS 数据模块，Vercel 打包时会将其包含在函数包中
const EMBEDDED_RECORDS = [{"mmsi":412226207,"lat":40.154306,"lng":121.79988,"sog":0.1,"cog":55,"heading":511,"status":15,"timestamp":1633046400},{"mmsi":413227640,"lat":40.350565,"lng":122.015646,"sog":0.1,"cog":273.2,"heading":511,"status":1,"timestamp":1633046400},{"mmsi":412226207,"lat":40.154321,"lng":121.799906,"sog":0.12,"cog":54.7,"heading":511,"status":15,"timestamp":1633046410},{"mmsi":413227640,"lat":40.350568,"lng":122.015648,"sog":0.1,"cog":269.9,"heading":511,"status":1,"timestamp":1633046410},{"mmsi":412226207,"lat":40.154335,"lng":121.799932,"sog":0.14,"cog":54.5,"heading":511,"status":15,"timestamp":1633046420},{"mmsi":413227640,"lat":40.35057,"lng":122.015651,"sog":0.1,"cog":266.6,"heading":511,"status":1,"timestamp":1633046420},{"mmsi":412354480,"lat":40.33483,"lng":121.991369,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046420},{"mmsi":412226207,"lat":40.15435,"lng":121.799958,"sog":0.16,"cog":54.2,"heading":511,"status":15,"timestamp":1633046430},{"mmsi":413227640,"lat":40.350573,"lng":122.015654,"sog":0.1,"cog":263.3,"heading":511,"status":1,"timestamp":1633046430},{"mmsi":412354480,"lat":40.33483,"lng":121.99137,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046430},{"mmsi":636015457,"lat":40.298868,"lng":122.077452,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046430},{"mmsi":412226207,"lat":40.154365,"lng":121.799984,"sog":0.18,"cog":54,"heading":511,"status":15,"timestamp":1633046440},{"mmsi":413227640,"lat":40.350576,"lng":122.015657,"sog":0.1,"cog":260,"heading":511,"status":1,"timestamp":1633046440},{"mmsi":412354480,"lat":40.33483,"lng":121.991371,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046440},{"mmsi":636015457,"lat":40.298868,"lng":122.077452,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046440},{"mmsi":412226207,"lat":40.154379,"lng":121.80001,"sog":0.2,"cog":53.8,"heading":511,"status":15,"timestamp":1633046450},{"mmsi":413227640,"lat":40.350578,"lng":122.01566,"sog":0.1,"cog":256.7,"heading":511,"status":1,"timestamp":1633046450},{"mmsi":412354480,"lat":40.33483,"lng":121.991372,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046450},{"mmsi":636015457,"lat":40.298869,"lng":122.077452,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046450},{"mmsi":413243650,"lat":40.254071,"lng":121.738447,"sog":0.1,"cog":139.6,"heading":308,"status":1,"timestamp":1633046450},{"mmsi":412226207,"lat":40.154394,"lng":121.800036,"sog":0.22,"cog":53.5,"heading":511,"status":15,"timestamp":1633046460},{"mmsi":413227640,"lat":40.350581,"lng":122.015663,"sog":0.1,"cog":253.4,"heading":511,"status":1,"timestamp":1633046460},{"mmsi":412354480,"lat":40.33483,"lng":121.991373,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046460},{"mmsi":636015457,"lat":40.298869,"lng":122.077452,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046460},{"mmsi":413243650,"lat":40.254071,"lng":121.738446,"sog":0.1,"cog":139.5,"heading":308,"status":1,"timestamp":1633046460},{"mmsi":412226207,"lat":40.154409,"lng":121.800062,"sog":0.23,"cog":53.3,"heading":511,"status":15,"timestamp":1633046470},{"mmsi":413227640,"lat":40.350583,"lng":122.015666,"sog":0.1,"cog":250.1,"heading":511,"status":1,"timestamp":1633046470},{"mmsi":412354480,"lat":40.33483,"lng":121.991374,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046470},{"mmsi":636015457,"lat":40.29887,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046470},{"mmsi":413243650,"lat":40.25407,"lng":121.738446,"sog":0.1,"cog":139.5,"heading":308,"status":1,"timestamp":1633046470},{"mmsi":412208840,"lat":40.201573,"lng":121.957742,"sog":0,"cog":256.6,"heading":511,"status":5,"timestamp":1633046470},{"mmsi":412226207,"lat":40.154423,"lng":121.800088,"sog":0.25,"cog":53.1,"heading":511,"status":15,"timestamp":1633046480},{"mmsi":413227640,"lat":40.350586,"lng":122.015668,"sog":0.1,"cog":246.8,"heading":511,"status":1,"timestamp":1633046480},{"mmsi":412354480,"lat":40.33483,"lng":121.991375,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046480},{"mmsi":636015457,"lat":40.29887,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046480},{"mmsi":413243650,"lat":40.25407,"lng":121.738445,"sog":0.1,"cog":139.5,"heading":308,"status":1,"timestamp":1633046480},{"mmsi":412208840,"lat":40.201573,"lng":121.957742,"sog":0,"cog":256.9,"heading":511,"status":5,"timestamp":1633046480},{"mmsi":700055111,"lat":40.283031,"lng":121.705261,"sog":2.59,"cog":180.2,"heading":511,"status":15,"timestamp":1633046480},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046480},{"mmsi":412226207,"lat":40.154438,"lng":121.800114,"sog":0.27,"cog":52.8,"heading":511,"status":15,"timestamp":1633046490},{"mmsi":413227640,"lat":40.350589,"lng":122.015671,"sog":0.1,"cog":243.5,"heading":511,"status":1,"timestamp":1633046490},{"mmsi":412354480,"lat":40.33483,"lng":121.991376,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046490},{"mmsi":636015457,"lat":40.29887,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046490},{"mmsi":413243650,"lat":40.254069,"lng":121.738444,"sog":0.1,"cog":139.4,"heading":308,"status":1,"timestamp":1633046490},{"mmsi":412208840,"lat":40.201573,"lng":121.957742,"sog":0,"cog":257.2,"heading":511,"status":5,"timestamp":1633046490},{"mmsi":700055111,"lat":40.282949,"lng":121.705259,"sog":2.58,"cog":180.3,"heading":511,"status":15,"timestamp":1633046490},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046490},{"mmsi":412226207,"lat":40.154452,"lng":121.80014,"sog":0.29,"cog":52.6,"heading":511,"status":15,"timestamp":1633046500},{"mmsi":413227640,"lat":40.350591,"lng":122.015674,"sog":0.1,"cog":240.2,"heading":511,"status":1,"timestamp":1633046500},{"mmsi":412354480,"lat":40.33483,"lng":121.991377,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046500},{"mmsi":636015457,"lat":40.298871,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046500},{"mmsi":413243650,"lat":40.254068,"lng":121.738443,"sog":0.1,"cog":139.4,"heading":308,"status":1,"timestamp":1633046500},{"mmsi":412208840,"lat":40.201573,"lng":121.957742,"sog":0,"cog":257.5,"heading":511,"status":5,"timestamp":1633046500},{"mmsi":700055111,"lat":40.282867,"lng":121.705257,"sog":2.56,"cog":180.3,"heading":511,"status":15,"timestamp":1633046500},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046500},{"mmsi":412225953,"lat":40.278593,"lng":122.034189,"sog":7.51,"cog":162.6,"heading":163,"status":15,"timestamp":1633046500},{"mmsi":412226207,"lat":40.154467,"lng":121.800166,"sog":0.31,"cog":52.3,"heading":511,"status":15,"timestamp":1633046510},{"mmsi":413227640,"lat":40.350594,"lng":122.015677,"sog":0.1,"cog":236.9,"heading":511,"status":1,"timestamp":1633046510},{"mmsi":412354480,"lat":40.33483,"lng":121.991378,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046510},{"mmsi":636015457,"lat":40.298871,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046510},{"mmsi":413243650,"lat":40.254068,"lng":121.738442,"sog":0.1,"cog":139.4,"heading":308,"status":1,"timestamp":1633046510},{"mmsi":412208840,"lat":40.201573,"lng":121.957742,"sog":0,"cog":257.8,"heading":511,"status":5,"timestamp":1633046510},{"mmsi":700055111,"lat":40.282784,"lng":121.705255,"sog":2.54,"cog":180.4,"heading":511,"status":15,"timestamp":1633046510},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046510},{"mmsi":412225953,"lat":40.278247,"lng":122.0343,"sog":7.52,"cog":162.8,"heading":163,"status":15,"timestamp":1633046510},{"mmsi":412207830,"lat":40.283545,"lng":122.091745,"sog":0,"cog":284.4,"heading":511,"status":5,"timestamp":1633046510},{"mmsi":413451140,"lat":40.269828,"lng":121.741755,"sog":0.1,"cog":23.4,"heading":292,"status":1,"timestamp":1633046510},{"mmsi":412226207,"lat":40.154482,"lng":121.800192,"sog":0.33,"cog":52.1,"heading":511,"status":15,"timestamp":1633046520},{"mmsi":413227640,"lat":40.350596,"lng":122.01568,"sog":0.1,"cog":233.6,"heading":511,"status":1,"timestamp":1633046520},{"mmsi":412354480,"lat":40.33483,"lng":121.991378,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046520},{"mmsi":636015457,"lat":40.298872,"lng":122.077451,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046520},{"mmsi":413243650,"lat":40.254067,"lng":121.738441,"sog":0.1,"cog":139.4,"heading":308,"status":1,"timestamp":1633046520},{"mmsi":412208840,"lat":40.201572,"lng":121.957742,"sog":0.01,"cog":258,"heading":511,"status":5,"timestamp":1633046520},{"mmsi":700055111,"lat":40.282702,"lng":121.705253,"sog":2.52,"cog":180.4,"heading":511,"status":15,"timestamp":1633046520},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046520},{"mmsi":412225953,"lat":40.2779,"lng":122.034411,"sog":7.53,"cog":162.9,"heading":163,"status":15,"timestamp":1633046520},{"mmsi":412207830,"lat":40.283545,"lng":122.091745,"sog":0,"cog":284.5,"heading":511,"status":5,"timestamp":1633046520},{"mmsi":413451140,"lat":40.269827,"lng":121.741754,"sog":0.1,"cog":23.2,"heading":292,"status":1,"timestamp":1633046520},{"mmsi":412001510,"lat":40.284443,"lng":122.098272,"sog":0,"cog":356.8,"heading":511,"status":5,"timestamp":1633046520},{"mmsi":412226207,"lat":40.154496,"lng":121.800218,"sog":0.34,"cog":51.9,"heading":511,"status":15,"timestamp":1633046530},{"mmsi":413227640,"lat":40.350599,"lng":122.015683,"sog":0.1,"cog":230.2,"heading":511,"status":1,"timestamp":1633046530},{"mmsi":412354480,"lat":40.33483,"lng":121.991379,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046530},{"mmsi":636015457,"lat":40.298872,"lng":122.07745,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046530},{"mmsi":413243650,"lat":40.254066,"lng":121.738441,"sog":0.1,"cog":139.3,"heading":308,"status":1,"timestamp":1633046530},{"mmsi":412208840,"lat":40.201572,"lng":121.957742,"sog":0.01,"cog":258.3,"heading":511,"status":5,"timestamp":1633046530},{"mmsi":700055111,"lat":40.28262,"lng":121.705251,"sog":2.51,"cog":180.5,"heading":511,"status":15,"timestamp":1633046530},{"mmsi":412001580,"lat":40.282935,"lng":122.099152,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046530},{"mmsi":412225953,"lat":40.277554,"lng":122.034522,"sog":7.55,"cog":163.1,"heading":163,"status":15,"timestamp":1633046530},{"mmsi":412207830,"lat":40.283545,"lng":122.091745,"sog":0,"cog":284.7,"heading":511,"status":5,"timestamp":1633046530},{"mmsi":413451140,"lat":40.269827,"lng":121.741754,"sog":0.1,"cog":22.9,"heading":292,"status":1,"timestamp":1633046530},{"mmsi":412001510,"lat":40.284443,"lng":122.098272,"sog":0,"cog":356.8,"heading":511,"status":5,"timestamp":1633046530},{"mmsi":412226207,"lat":40.154511,"lng":121.800244,"sog":0.36,"cog":51.6,"heading":511,"status":15,"timestamp":1633046540},{"mmsi":413227640,"lat":40.350601,"lng":122.015685,"sog":0.1,"cog":226.9,"heading":511,"status":1,"timestamp":1633046540},{"mmsi":412354480,"lat":40.334831,"lng":121.99138,"sog":0,"cog":312.3,"heading":511,"status":15,"timestamp":1633046540},{"mmsi":636015457,"lat":40.298872,"lng":122.07745,"sog":0,"cog":313.6,"heading":65,"status":5,"timestamp":1633046540},{"mmsi":413243650,"lat":40.254066,"lng":121.73844,"sog":0.1,"cog":139.3,"heading":308,"status":1,"timestamp":1633046540},{"mmsi":412208840,"lat":40.201572,"lng":121.957742,"sog":0.01,"cog":258.6,"heading":511,"status":5,"timestamp":1633046540},{"mmsi":700055111,"lat":40.282538,"lng":121.705248,"sog":2.49,"cog":180.6,"heading":511,"status":15,"timestamp":1633046540},{"mmsi":412001580,"lat":40.282935,"lng":122.099151,"sog":0,"cog":58.3,"heading":511,"status":5,"timestamp":1633046540},{"mmsi":412225953,"lat":40.277207,"lng":122.034632,"sog":7.56,"cog":163.3,"heading":163,"status":15,"timestamp":1633046540}];

const CSV_FILENAME =
  'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv';
const SMALL_CSV_FILENAME = 'data_small.csv';

let cachedRecords = null;

function findFile(filenames) {
  const dirs = [process.cwd(), '/var/task', path.join('/var/task', 'api')];
  for (const dir of dirs) {
    for (const filename of filenames) {
      const p = path.join(dir, filename);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function parseCsv(csvPath) {
  console.log('[data] reading CSV:', csvPath);
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) throw new Error('CSV is empty');

  const headers = lines[0].split(',').map((h) => h.trim());
  const colIdx = {
    mmsi: headers.indexOf('MMSI'),
    lat: headers.indexOf('Latitude'),
    lng: headers.indexOf('Longitude'),
    sog: headers.indexOf('Speed Over Ground (SOG)'),
    cog: headers.indexOf('Course Over Ground (COG)'),
    heading: headers.indexOf('True Heading'),
    status: headers.indexOf('Navigational Status'),
    tsUnix: headers.indexOf('Timestamp (Unix)'),
  };

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(',');
    const ts = parseInt(cols[colIdx.tsUnix], 10);
    if (isNaN(ts)) continue;
    records.push({
      mmsi: parseInt(cols[colIdx.mmsi], 10) || 0,
      lat: parseFloat(cols[colIdx.lat]) || 0,
      lng: parseFloat(cols[colIdx.lng]) || 0,
      sog: cols[colIdx.sog] ? parseFloat(cols[colIdx.sog]) : null,
      cog: cols[colIdx.cog] ? parseFloat(cols[colIdx.cog]) : null,
      heading: cols[colIdx.heading] ? parseFloat(cols[colIdx.heading]) : null,
      status: cols[colIdx.status] ? parseInt(cols[colIdx.status], 10) : null,
      timestamp: ts,
      iso: new Date(ts * 1000).toISOString(),
    });
  }
  records.sort((a, b) => a.timestamp - b.timestamp);
  return records;
}

function loadRecords() {
  if (cachedRecords !== null) return cachedRecords;

  console.log('[data] EMBEDDED_RECORDS info:', typeof EMBEDDED_RECORDS, EMBEDDED_RECORDS ? EMBEDDED_RECORDS.length : 'null/undefined');

  const useSmall = process.env.USE_SMALL_DATA === '1';

  try {
    // 1. 优先使用内嵌数据（直接写在代码里，不依赖文件系统）
    if (!useSmall && EMBEDDED_RECORDS && EMBEDDED_RECORDS.length > 0) {
      console.log('[data] using embedded records:', EMBEDDED_RECORDS.length);
      cachedRecords = EMBEDDED_RECORDS.map((r) => ({
        mmsi: r.mmsi,
        lat: r.lat,
        lng: r.lng,
        sog: r.sog,
        cog: r.cog,
        heading: r.heading,
        status: r.status,
        timestamp: r.timestamp,
        iso: new Date(r.timestamp * 1000).toISOString(),
      }));
      return cachedRecords;
    }

    // 2. 尝试从文件系统读取（本地开发或备用）
    if (!useSmall) {
      const jsonCandidates = [
        path.join(process.cwd(), 'api', 'lib', 'record1.json'),
        path.join('/var/task', 'api', 'lib', 'record1.json'),
        path.join(__dirname, 'record1.json'),
        path.join(process.cwd(), 'api', 'lib', 'records.json'),
        path.join('/var/task', 'api', 'lib', 'records.json'),
      ];
      for (const p of jsonCandidates) {
        if (fs.existsSync(p)) {
          console.log('[data] loading json:', p);
          let raw = fs.readFileSync(p, 'utf-8');
          if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
          const records = JSON.parse(raw);
          cachedRecords = records.map((r) => ({
            mmsi: r.mmsi,
            lat: r.lat,
            lng: r.lng,
            sog: r.sog,
            cog: r.cog,
            heading: r.heading,
            status: r.status,
            timestamp: r.timestamp,
            iso: new Date(r.timestamp * 1000).toISOString(),
          }));
          console.log('[data] loaded from json:', cachedRecords.length);
          return cachedRecords;
        }
      }
    }

    // 3. 小数据集
    if (useSmall) {
      const smallPath = findFile([SMALL_CSV_FILENAME]);
      if (smallPath) {
        cachedRecords = parseCsv(smallPath);
        return cachedRecords;
      }
    }

    // 4. 完整 CSV
    const csvPath = findFile([CSV_FILENAME]);
    if (csvPath) {
      cachedRecords = parseCsv(csvPath);
      return cachedRecords;
    }

    throw new Error('Cannot find data source.');
  } catch (err) {
    console.error('[data] load failed:', err.message);
    throw err;
  }
}

function getAllRecords() {
  return loadRecords();
}

function getShipsLatest() {
  const records = loadRecords();
  const latestMap = new Map();
  for (const r of records) {
    const existing = latestMap.get(r.mmsi);
    if (!existing || r.timestamp > existing.timestamp) {
      latestMap.set(r.mmsi, r);
    }
  }
  return Array.from(latestMap.values()).map((r) => ({
    mmsi: r.mmsi,
    lat: r.lat,
    lng: r.lng,
    sog: r.sog,
    cog: r.cog,
    lastTimestamp: r.timestamp,
    lastIso: r.iso,
  }));
}

function queryTracks(q) {
  let filtered = loadRecords();

  if (q.mmsi) {
    const mmsiList = q.mmsi
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (mmsiList.length > 0) {
      const set = new Set(mmsiList);
      filtered = filtered.filter((r) => set.has(r.mmsi));
    }
  }

  if (q.start_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp >= q.start_time);
  }
  if (q.end_time !== undefined) {
    filtered = filtered.filter((r) => r.timestamp <= q.end_time);
  }

  if (q.bbox) {
    const parts = q.bbox
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    if (parts.length === 4) {
      const [minLat, maxLat, minLng, maxLng] = parts;
      filtered = filtered.filter(
        (r) => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng,
      );
    }
  }

  const total = filtered.length;
  const startIdx = (q.page - 1) * q.page_size;
  const data = filtered.slice(startIdx, startIdx + q.page_size);
  return { total, page: q.page, page_size: q.page_size, data };
}

module.exports = { getAllRecords, getShipsLatest, queryTracks };
