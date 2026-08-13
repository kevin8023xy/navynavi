const fs = require('fs')
const lines = fs.readFileSync('ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv', 'utf8').split(/\r?\n/)
const recs = lines.slice(1).filter((l) => l.startsWith('412208450,')).map((l) => {
  const c = l.split(',')
  return { lat: +c[1], lng: +c[2], sog: +c[3], cog: +c[4], hdg: +c[5], ts: +c[7] }
})
console.log('total records:', recs.length)
function brg(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180
  const dl = r(c - b)
  const y = Math.sin(dl) * Math.cos(r(d))
  const x = Math.cos(r(a)) * Math.sin(r(d)) - Math.sin(r(a)) * Math.cos(r(d)) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
let n = 0, sumH = 0, sumC = 0, sumB = 0
for (let i = 1; i < recs.length; i++) {
  const p = recs[i - 1], q = recs[i]
  const dist = Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180))
  if (dist < 30 || q.sog < 3) continue
  const b = brg(p.lat, p.lng, q.lat, q.lng)
  sumB += b
  sumH += q.hdg
  sumC += q.cog
  if (n < 8) console.log('i=' + i, 'motion=' + b.toFixed(0).padStart(3), 'cog=' + String(q.cog).padStart(5), 'hdg=' + String(q.hdg).padStart(3))
  n++
}
console.log('avg motion=', (sumB / n).toFixed(1))
console.log('avg hdg   =', (sumH / n).toFixed(1))
console.log('avg cog   =', (sumC / n).toFixed(1))