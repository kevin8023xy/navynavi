const fs = require('fs')
const lines = fs.readFileSync('ship_tracks_2021-10-01_to_2021-10-01_191ships_207803positions.csv', 'utf8').split(/\r?\n/)
console.log('total lines:', lines.length)
const matches = lines.filter((l) => l.startsWith('412208740,'))
console.log('412208740 matches:', matches.length)
console.log('header:', lines[0].slice(0, 100))
console.log('first match:', matches[0]?.slice(0, 100))
// 看是否有 BOM
console.log('first line byte0:', Buffer.from(lines[0]).slice(0, 5).toString('hex'))