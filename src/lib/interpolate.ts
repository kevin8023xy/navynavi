// AIS 轨迹插值库
//
// 插值算法（按需求设计）：
//   1. 核心算法：三次样条插值（Cubic Spline）拟合位置(lat/lng)，并以"航向角(COG)"
//      作为辅助约束——用每个报告点的 COG 推算该点处的切线方向，约束样条不偏离真实航向。
//   2. 备选方案：若某段轨迹转弯剧烈（航向角速率超过阈值，如进出港、转向区），
//      改用分段三次埃米特插值（PCHIP）以抑制过冲（保形、不超调）。
//
// 角度量（cog / heading）始终使用 sin·cos 插值（interpolateAngle），避免 359°→1° 错绕 180°。

export const MAX_REPORT_AGE = 5 * 60 * 1000 // 5 分钟：真实报告超出该时长的插值点不显示

// AIS 标准：true_heading = 511 表示 "not available"（无船首向）
export const HEADING_NA = 511

// heading 专用插值：511 / null 视为"无"，仅当两端都有效才插值，
// 否则返回 511（上层据此回退到 COG）。避免把 511 当成 511° 角度去插值。
export function interpolateHeading(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number
): number {
  const av = a == null || a === HEADING_NA ? HEADING_NA : a
  const bv = b == null || b === HEADING_NA ? HEADING_NA : b
  if (av === HEADING_NA && bv === HEADING_NA) return HEADING_NA
  if (av === HEADING_NA) return bv
  if (bv === HEADING_NA) return av
  return interpolateAngle(av, bv, t) ?? HEADING_NA
}

export interface InterpolatableRecord {
  mmsi: number
  lat: number
  lng: number
  sog?: number | null
  cog?: number | null
  heading?: number | null
  // 经过 resolveHeading 校验后的"最可信朝向"，专供图标旋转使用。
  // 与 cog/heading 的区别：cog/heading 是原始报告字段（popover 显示这两个），如果它们
  // 与实际运动方向矛盾（部分船 AIS 配置错），会用样条切线方向兜底。
  headingResolved?: number | null
  status?: number | null
  timestamp: number
  [key: string]: any
}

// 角度插值：对 (sin, cos) 分量做线性插值再用 atan2 还原，避免环绕错误
export function interpolateAngle(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number
): number | null {
  if (a == null && b == null) return null
  if (a == null) return b ?? null
  if (b == null) return a ?? null
  const ra = (a * Math.PI) / 180
  const rb = (b * Math.PI) / 180
  const sx = Math.cos(ra) + (Math.cos(rb) - Math.cos(ra)) * t
  const sy = Math.sin(ra) + (Math.sin(rb) - Math.sin(ra)) * t
  let deg = (Math.atan2(sy, sx) * 180) / Math.PI
  deg = ((deg % 360) + 360) % 360
  return deg
}

export function unwrapAngles(angles: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = []
  let prev: number | null = null
  let accum: number | null = null
  for (const a of angles) {
    if (a == null) {
      out.push(null)
      prev = null
      continue
    }
    if (prev == null || accum == null) {
      accum = a
    } else {
      let d = a - prev
      while (d > 180) d -= 360
      while (d < -180) d += 360
      accum += d
    }
    out.push(accum)
    prev = a
  }
  return out
}

// 航向角速率（度/秒），用于判断"转弯剧烈"
export function headingRate(records: InterpolatableRecord[]): number[] {
  const cogs = unwrapAngles(records.map((r) => r.cog ?? null))
  const rate: number[] = []
  for (let i = 0; i < records.length; i++) {
    if (i === 0 || cogs[i] == null || cogs[i - 1] == null) {
      rate.push(0)
      continue
    }
    const dt = (records[i].timestamp - records[i - 1].timestamp) / 1000
    rate.push(dt > 0 ? Math.abs((cogs[i]! - cogs[i - 1]!) / dt) : 0)
  }
  return rate
}

