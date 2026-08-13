// 验证修复后的播放链路：低速时 cog 应被替换为运动方向，旋转角应贴近实际运动方向
const fs = require('fs')

const CSV = 'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv'
const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/)

function loadMmsi(mmsi) {
  const recs = []
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l || !l.startsWith(mmsi + ',')) continue
    const c = l.split(',')
    recs.push({
      mmsi: +c[0], lat: +c[1], lng: +c[2],
      sog: +c[3], cog: +c[4], heading: +c[5], status: +c[6],
      timestamp: +c[7] * 1000,
    })
  }
  recs.sort((a, b) => a.timestamp - b.timestamp)
  return recs
}

const HEADING_NA = 511
const MIN_SOG_TRUST_COG = 1.5
const MAX_HEADING_DEVIATION = 45

function interpolateAngle(a, b, t) {
  if (a == null && b == null) return null
  if (a == null) return b ?? null
  if (b == null) return a ?? null
  const ra = (a * Math.PI) / 180, rb = (b * Math.PI) / 180
  const sx = Math.cos(ra) + (Math.cos(rb) - Math.cos(ra)) * t
  const sy = Math.sin(ra) + (Math.sin(rb) - Math.sin(ra)) * t
  let deg = (Math.atan2(sy, sx) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}
function interpolateHeading(a, b, t) {
  const av = a == null || a === HEADING_NA ? HEADING_NA : a
  const bv = b == null || b === HEADING_NA ? HEADING_NA : b
  if (av === HEADING_NA && bv === HEADING_NA) return HEADING_NA
  if (av === HEADING_NA) return bv
  if (bv === HEADING_NA) return av
  return interpolateAngle(av, bv, t) ?? HEADING_NA
}
function lerp(a, b, t) { if (a == null && b == null) return null; if (a == null) return b; if (b == null) return a; return a + (b - a) * t }

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

// 与 interpolate.ts 一致的 resolveHeading（同时校验 HDG 和 COG）
function resolveHeading(sog, cog, hdg, fallbackBearing, trust) {
  trust = trust || { cogTrustworthy: true, hdgTrustworthy: true }
  const cogValid = cog != null && cog !== HEADING_NA
  const hdgValid = hdg != null && hdg !== HEADING_NA
  const moving = sog != null && sog >= MIN_SOG_TRUST_COG
  const dev = (v) => {
    if (fallbackBearing == null) return 0
    let d = Math.abs(v - fallbackBearing) % 360
    if (d > 180) d = 360 - d
    return d
  }
  const cogUntrusted = !cogValid || !moving || !trust.cogTrustworthy || dev(cog) > MAX_HEADING_DEVIATION
  const hdgUntrusted = !hdgValid || !moving || !trust.hdgTrustworthy || dev(hdg) > MAX_HEADING_DEVIATION
  if (hdgValid && !hdgUntrusted) return hdg
  if (cogValid && !cogUntrusted) return cog
  return fallbackBearing ?? (hdgValid ? hdg : cogValid ? cog : null)
}

// 与 interpolate.ts 一致的 computeFieldTrust（全船级信任度）
function computeFieldTrust(records) {
  const cogDevs = [], hdgDevs = []
  for (let i = 1; i < records.length; i++) {
    const p = records[i - 1], q = records[i]
    const dist = Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180))
    if (dist < 30 || (q.sog || 0) < MIN_SOG_TRUST_COG) continue
    const b = bearingDeg(p.lat, p.lng, q.lat, q.lng)
    const diff = (v) => { let d = Math.abs(v - b) % 360; return d > 180 ? 360 - d : d }
    if (q.cog != null && q.cog !== HEADING_NA) cogDevs.push(diff(q.cog))
    if (q.heading != null && q.heading !== HEADING_NA) hdgDevs.push(diff(q.heading))
  }
  const median = (arr) => arr.length === 0 ? 0 : arr.sort((a, b) => a - b)[arr.length >> 1]
  return {
    cogTrustworthy: median(cogDevs) <= MAX_HEADING_DEVIATION,
    hdgTrustworthy: median(hdgDevs) <= MAX_HEADING_DEVIATION,
  }
}

// 简化版 interpolateRecord（线性分支，与主库 cog/heading 逻辑一致）
function interpolateRecord(records, targetTime, trust) {
  if (records.length === 0) return null
  if (records.length === 1) return records[0]
  const first = records[0], last = records[records.length - 1]
  if (targetTime < first.timestamp || targetTime > last.timestamp) return null
  let lo = 0, hi = records.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (records[mid].timestamp <= targetTime) lo = mid; else hi = mid }
  const prev = records[lo], next = records[hi]
  if (prev.timestamp === next.timestamp) return prev
  const ratio = (targetTime - prev.timestamp) / (next.timestamp - prev.timestamp)
  const sog = lerp(prev.sog, next.sog, ratio)
  const rawCog = interpolateAngle(prev.cog, next.cog, ratio)
  return {
    ...prev,
    lat: prev.lat + (next.lat - prev.lat) * ratio,
    lng: prev.lng + (next.lng - prev.lng) * ratio,
    sog,
    cog: rawCog, // 与 interpolate.ts 一致：cog 保留原始报告值，headingResolved 才用于图标
    heading: interpolateHeading(prev.heading, next.heading, ratio),
    headingResolved: resolveHeading(
      sog,
      rawCog,
      interpolateAngle(prev.heading, next.heading, ratio),
      bearingDeg(prev.lat, prev.lng, next.lat, next.lng),
      trust
    ),
    timestamp: targetTime,
  }
}

function getShipRotation(record) {
  if (record.headingResolved != null) return record.headingResolved
  if (record.heading != null && record.heading !== 511) return record.heading
  if (record.cog != null && record.cog !== 511) return record.cog
  return 0
}

function motionBearingAt(records, t, dt = 20000) {
  const a = interpolateRecord(records, t)
  const b = interpolateRecord(records, t + dt)
  if (!a || !b) return null
  const dLatM = (b.lat - a.lat) * 111320
  const dLngM = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  if (Math.hypot(dLatM, dLngM) < 2) return null
  return bearingDeg(a.lat, a.lng, b.lat, b.lng)
}

function angDiff(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

const mmsi = process.argv[2] || '413478330'
const recs = loadMmsi(mmsi)
console.log('MMSI', mmsi, 'records:', recs.length)
if (recs.length < 2) process.exit(0)
const trust = computeFieldTrust(recs)
console.log('trust:', JSON.stringify(trust))

const t0 = recs[0].timestamp, t1 = recs[recs.length - 1].timestamp
console.log('time | sog | rawCog | getShipRotation | motionBearing | |err|')
let errs = 0, n = 0
for (let i = 1; i <= 15; i++) {
  const t = t0 + ((t1 - t0) * i) / 16
  const r = interpolateRecord(recs, t, trust)
  if (!r) continue
  const rot = getShipRotation(r)
  const motion = motionBearingAt(recs, t)
  const err = motion == null ? null : angDiff(rot, motion)
  if (err != null) { errs += err; n++ }
  console.log(
    new Date(t).toISOString().slice(11, 19),
    '|', (r.sog == null ? '-' : r.sog.toFixed(1)).padStart(4),
    '|', (r.cog == null ? '-' : r.cog.toFixed(1)).padStart(7),
    '|', rot.toFixed(1).padStart(13),
    '|', (motion == null ? 'null(静止)' : motion.toFixed(1)).padStart(12),
    '|', err == null ? '-' : err.toFixed(1)
  )
}
console.log('平均误差（仅运动时刻）:', n ? (errs / n).toFixed(1) + '°' : '无')
