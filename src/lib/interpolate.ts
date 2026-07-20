export interface InterpolatableRecord {
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

export const MAX_REPORT_AGE = 5 * 60 // seconds — vessel hidden if no report within this window

function lerp(a: number | null | undefined, b: number | null | undefined, t: number): number | null {
  if (a == null || b == null) return a ?? b ?? null
  return a + (b - a) * t
}

function shortestAngle(a: number, b: number): number {
  const diff = ((b - a + 540) % 360) - 180
  return a + diff
}

function lerpAngle(a: number | null | undefined, b: number | null | undefined, t: number): number | null {
  if (a == null || b == null) return a ?? b ?? null
  return a + (shortestAngle(a, b) - a) * t
}

export function interpolateRecord(
  records: InterpolatableRecord[],
  targetTime: number
): InterpolatableRecord | null {
  if (records.length === 0) return null

  // Single-report vessel: only visible within MAX_REPORT_AGE of its one report.
  if (records.length === 1) {
    const r = records[0]
    return Math.abs(r.timestamp - targetTime) <= MAX_REPORT_AGE ? r : null
  }

  const first = records[0]
  const last = records[records.length - 1]

  // Only show the vessel when playback time is within its actual reported track.
  if (targetTime < first.timestamp || targetTime > last.timestamp) return null
  if (targetTime === first.timestamp) return first
  if (targetTime === last.timestamp) return last

  // Binary search for surrounding records
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

  // Unified rule: hide vessel if nearest real report is older than MAX_REPORT_AGE.
  const nearestDelta = Math.min(
    Math.abs(prev.timestamp - targetTime),
    Math.abs(next.timestamp - targetTime)
  )
  if (nearestDelta > MAX_REPORT_AGE) return null

  const ratio = (targetTime - prev.timestamp) / (next.timestamp - prev.timestamp)

  const result = {
    ...prev,
    lat: lerp(prev.lat, next.lat, ratio) ?? prev.lat,
    lng: lerp(prev.lng, next.lng, ratio) ?? prev.lng,
    sog: lerp(prev.sog, next.sog, ratio),
    cog: lerpAngle(prev.cog, next.cog, ratio),
    heading: lerpAngle(prev.heading, next.heading, ratio),
    status: ratio < 0.5 ? prev.status : next.status,
    timestamp: targetTime,
  }
  return result
}

export function interpolateSegment(
  records: InterpolatableRecord[],
  startTime: number,
  endTime: number,
  interval: number
): InterpolatableRecord[] {
  if (records.length === 0 || startTime > endTime || interval <= 0) return []

  const result: InterpolatableRecord[] = []
  for (let t = startTime; t <= endTime; t += interval) {
    const r = interpolateRecord(records, t)
    if (r) result.push(r)
  }
  return result
}

export function groupByMmsi(records: InterpolatableRecord[]): Map<number, InterpolatableRecord[]> {
  const map = new Map<number, InterpolatableRecord[]>()
  for (const r of records) {
    if (!map.has(r.mmsi)) map.set(r.mmsi, [])
    map.get(r.mmsi)!.push(r)
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.timestamp - b.timestamp)
  }
  return map
}

export function interpolateWindow(
  records: InterpolatableRecord[],
  centerTime: number,
  windowBehind: number,
  windowAhead: number,
  interval: number,
  minTime: number,
  maxTime: number
): InterpolatableRecord[] {
  const startTime = Math.max(minTime, centerTime - windowBehind)
  const endTime = Math.min(maxTime, centerTime + windowAhead)

  const byMmsi = groupByMmsi(records)
  const interpolated: InterpolatableRecord[] = []

  for (const [, track] of byMmsi) {
    interpolated.push(...interpolateSegment(track, startTime, endTime, interval))
  }

  interpolated.sort((a, b) => a.timestamp - b.timestamp)
  return interpolated
}
