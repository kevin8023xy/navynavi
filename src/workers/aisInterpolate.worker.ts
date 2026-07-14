// Web Worker for segmented AIS interpolation
// Computes dense interpolated points for a playback window without blocking UI.

interface AisRecord {
  mmsi: number
  lat: number
  lng: number
  sog?: number | null
  cog?: number | null
  heading?: number | null
  status?: number | null
  timestamp: number
  [key: string]: any
}

interface InterpolateMessage {
  type: 'INTERPOLATE'
  requestId: number
  records: AisRecord[]
  centerTime: number
  windowBehind: number
  windowAhead: number
  interval: number
  minTime: number
  maxTime: number
}

function lerp(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number
): number | null {
  if (a == null || b == null) return a ?? b ?? null
  return a + (b - a) * t
}

function shortestAngle(a: number, b: number): number {
  const diff = ((b - a + 540) % 360) - 180
  return a + diff
}

function lerpAngle(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number
): number | null {
  if (a == null || b == null) return a ?? b ?? null
  return a + (shortestAngle(a, b) - a) * t
}

function interpolateRecord(records: AisRecord[], targetTime: number): AisRecord | null {
  if (records.length === 0) return null
  if (records.length === 1 || targetTime <= records[0].timestamp) return records[0]

  const last = records[records.length - 1]
  if (targetTime >= last.timestamp) return last

  let lo = 0
  let hi = records.length - 1
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (records[mid].timestamp <= targetTime) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const prev = records[lo]
  const next = records[hi]
  if (prev.timestamp === next.timestamp) return prev

  const ratio = (targetTime - prev.timestamp) / (next.timestamp - prev.timestamp)

  return {
    ...prev,
    lat: lerp(prev.lat, next.lat, ratio) ?? prev.lat,
    lng: lerp(prev.lng, next.lng, ratio) ?? prev.lng,
    sog: lerp(prev.sog, next.sog, ratio),
    cog: lerpAngle(prev.cog, next.cog, ratio),
    heading: lerpAngle(prev.heading, next.heading, ratio),
    status: ratio < 0.5 ? prev.status : next.status,
    timestamp: targetTime,
  }
}

function interpolateSegment(
  records: AisRecord[],
  startTime: number,
  endTime: number,
  interval: number
): AisRecord[] {
  if (records.length === 0 || startTime > endTime || interval <= 0) return []
  const result: AisRecord[] = []
  for (let t = startTime; t <= endTime; t += interval) {
    const r = interpolateRecord(records, t)
    if (r) result.push(r)
  }
  return result
}

function groupByMmsi(records: AisRecord[]): Map<number, AisRecord[]> {
  const map = new Map<number, AisRecord[]>()
  for (const r of records) {
    if (!map.has(r.mmsi)) map.set(r.mmsi, [])
    map.get(r.mmsi)!.push(r)
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return map
}

self.onmessage = ({ data }: MessageEvent<InterpolateMessage>) => {
  const { records, centerTime, windowBehind, windowAhead, interval, minTime, maxTime, requestId } = data

  const startTime = Math.max(minTime, centerTime - windowBehind)
  const endTime = Math.min(maxTime, centerTime + windowAhead)

  const byMmsi = groupByMmsi(records)
  const interpolated: AisRecord[] = []

  for (const [, track] of byMmsi) {
    interpolated.push(...interpolateSegment(track, startTime, endTime, interval))
  }

  interpolated.sort((a, b) => a.timestamp - b.timestamp)

  self.postMessage({
    records: interpolated,
    window: { start: startTime, end: endTime },
    requestId,
  })
}