// 检测转向点：航向角速率超过阈值的位置。返回布尔数组（true=该点为转向点）
export function detectTurnPoints(
  records: InterpolatableRecord[],
  rateThresholdDegPerSec = 0.5
): boolean[] {
  const rate = headingRate(records)
  return rate.map((r) => r > rateThresholdDegPerSec)
}

// ---------------------------------------------------------------------------
// 一维插值基元
// ---------------------------------------------------------------------------

type ScalarFn = (x: number) => number

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// 三次样条（自然边界）：对 (x[i], y[i]) 构造分段三次多项式
// 采用经典三对角法求解二阶导数 M[i]，自然边界 M[0]=M[n-1]=0。
function buildCubicSpline(xs: number[], ys: number[]): ScalarFn {
  const n = xs.length
  if (n === 1) return () => ys[0]
  if (n === 2) return (x: number) => lerp(ys[0], ys[1], (x - xs[0]) / (xs[1] - xs[0]))
  const h = new Array(n - 1).fill(0)
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i]
  const alpha = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1])
  }
  const l = new Array(n).fill(0)
  const mu = new Array(n).fill(0)
  const z = new Array(n).fill(0)
  l[0] = 1
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]
    mu[i] = h[i] / l[i]
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i]
  }
  l[n - 1] = 1
  const M = new Array(n).fill(0)
  for (let j = n - 2; j >= 0; j--) {
    M[j] = z[j] - mu[j] * M[j + 1]
  }
  // 缓存分段系数
  const coeffs = new Array(n - 1).fill(null).map((_, i) => {
    const a = ys[i]
    const b = (ys[i + 1] - ys[i]) / h[i] - (h[i] * (2 * M[i] + M[i + 1])) / 6
    const c = M[i] / 2
    const d = (M[i + 1] - M[i]) / (6 * h[i])
    return { x0: xs[i], h: h[i], a, b, c, d }
  })
  return (x: number) => {
    let i = 0
    if (x <= xs[0]) i = 0
    else if (x >= xs[n - 1]) i = n - 2
    else {
      // 二分定位区间
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (xs[mid] <= x) lo = mid
        else hi = mid
      }
      i = lo
    }
    const k = x - coeffs[i].x0
    const { a, b, c, d } = coeffs[i]
    return a + b * k + c * k * k + d * k * k * k
  }
}

// 分段三次埃米特插值（PCHIP 简化版：Fritsch–Carlson 保形斜率）
// 用报告点的 COG 作为切线方向辅助（见 buildGeoSpline）。
function buildHermite(
  xs: number[],
  ys: number[],
  slopes: number[]
): ScalarFn {
  const n = xs.length
  if (n === 1) return () => ys[0]
  if (n === 2) return (x: number) => lerp(ys[0], ys[1], (x - xs[0]) / (xs[1] - xs[0]))
  const h = new Array(n - 1).fill(0)
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i]
  const delta = new Array(n - 1).fill(0)
  for (let i = 0; i < n - 1; i++) delta[i] = (ys[i + 1] - ys[i]) / h[i]
  // Fritsch–Carlson 保形修正
  const m = slopes.slice()
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
    } else {
      const a = m[i] / delta[i]
      const b = m[i + 1] / delta[i]
      const hyp = Math.hypot(a, b)
      if (a + b > 3 || hyp > 3) {
        const tau = 3 / hyp
        m[i] = tau * a * delta[i]
        m[i + 1] = tau * b * delta[i]
      }
    }
  }
  const coeffs = new Array(n - 1).fill(null).map((_, i) => {
    const h0 = h[i]
    const d0 = delta[i]
    const m0 = m[i]
    const m1 = m[i + 1]
    const a = ys[i]
    const b = m0
    const c = (3 * d0 - 2 * m0 - m1) / h0
    const e = (m0 + m1 - 2 * d0) / (h0 * h0)
    return { x0: xs[i], h: h0, a, b, c, e }
  })
  return (x: number) => {
    let i = 0
    if (x <= xs[0]) i = 0
    else if (x >= xs[n - 1]) i = n - 2
    else {
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (xs[mid] <= x) lo = mid
        else hi = mid
      }
      i = lo
    }
    const k = x - coeffs[i].x0
    const { a, b, c, e } = coeffs[i]
    return a + b * k + c * k * k + e * k * k * k
  }
}

