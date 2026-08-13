import {
  interpolateSegment,
  groupByMmsi,
  computeFieldTrust,
  type InterpolatableRecord,
  MAX_REPORT_AGE,
} from '../lib/interpolate'

// Web Worker for segmented AIS interpolation
// Computes dense interpolated points for a playback window without blocking UI.
// 复用主库的插值（Cubic Spline + COG 约束 / 剧烈转向 PCHIP）。

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
  maxReportAge: number
}

// 把 worker 收到的最小记录转成主库需要的形状（字段兼容，直接断言）
function toInterp(records: AisRecord[]): InterpolatableRecord[] {
  return records as unknown as InterpolatableRecord[]
}

self.onmessage = ({ data }: MessageEvent<InterpolateMessage>) => {
  const { records, centerTime, windowBehind, windowAhead, interval, minTime, maxTime, maxReportAge = MAX_REPORT_AGE, requestId } = data

  const startTime = Math.max(minTime, centerTime - windowBehind)
  const endTime = Math.min(maxTime, centerTime + windowAhead)

  const byMmsi = groupByMmsi(toInterp(records))
  const interpolated: AisRecord[] = []

  for (const [, track] of byMmsi) {
    // 全船级 COG/HDG 信任度：与主线程播放一致
    const trust = computeFieldTrust(track)
    interpolated.push(...interpolateSegment(track, startTime, endTime, interval, maxReportAge, trust))
  }

  interpolated.sort((a, b) => a.timestamp - b.timestamp)

  self.postMessage({
    records: interpolated,
    window: { start: startTime, end: endTime },
    requestId,
  })
}
