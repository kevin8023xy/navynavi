import { useState, useRef, useEffect } from 'react'
import { X, Ship, Play, MapPin } from 'lucide-react'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import maplibregl from 'maplibre-gl'

interface InjectShipProps {
  map: maplibregl.Map | null
  onClose?: () => void
}

interface ChannelInfo {
  used_temp_centerline: boolean
  ref_dist_to_centerline_m: number
  in_channel: boolean
  target_heading_deg: number
  heading_aligned: boolean
}

interface InjectResult {
  ref_mmsi: number
  t: number
  neighbor_mmsi: number
  neighbor_dist_m: number
  channel: ChannelInfo
  injected: Array<{
    step: number
    t: number
    lng: number
    lat: number
    cog: number
    sog: number
    in_channel: boolean
  }>
}

function dateToLocalDateTimeString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}:${s}`
}

export default function InjectShip({ map, onClose }: InjectShipProps) {
  const [refMmsi, setRefMmsi] = useState('')
  const [ts, setTs] = useState('')
  const [horizon, setHorizon] = useState(600)
  const [minSog, setMinSog] = useState(3)
  const [excludeFishing, setExcludeFishing] = useState(true)
  const [excludeTowing, setExcludeTowing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<InjectResult | null>(null)
  const [chartData, setChartData] = useState<InjectResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const srcRef = useRef<string | null>(null)
  const layerRef = useRef<string | null>(null)

  // 清理地图叠层
  const clearOverlay = () => {
    if (!map) return
    if (layerRef.current) {
      try { map.removeLayer(layerRef.current) } catch { /* noop */ }
      layerRef.current = null
    }
    if (srcRef.current) {
      try { map.removeSource(srcRef.current) } catch { /* noop */ }
      srcRef.current = null
    }
  }

  useEffect(() => () => clearOverlay(), [map])

  const runInject = async () => {
    setLoading(true)
    setError(null)
    try {
      const mmsiNum = Number(refMmsi)
      const tNum = ts.trim()
        ? Math.floor(new Date(ts).getTime() / 1000)
        : Math.floor(Date.now() / 1000)
      if (!Number.isFinite(mmsiNum) || mmsiNum <= 0) {
        setError('Please enter a valid reference ship MMSI')
        setLoading(false)
        return
      }
      const params = new URLSearchParams({
        ref_mmsi: String(mmsiNum),
        t: String(tNum),
        horizon: String(horizon),
        min_sog: String(minSog),
        exclude_fishing: excludeFishing ? '1' : '0',
        exclude_towing: excludeTowing ? '1' : '0',
      })
      const resp = await fetch(`/api/inject?${params.toString()}`)
      const data = await resp.json()
      if (data.error) {
        setError(data.error)
        setResult(null)
      } else if (!data.injected) {
        setError(data.reason || 'No suitable ship pair found (no valid neighbor near reference ship)')
        setResult(null)
      } else {
        setResult(data)
        drawOverlay(data)
        setChartData(data)
      }
    } catch (e) {
      setError((e as Error).message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const drawOverlay = (data: InjectResult) => {
    if (!map) return
    clearOverlay()
    const coords = data.injected.map((p) => [p.lng, p.lat])
    const srcName = `inject-source-${Date.now()}`
    map.addSource(srcName, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      },
    })
    const layerName = `inject-layer-${srcName}`
    map.addLayer({
      id: layerName,
      type: 'line',
      source: srcName,
      paint: { 'line-color': '#ff7a18', 'line-width': 3, 'line-dasharray': [2, 1] },
    })
    if (coords.length > 0) {
      const c = coords[0]
      map.flyTo({ center: [c[0], c[1]], zoom: Math.max(map.getZoom(), 11) })
    }
    srcRef.current = srcName
    layerRef.current = layerName
  }

  return (
    <div className="absolute left-1/2 top-4 z-30 w-[440px] -translate-x-1/2 rounded-lg border border-white/10 bg-slate-900/95 p-4 text-slate-100 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Ship className="h-4 w-4 text-orange-400" />
          Inject Ship (merge into fairway between two ships)
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span>Reference Ship MMSI</span>
          <input
            value={refMmsi}
            onChange={(e) => setRefMmsi(e.target.value)}
            placeholder="e.g. 413791515"
            className="rounded border border-white/10 bg-slate-800 px-2 py-1 outline-none focus:border-orange-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Time (UTC)</span>
          <DateTimePicker
            value={ts ? new Date(ts) : null}
            onChange={(d) => setTs(d ? dateToLocalDateTimeString(d) : '')}
            format="MM/dd/yyyy hh:mm aa"
            ampm
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
              },
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Merge duration (sec)</span>
          <input
            type="number"
            value={horizon}
            onChange={(e) => setHorizon(Math.max(60, Number(e.target.value) || 600))}
            className="rounded border border-white/10 bg-slate-800 px-2 py-1 outline-none focus:border-orange-400"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Min SOG (kn)</span>
          <input
            type="number"
            value={minSog}
            onChange={(e) => setMinSog(Math.max(0, Number(e.target.value) || 0))}
            className="rounded border border-white/10 bg-slate-800 px-2 py-1 outline-none focus:border-orange-400"
          />
        </label>
        <label className="col-span-2 flex items-center gap-4">
          <span className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={excludeFishing}
              onChange={(e) => setExcludeFishing(e.target.checked)}
            />
            Exclude fishing
          </span>
          <span className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={excludeTowing}
              onChange={(e) => setExcludeTowing(e.target.checked)}
            />
            Exclude towing
          </span>
        </label>
      </div>

      <button
        onClick={runInject}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-orange-500 py-1.5 text-sm font-medium hover:bg-orange-400 disabled:opacity-50"
      >
        {loading ? <span>Computing…</span> : (<><Play className="h-3.5 w-3.5" />Inject & Preview</>)}
      </button>

      {error && <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-xs text-red-300">{error}</div>}

      {result && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="rounded bg-slate-800/60 p-2">
            <div className="mb-1 flex items-center gap-1 font-medium text-orange-300">
              <MapPin className="h-3.5 w-3.5" />Fairway Check
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300">
              <span>In fairway</span>
              <span className={result.channel.in_channel ? 'text-green-400' : 'text-yellow-400'}>
                {result.channel.in_channel ? 'Yes' : 'No (off centerline)'}
              </span>
              <span>Dist to centerline</span>
              <span>{result.channel.ref_dist_to_centerline_m} m</span>
              <span>Target heading</span>
              <span>{result.channel.target_heading_deg}°</span>
              <span>Heading aligned</span>
              <span className={result.channel.heading_aligned ? 'text-green-400' : 'text-yellow-400'}>
                {result.channel.heading_aligned ? 'Yes' : 'No'}
              </span>
              <span>Neighbor MMSI</span>
              <span>{result.neighbor_mmsi}</span>
              <span>Neighbor dist</span>
              <span>{result.neighbor_dist_m} m</span>
              {result.channel.used_temp_centerline && (
                <span className="col-span-2 text-yellow-400">
                  ⚠ channel-centerline.geojson not found, using line between two ships as temp centerline
                </span>
              )}
            </div>
          </div>
          {chartData && <MiniChart data={chartData} />}
        </div>
      )}
    </div>
  )
}

// 纯 SVG 双轴折线图（零依赖）：COG 走左轴(0–360°)，SOG 走右轴。
// 直接画归一化航向值，359→0 的竖线跳变正好直观体现"未错绕 180°"。
function MiniChart({ data }: { data: InjectResult }) {
  const W = 400
  const H = 200
  const padL = 42
  const padR = 42
  const padT = 18
  const padB = 28
  const pts = data.injected
  const steps = pts.map((p) => p.step)
  const xMin = Math.min(...steps)
  const xMax = Math.max(...steps)
  const xSpan = xMax - xMin || 1
  const sogVals = pts.map((p) => p.sog)
  const sMin = Math.min(...sogVals)
  const sMax = Math.max(...sogVals)
  const sSpan = sMax - sMin || 1

  const X = (step: number) => padL + ((step - xMin) / xSpan) * (W - padL - padR)
  const Ycog = (cog: number) => padT + (1 - cog / 360) * (H - padT - padB)
  const Ysog = (sog: number) => padT + (1 - (sog - sMin) / sSpan) * (H - padT - padB)

  const cogPath = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.step).toFixed(1)},${Ycog(p.cog).toFixed(1)}`).join(' ')
  const sogPath = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.step).toFixed(1)},${Ysog(p.sog).toFixed(1)}`).join(' ')

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[200px] w-full" preserveAspectRatio="xMidYMid meet">
        {/* 网格与边框 */}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
        {/* 左轴刻度 COG 0/180/360 */}
        {[0, 180, 360].map((v) => (
          <g key={`c${v}`}>
            <line x1={padL} y1={Ycog(v)} x2={W - padR} y2={Ycog(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={padL - 6} y={Ycog(v) + 3} fontSize="9" fill="#ff7a18" textAnchor="end">{v}</text>
          </g>
        ))}
        {/* 右轴刻度 SOG min/max */}
        {[sMin, (sMin + sMax) / 2, sMax].map((v, i) => (
          <text key={`s${i}`} x={W - padR + 6} y={Ysog(v) + 3} fontSize="9" fill="#22d3ee" textAnchor="start">{v.toFixed(1)}</text>
        ))}
        <path d={cogPath} fill="none" stroke="#ff7a18" strokeWidth="2" />
        <path d={sogPath} fill="none" stroke="#22d3ee" strokeWidth="2" />
        <text x={padL} y={12} fontSize="10" fill="#cbd5e1">Inject ship S-curve merge (sin·cos smooth heading, avoiding 359→1 wrap)</text>
        <text x={padL - 32} y={padT + 4} fontSize="9" fill="#ff7a18">COG°</text>
        <text x={W - padR + 6} y={padT + 4} fontSize="9" fill="#22d3ee">SOG</text>
      </svg>
      <div className="flex gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-orange-500" />COG (sin·cos interpolated)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-cyan-400" />SOG (kn)</span>
      </div>
    </div>
  )
}