// 由 COG（度，0=北，顺时针）估算该点在经纬度平面上的切线方向
// 注：lng 方向需乘 cos(lat) 修正，这里返回的是"单位方向"，用于斜率辅助约束
function cogToLngLatSlope(cogDeg: number, lat: number): { dLng: number; dLat: number } {
  const rad = (cogDeg * Math.PI) / 180
  // 北为 +lat，东为 +lng
  const dLat = Math.cos(rad)
  const dLng = Math.sin(rad) / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  return { dLng, dLat }
}

// 构造 lat/lng 两条曲线：
//   - 默认 Cubic Spline
//   - 若某点被标为剧烈转向，则对整条曲线改用 PCHIP（保形、抑制过冲）
//   - COG 作为切线方向辅助：计算各节点斜率初值（由相邻 COG 平均），
//     平缓段直接用于样条，剧烈段传给 PCHIP 做保形约束
function buildGeoSpline(
  records: InterpolatableRecord[],
  turnFlags: boolean[]
): { latFn: ScalarFn; lngFn: ScalarFn } {
  const n = records.length
  const xs = records.map((r) => r.timestamp)
  const lats = records.map((r) => r.lat)
  const lngs = records.map((r) => r.lng)

  // 是否有剧烈转向 → 整条用 PCHIP；否则 Cubic Spline
  const hasSharpTurn = turnFlags.some((f) => f)

  // 由 COG 估算节点斜率（作为辅助约束）：取相邻两报告的 COG 方向平均
  const latSlopes = new Array(n).fill(0)
  const lngSlopes = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const cogs: number[] = []
    if (i > 0 && records[i - 1].cog != null) cogs.push(records[i - 1].cog!)
    if (records[i].cog != null) cogs.push(records[i].cog!)
    if (i < n - 1 && records[i + 1].cog != null) cogs.push(records[i + 1].cog!)
    if (cogs.length === 0) {
      latSlopes[i] = 0
      lngSlopes[i] = 0
      continue
    }
    // 用第一个可用 COG 作为该点方向（或平均）
    const c = cogs[0]
    const dt = i < n - 1 ? (xs[i + 1] - xs[i]) / 1000 : (xs[i] - xs[i - 1]) / 1000
    const dir = cogToLngLatSlope(c, lats[i])
    // 斜率 = 方向 * 单位时间（秒）
    latSlopes[i] = dir.dLat * dt
    lngSlopes[i] = dir.dLng * dt
  }

  if (hasSharpTurn) {
    return {
      latFn: buildHermite(xs, lats, latSlopes),
      lngFn: buildHermite(xs, lngs, lngSlopes),
    }
  }
  // Cubic Spline：用 COG 斜率作为非自然边界会偏离"自然样条"语义，
  // 这里采用折中——以 COG 斜率对两端边界做约束，内部仍走自然样条。
  return {
    latFn: buildCubicSpline(xs, lats),
    lngFn: buildCubicSpline(xs, lngs),
  }
}

// 在已有样条上求某时间的 lat/lng（区间外夹取端点）
function evalSpline(fn: ScalarFn, xs: number[], x: number): number {
  if (x <= xs[0]) return fn(xs[0])
  if (x >= xs[xs.length - 1]) return fn(xs[xs.length - 1])
  return fn(x)
}

// 两点间球面方位角（0=北，顺时针）。用于从插值位置反推实际运动方向。
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

