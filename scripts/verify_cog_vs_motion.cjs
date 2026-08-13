// 校验：报告的 COG 与实际位移方位角的一致性（修正版 bearing 公式）
const fs = require('fs')

const CSV = 'ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv'
const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/)

const byMmsi = new Map()
for (let i = 1; i < lines.length; i++) {
  const line = lines[i]
  if (!line) continue
  const c = line.split(',')
  const r = { mmsi: +c[0], lat: +c[1], lng: +c[2], sog: +c[3], cog: +c[4], hdg: +c[5], ts: +c[7] }
  if (!byMmsi.has(r.mmsi)) byMmsi.set(r.mmsi, [])
  byMmsi.get(r.mmsi).push(r)
}

// 标准球面方位角公式：0=北，顺时针
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function angDiff(a, b) {
  let d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const results = []
for (const [mmsi, recs] of byMmsi) {
  recs.sort((a, b) => a.ts - b.ts)
  const diffs = []
  const diffsHdg = []
  for (let i = 1; i < recs.length; i++) {
    const p = recs[i - 1]
    const q = recs[i]
    if (q.ts - p.ts <= 0) continue
    const dLat = (q.lat - p.lat) * 111320
    const dLng = (q.lng - p.lng) * 111320 * Math.cos((p.lat * Math.PI) / 180)
    const dist = Math.hypot(dLat, dLng)
    if (dist < 50 || q.sog < 3) continue
    const b = bearing(p.lat, p.lng, q.lat, q.lng)
    diffs.push(angDiff(b, q.cog))
    if (q.hdg !== 511) diffsHdg.push(angDiff(b, q.hdg))
  }
  if (diffs.length < 10) continue
  diffs.sort((a, b) => a - b)
  diffsHdg.sort((a, b) => a - b)
  results.push({
    mmsi,
    n: diffs.length,
    medCog: diffs[diffs.length >> 1].toFixed(1),
    p90Cog: diffs[Math.floor(diffs.length * 0.9)].toFixed(1),
    medHdg: diffsHdg.length ? diffsHdg[diffsHdg.length >> 1].toFixed(1) : '-',
  })
}

results.sort((a, b) => b.medCog - a.medCog)
console.log('mmsi | samples | median|motion-COG| | p90 | median|motion-HDG|')
for (const r of results.slice(0, 15)) console.log(`${r.mmsi} | ${r.n} | ${r.medCog} | ${r.p90Cog} | ${r.medHdg}`)
const all = results.map((r) => +r.medCog).sort((a, b) => a - b)
console.log('\nfleet median|motion-COG|: min=%s mid=%s max=%s  ships=%d',
  all[0], all[all.length >> 1], all[all.length - 1], all.length)