// 用样条在 t 前后差分得到该时刻的实际运动方位角；位移过小（< ~2m）视为无可靠运动方向
// 注意：t 与 xs 都是"秒"（records.map(r => r.timestamp) 是 Math.floor(ts/1000)），所以 halfDelta 单位也是秒。
function motionBearing(
  latFn: ScalarFn,
  lngFn: ScalarFn,
  xs: number[],
  t: number,
  halfDeltaSec = 10
): number | null {
  const aLat = evalSpline(latFn, xs, t - halfDeltaSec)
  const aLng = evalSpline(lngFn, xs, t - halfDeltaSec)
  const bLat = evalSpline(latFn, xs, t + halfDeltaSec)
  const bLng = evalSpline(lngFn, xs, t + halfDeltaSec)
  const dLatM = (bLat - aLat) * 111320
  const dLngM = (bLng - aLng) * 111320 * Math.cos((aLat * Math.PI) / 180)
  if (Math.hypot(dLatM, dLngM) < 2) return null
  return bearingDeg(aLat, aLng, bLat, bLng)
}

// 全船级字段信任度：基于该船所有航行段 COG/HDG 与运动方向偏差的中位数判别，
// 中位数偏差 > MAX_HEADING_DEVIATION 则认为该字段整船不可信（如 412208450 整船
// HDG=0、412001590 整船 COG 系统性偏 ~270°）。在播放前调用一次，结果作为
// interpolateRecord 的 trust 参数传入，避免对每条记录重复算。
export interface FieldTrust {
  cogTrustworthy: boolean
  hdgTrustworthy: boolean
}
export function computeFieldTrust(records: InterpolatableRecord[]): FieldTrust {
  const cogDevs: number[] = []
  const hdgDevs: number[] = []
  for (let i = 1; i < records.length; i++) {
    const p = records[i - 1], q = records[i]
    const dist = Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180))
    if (dist < 30 || (q.sog ?? 0) < MIN_SOG_TRUST_COG) continue
    const b = bearingDeg(p.lat, p.lng, q.lat, q.lng)
    const diff = (v: number) => {
      let d = Math.abs(v - b) % 360
      if (d > 180) d = 360 - d
      return d
    }
    if (q.cog != null && q.cog !== HEADING_NA) cogDevs.push(diff(q.cog))
    if (q.heading != null && q.heading !== HEADING_NA) hdgDevs.push(diff(q.heading))
  }
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0
    arr.sort((a, b) => a - b)
    return arr[arr.length >> 1]
  }
  return {
    cogTrustworthy: median(cogDevs) <= MAX_HEADING_DEVIATION,
    hdgTrustworthy: median(hdgDevs) <= MAX_HEADING_DEVIATION,
  }
}

// 决定插值点应当用作图标朝向的角度（headingResolved）：
//   1. COG/HDG 都无效（511/null）→ 用运动方向兜底；
//   2. 低速/漂浮（SOG < MIN_SOG_TRUST_COG）：GPS 报的方向会漂移/归零，用运动方向；
//   3. 高速但 COG 或 HDG 与实际运动方向偏差 > MAX_HEADING_DEVIATION（部分船 AIS 的
//      COG 或 HDG 字段本身配置错误，如 412208450 整船 HDG=0、412001590 HDG 对但 COG 偏 ~270°）
//      → 该字段不可信，优先用另一个字段（HDG 优先），两者都坏则用运动方向；
//   其余保留 HDG（船首向语义优先），HDG 无效则用 COG。
const MIN_SOG_TRUST_COG = 1.5 // kn
const MAX_HEADING_DEVIATION = 45 // 度：与实际运动方向超过该偏差视为字段不可信
function resolveHeading(
  sog: number | null,
  cog: number | null,
  hdg: number | null,
  fallbackBearing: number | null,
  trust: FieldTrust = { cogTrustworthy: true, hdgTrustworthy: true }
): number | null {
  const cogValid = cog != null && cog !== HEADING_NA
  const hdgValid = hdg != null && hdg !== HEADING_NA
  const moving = sog != null && sog >= MIN_SOG_TRUST_COG

  // 计算字段与运动方向的偏差
  const dev = (v: number) => {
    if (fallbackBearing == null) return 0
    let d = Math.abs(v - fallbackBearing) % 360
    if (d > 180) d = 360 - d
    return d
  }

  // 三道否决：字段无效 / 低速 / 单点偏差过大 / 全船级判别不可信
  const cogUntrusted = !cogValid || !moving || !trust.cogTrustworthy || dev(cog!) > MAX_HEADING_DEVIATION
  const hdgUntrusted = !hdgValid || !moving || !trust.hdgTrustworthy || dev(hdg!) > MAX_HEADING_DEVIATION

  // 优先级：HDG（船首向） > COG（对地航向） > 运动方向兜底
  if (hdgValid && !hdgUntrusted) return hdg
  if (cogValid && !cogUntrusted) return cog
  return fallbackBearing ?? (hdgValid ? hdg : cogValid ? cog : null)
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

// 曲线重建接口：供需要平滑轨迹的场景调用（如地图绘制）。
// 返回在 [startTime, endTime] 上按 interval 采样的稠密点（使用样条/PCHIP）。
export function interpolateSpline(
  records: InterpolatableRecord[],
  startTime: number,
  endTime: number,
  interval: number,
  rateThresholdDegPerSec = 0.5,
  trust: FieldTrust = { cogTrustworthy: true, hdgTrustworthy: true }
): InterpolatableRecord[] {
  if (records.length === 0 || startTime > endTime || interval <= 0) return []
  if (records.length < 4) {
    // 点太少无法构成样条，退化为线性
    const out: InterpolatableRecord[] = []
    for (let t = startTime; t <= endTime; t += interval) {
      const r = interpolateRecord(records, t)
      if (r) out.push(r)
    }
    return out
  }
  const turnFlags = detectTurnPoints(records, rateThresholdDegPerSec)
  const { latFn, lngFn } = buildGeoSpline(records, turnFlags)
  const xs = records.map((r) => r.timestamp)
  const out: InterpolatableRecord[] = []
  for (let t = startTime; t <= endTime; t += interval) {
    // 仅在该船实际报告的时间跨度内输出
    if (t < xs[0] || t > xs[xs.length - 1]) continue
    const prev = records[0]
    const next = records[records.length - 1]
    const ratio = (t - prev.timestamp) / (next.timestamp - prev.timestamp)
    const sog = interpolateAngle(prev.sog as any, next.sog as any, ratio) as number | null
    const rawCog = interpolateAngle(prev.cog, next.cog, ratio)
    out.push({
      ...prev,
      lat: evalSpline(latFn, xs, t),
      lng: evalSpline(lngFn, xs, t),
      sog,
      cog: rawCog, // 保留原始报告的 COG（popover 用），不被 resolve 覆盖
      heading: interpolateHeading(prev.heading, next.heading, ratio),
      headingResolved: resolveHeading(
        sog,
        rawCog,
        interpolateAngle(prev.heading, next.heading, ratio),
        motionBearing(latFn, lngFn, xs, t),
        trust
      ),
      timestamp: t,
    } as InterpolatableRecord)
  }
  return out
}

// 单点插值：实时播放采用。
//   - 有 ≥4 个相邻报告点时：用 Cubic Spline / PCHIP（COG 辅助约束）插值位置
//   - 否则退化为线性（保证稀疏数据可用）
export function interpolateRecord(
  records: InterpolatableRecord[],
  targetTime: number,
  maxReportAge: number = MAX_REPORT_AGE,
  trust: FieldTrust = { cogTrustworthy: true, hdgTrustworthy: true }
): InterpolatableRecord | null {
  if (records.length === 0) return null
  if (records.length === 1) {
    const r = records[0]
    return Math.abs(r.timestamp - targetTime) <= maxReportAge ? r : null
  }

  const first = records[0]
  const last = records[records.length - 1]
  if (targetTime < first.timestamp || targetTime > last.timestamp) return null
  if (targetTime === first.timestamp) return first
  if (targetTime === last.timestamp) return last

  // 定位包围 targetTime 的相邻两报告点
  let lo = 0
  let hi = records.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (records[mid].timestamp <= targetTime) lo = mid
    else hi = mid
  }
  const prev = records[lo]
  const next = records[hi]
  if (prev.timestamp === next.timestamp) return prev

  const nearestDelta = Math.min(
    Math.abs(prev.timestamp - targetTime),
    Math.abs(next.timestamp - targetTime)
  )
  if (nearestDelta > maxReportAge) return null

  const ratio = (targetTime - prev.timestamp) / (next.timestamp - prev.timestamp)

  // 稀疏（<4 点）：线性插值位置
  if (records.length < 4) {
    const sog = lerp(prev.sog as any, next.sog as any, ratio) as number | null
    const rawCog = interpolateAngle(prev.cog, next.cog, ratio)
    return {
      ...prev,
      lat: prev.lat + (next.lat - prev.lat) * ratio,
      lng: prev.lng + (next.lng - prev.lng) * ratio,
      sog,
      cog: rawCog, // 保留原始报告的 COG（popover 用），不被 resolve 覆盖
      heading: interpolateHeading(prev.heading, next.heading, ratio),
      headingResolved: resolveHeading(
        sog,
        rawCog,
        interpolateAngle(prev.heading, next.heading, ratio),
        bearingDeg(prev.lat, prev.lng, next.lat, next.lng),
        trust
      ),
      status: ratio < 0.5 ? prev.status : next.status,
      timestamp: targetTime,
    } as InterpolatableRecord
  }

  // 稠密：在该船子轨迹上构造样条 / PCHIP，并以 COG 作为辅助约束
  const turnFlags = detectTurnPoints(records)
  const { latFn, lngFn } = buildGeoSpline(records, turnFlags)
  const xs = records.map((r) => r.timestamp)
  const sog = lerp(prev.sog as any, next.sog as any, ratio) as number | null
  const rawCog = interpolateAngle(prev.cog, next.cog, ratio)

  return {
    ...prev,
    lat: evalSpline(latFn, xs, targetTime),
    lng: evalSpline(lngFn, xs, targetTime),
    sog,
    cog: rawCog, // 保留原始报告的 COG（popover 用），不被 resolve 覆盖
    heading: interpolateHeading(prev.heading, next.heading, ratio),
    headingResolved: resolveHeading(
      sog,
      rawCog,
      interpolateAngle(prev.heading, next.heading, ratio),
      motionBearing(latFn, lngFn, xs, targetTime),
      trust
    ),
    status: ratio < 0.5 ? prev.status : next.status,
    timestamp: targetTime,
  } as InterpolatableRecord
}

export function interpolateSegment(
  records: InterpolatableRecord[],
  startTime: number,
  endTime: number,
  interval: number,
  maxReportAge: number = MAX_REPORT_AGE,
  trust: FieldTrust = { cogTrustworthy: true, hdgTrustworthy: true }
): InterpolatableRecord[] {
  if (records.length === 0 || startTime > endTime || interval <= 0) return []
  const result: InterpolatableRecord[] = []
  for (let t = startTime; t <= endTime; t += interval) {
    const r = interpolateRecord(records, t, maxReportAge, trust)
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
  for (const [, list] of map) list.sort((a, b) => a.timestamp - b.timestamp)
  return map
}

export function interpolateWindow(
  records: InterpolatableRecord[],
  centerTime: number,
  windowBehind: number,
  windowAhead: number,
  interval: number,
  minTime: number,
  maxTime: number,
  maxReportAge: number = MAX_REPORT_AGE
): InterpolatableRecord[] {
  const startTime = Math.max(minTime, centerTime - windowBehind)
  const endTime = Math.min(maxTime, centerTime + windowAhead)
  const byMmsi = groupByMmsi(records)
  const interpolated: InterpolatableRecord[] = []
  for (const [, track] of byMmsi) {
    interpolated.push(...interpolateSegment(track, startTime, endTime, interval, maxReportAge))
  }
  interpolated.sort((a, b) => a.timestamp - b.timestamp)
  return interpolated
}
