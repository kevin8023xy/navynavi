import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronDown,
  Square,
  Download,
  Radar,
  RotateCcw,
  TableProperties,
  ArrowUpFromDot,
  X,
} from 'lucide-react'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'

import { loadAisData, queryTracks, filterVesselsByMmsi, type ShipFilterOptions } from '../lib/aisData'
import {
  groupByMmsi,
  interpolateRecord,
  interpolateSpline,
  computeFieldTrust,
  type InterpolatableRecord,
} from '../lib/interpolate'

const PLAYBACK_SPEEDS = ['0.5x', '1x', '2x', '5x', '10x', '50x', '100x']

function dateToLocalDateTimeString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}:${s}`
}

interface AisPlaybackProps {
  onTracksChange: (tracks: any[]) => void
  onPlaybackTimeChange: (time: number) => void
  onIntervalChange: (interval: number) => void
  onError?: (error: string | null) => void
  onClose?: () => void
}

export default function AisPlayback({
  onTracksChange,
  onPlaybackTimeChange,
  onIntervalChange,
  onError,
  onClose,
}: AisPlaybackProps) {
  const [startTime, setStartTime] = useState('2021-10-01T00:00')
  const [endTime, setEndTime] = useState('2021-10-01T23:59')
  const [intervalSec, setIntervalSec] = useState(10)
  const [speed, setSpeed] = useState('1x')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [allTracks, setAllTracks] = useState<any[]>([])
  // 船舶过滤（3kn 以下 / 渔船 / 拖轮不显示），默认开启
  const [shipFilter, setShipFilter] = useState<ShipFilterOptions>({
    minSogKn: 3,
    excludeFishing: true,
    excludeTowing: true,
  })
  const [playbackTime, setPlaybackTime] = useState<number>(0)
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)

  const speedRef = useRef<HTMLDivElement>(null)
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rawTracksRef = useRef<InterpolatableRecord[]>([])
  // 每船 COG/HDG 信任度（用与 Console 同源 computeFieldTrust），每帧实时插值复用。
  // 注意：rawTracksRef 变化时由数据加载 effect 重置；重建后首次插值时按需懒填充。
  const trustByMmsiRef = useRef<Map<number, ReturnType<typeof computeFieldTrust>>>(new Map())
  const lastLogTimeRef = useRef(0)


  const startUnix = Math.floor(new Date(startTime).getTime() / 1000)
  const endUnix = Math.floor(new Date(endTime).getTime() / 1000)
  const totalDuration = Math.max(1, endUnix - startUnix)
  const playbackPercent =
    allTracks.length > 0
      ? Math.min(100, Math.max(0, ((playbackTime - startUnix) / totalDuration) * 100))
      : 0

  // Debug
  useEffect(() => {
    if (allTracks.length === 0 || playbackTime === 0) return
    console.log('[Progress] startTime:', formatTime(startTime), 'endTime:', formatTime(endTime),
      '| startUnix:', startUnix, 'endUnix:', endUnix, 'totalDuration:', totalDuration,
      '| playbackTime:', playbackTime, '| allTracks:', allTracks.length, '| percent:', playbackPercent.toFixed(1))
  }, [allTracks.length, playbackTime, startUnix, endUnix, totalDuration, playbackPercent, startTime, endTime])

  useEffect(() => {
    onPlaybackTimeChange(playbackTime)
  }, [playbackTime, onPlaybackTimeChange])

  useEffect(() => {
    onTracksChange(allTracks)
  }, [allTracks, onTracksChange])

  useEffect(() => {
    onIntervalChange(intervalSec)
  }, [intervalSec, onIntervalChange])

  // Close speed dropdown on outside click
  useEffect(() => {
    if (!speedOpen) return
    const handleClick = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [speedOpen])

  // ── Playback engine ──
  useEffect(() => {
    if (!isPlaying) {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
      return
    }

    const speedMultiplier = parseFloat(speed.replace('x', ''))
    const tickMs = 100 // 每 100ms 更新一次
    const stepSec = (tickMs / 1000) * speedMultiplier * intervalSec

    playbackTimerRef.current = setInterval(() => {
      setPlaybackTime((prev) => {
        const next = prev + stepSec
        if (next >= endUnix) {
          setIsPlaying(false)
          return endUnix
        }
        return next
      })
    }, tickMs)

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [isPlaying, speed, intervalSec, endUnix])


  // ── Real-time interpolation with distribution logging ──
  useEffect(() => {
    if (rawTracksRef.current.length === 0) return

    const byMmsi = groupByMmsi(rawTracksRef.current)
    const currentTimePoints: any[] = []

    // 信任度：每船一次性 computeFieldTrust，复用到后续每帧
    const trustCache = trustByMmsiRef.current
    if (trustCache.size === 0) {
      for (const [mmsi, records] of byMmsi) trustCache.set(mmsi, computeFieldTrust(records))
    }

    for (const [mmsi, records] of byMmsi) {
      const firstTime = records[0].timestamp
      const lastTime = records[records.length - 1].timestamp

      if (playbackTime >= firstTime && playbackTime <= lastTime) {
        const trust = trustCache.get(mmsi)
        const r = interpolateRecord(records, playbackTime, undefined, trust)
        if (r) currentTimePoints.push(r)
      }
    }

    // Log every 300 seconds of playback
    if (playbackTime - lastLogTimeRef.current >= 300) {
      console.log('[Distribution] Time:', new Date(playbackTime * 1000).toLocaleTimeString(),
        '| ships shown:', currentTimePoints.length, '| total MMSI:', byMmsi.size)
      lastLogTimeRef.current = playbackTime
    }

    setAllTracks(currentTimePoints)
  }, [playbackTime])

  const handleQueryData = async () => {
    setIsPlaying(false)
    setIsLoading(true)
    setLoadProgress(5)
    onError?.(null)
    setEmptyMessage(null)
    setAllTracks([])
    rawTracksRef.current = []
    trustByMmsiRef.current = new Map()

    const s = Math.floor(new Date(startTime).getTime() / 1000)
    const e = Math.floor(new Date(endTime).getTime() / 1000)

    try {
      await loadAisData((progress) => setLoadProgress(progress))
      const data = await queryTracks(s, e)
      console.log('[Query] Loaded records:', data.length, 'from', new Date(s * 1000), 'to', new Date(e * 1000))
      // 按 MMSI 过滤：3kn 以下 / 渔船 / 拖轮整条船排除
      const keep = filterVesselsByMmsi(data, shipFilter)
      const filtered = data.filter((r) => keep.has(r.mmsi))
      console.log('[Query] After ship filter:', filtered.length, 'records,', keep.size, 'vessels kept')
      rawTracksRef.current = filtered
      if (filtered.length === 0) {
        setEmptyMessage(
          keep.size === 0
            ? `All ships in the query range are excluded by filter rules (below 3kn / fishing / towing).`
            : `No AIS records found between ${formatTime(startTime)} and ${formatTime(endTime)}.`,
        )
      } else {
        // Set playback time to the earliest record's timestamp
        const firstTime = Math.min(...filtered.map(r => r.timestamp))
        setPlaybackTime(firstTime)
      }
    } catch (err: any) {
      console.error('[Query] Error:', err)
      onError?.(err?.message || 'Failed to load AIS data')
    } finally {
      setIsLoading(false)
      setLoadProgress(0)
    }
  }

  const handlePlayPause = () => {
    if (allTracks.length === 0) return
    setIsPlaying(!isPlaying)
  }

  const handleStop = () => {
    setIsPlaying(false)
    setPlaybackTime(startUnix)
  }

  const handleReset = () => {
    setIsPlaying(false)
    setPlaybackTime(startUnix)
  }

  // ── Export displayed data (raw reports + interpolated points) to CSV ──
  const handleExportCsv = () => {
    const raw = rawTracksRef.current
    if (raw.length === 0) {
      onError?.('No data to export. Query data first.')
      return
    }

    const s = startUnix
    const e = endUnix
    const interval = intervalSec
    const byMmsi = groupByMmsi(raw)

    // 每船一次性信任度（与播放/地图同源），用于插值点朝向
    const trustCache = trustByMmsiRef.current

    const rows: InterpolatableRecord[] = []

    for (const [mmsi, records] of byMmsi) {
      const trust = trustCache.get(mmsi) ?? computeFieldTrust(records)
      if (trustCache.size === 0) trustCache.set(mmsi, trust)
      // 原始报告点
      for (const r of records) rows.push({ ...r, source: 'raw' })
      // 插值点（按 interval 采样整船轨迹，与地图展示一致）
      const interp = interpolateSpline(records, s, e, interval, 0.5, trust)
      for (const r of interp) rows.push({ ...r, source: 'interpolated' })
    }

    rows.sort((a, b) => a.timestamp - b.timestamp || a.mmsi - b.mmsi)

    const COLUMNS = [
      'source',
      'mmsi',
      'timestamp_unix',
      'timestamp_iso',
      'lat',
      'lng',
      'sog',
      'cog',
      'heading',
      'heading_resolved',
      'status',
    ]
    const esc = (v: any) => {
      if (v == null) return ''
      const str = String(v)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }
    const lines = [
      COLUMNS.join(','),
      ...rows.map((r) =>
        [
          r.source,
          r.mmsi,
          r.timestamp,
          new Date(r.timestamp * 1000).toISOString(),
          r.lat,
          r.lng,
          r.sog ?? '',
          r.cog ?? '',
          r.heading ?? '',
          r.headingResolved ?? '',
          r.status ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ]
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const tag = `${formatTime(startTime).replace(/[^\d]/g, '')}-${formatTime(endTime).replace(/[^\d]/g, '')}`
    a.href = url
    a.download = `ais_playback_${tag}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatTime = (value: string) => {
    if (!value) return 'Pick a date'
    const d = new Date(value)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}/${m}/${day} ${h}:${min}:${s}`
  }

  const formatPlaybackTime = (unix: number) => {
    const d = new Date(unix * 1000)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  return (
    <div className="absolute bottom-4 left-4 z-40 bg-[#dadada]/75 w-[calc(100%-2rem)] max-w-[627px] rounded-xl border shadow-lg border-none p-4 backdrop-blur-md">
      {/* Header with Close Button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">AIS Playback</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200/80 text-slate-600 hover:bg-slate-300 hover:text-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Start Time */}
        <div>
          <label className="text-sm font-medium leading-none">
            Start Time (UTC)
          </label>
          <DateTimePicker
            value={new Date(startTime)}
            onChange={(d) => d && setStartTime(dateToLocalDateTimeString(d))}
            format="MM/dd/yyyy hh:mm aa"
            ampm
            disabled={isLoading}
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
                className: 'mt-1',
              },
            }}
          />
        </div>
        {/* End Time */}
        <div>
          <label className="text-sm font-medium leading-none">
            End Time (UTC)
          </label>
          <DateTimePicker
            value={new Date(endTime)}
            onChange={(d) => d && setEndTime(dateToLocalDateTimeString(d))}
            format="MM/dd/yyyy hh:mm aa"
            ampm
            disabled={isLoading}
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
                className: 'mt-1',
              },
            }}
          />
        </div>
        {/* Interval */}
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="interval">
            Interval (seconds)
          </label>
          <input
            id="interval"
            type="number"
            min={1}
            value={intervalSec}
            onChange={(e) =>
              setIntervalSec(Math.max(1, parseInt(e.target.value) || 1))
            }
            disabled={isLoading}
            className="flex h-9 w-full rounded-md border border-input px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 bg-secondary/75 backdrop-blur-md shadow-2xl border-none mt-1"
          />
        </div>
        {/* Speed */}
        <div ref={speedRef}>
          <label className="text-sm font-medium leading-none" htmlFor="speed">
            Playback Speed
          </label>
          <div className="relative mt-1">
            <button
              id="speed"
              type="button"
              onClick={() => setSpeedOpen(!speedOpen)}
              disabled={isLoading}
              className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 bg-secondary/75 backdrop-blur-md shadow-2xl border-none hover:bg-secondary hover:brightness-105 active:scale-[0.98] transition-all"
            >
              <span>{speed}</span>
              <ChevronDown
                className={`h-4 w-4 opacity-50 transition-transform duration-200 ${
                  speedOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {speedOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-1 z-30 min-w-32 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md border-none"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(12px)' }}
              >
                {PLAYBACK_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s)
                      setSpeedOpen(false)
                    }}
                    className={`w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground text-left transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80 ${
                      s === speed
                        ? 'bg-accent text-accent-foreground'
                        : ''
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ship filter */}
        <div className="mt-3 rounded-md border border-white/30 bg-white/40 px-3 py-2">
          <div className="text-sm font-medium leading-none mb-2">Ship Filter</div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-slate-500">Min SOG (kn)</label>
            <input
              type="number"
              value={shipFilter.minSogKn ?? 0}
              min={0}
              onChange={(e) =>
                setShipFilter((f) => ({ ...f, minSogKn: Math.max(0, parseFloat(e.target.value) || 0) }))
              }
              className="w-16 rounded border border-white/40 bg-white/60 px-2 py-1 text-xs"
            />
            <span className="text-xs text-slate-400">(ships with full-route average below this are hidden)</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 mb-1">
            <input
              type="checkbox"
              checked={shipFilter.excludeFishing ?? false}
              onChange={(e) => setShipFilter((f) => ({ ...f, excludeFishing: e.target.checked }))}
            />
            Exclude fishing (Navigational Status=7)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={shipFilter.excludeTowing ?? false}
              onChange={(e) => setShipFilter((f) => ({ ...f, excludeTowing: e.target.checked }))}
            />
            Exclude towing/tug (Navigational Status=11)
          </label>
        </div>
      </div>

      {/* Buttons row */}
      <div className="flex space-x-2 mb-3">
        <button
          onClick={handleQueryData}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 px-4 py-2 bg-primary shadow-2xl"
        >
          <Radar className="h-4 w-4 mr-2" />
          Query Data
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Rewind"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={handlePlayPause}
          disabled={allTracks.length === 0}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-6 bg-primary shadow-2xl"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 animate-pulse" />
          )}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Fast Forward"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={handleStop}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-6 bg-primary shadow-2xl"
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </button>
        <button
          onClick={handleReset}
          disabled={allTracks.length === 0}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-6 bg-primary shadow-2xl"
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 relative px-3 bg-primary shadow-2xl"
          title="Table View"
        >
          <TableProperties className="h-4 w-4 transform scale-x-[-1]" />
        </button>
        <button
          disabled
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Clear realtime ships"
        >
          <ArrowUpFromDot className="h-4 w-4" />
        </button>
        <button
          onClick={handleExportCsv}
          disabled={rawTracksRef.current.length === 0}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary hover:brightness-110 active:scale-95 active:brightness-95 h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Export raw + interpolated data to CSV"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {/* Loading progress */}
      {isLoading && (
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Loading...</span>
            <span className="text-xs">{Math.min(Math.round(loadProgress), 100)}%</span>
          </div>
          <div className="relative flex w-full touch-none select-none items-center grow shadow-2xl">
            <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary">
              <div
                className="absolute h-full bg-primary transition-all duration-200 ease-out"
                style={{ width: `${Math.min(loadProgress, 100)}%` }}
              />
            </div>
            <div
              className="absolute block h-4 w-4 rounded-full border border-primary bg-background shadow transition-colors"
              style={{ left: `calc(${Math.min(loadProgress, 100)}% - 8px)` }}
            />
          </div>
        </div>
      )}

      {emptyMessage && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 backdrop-blur-sm">
          {emptyMessage}
        </div>
      )}

      {/* Playback progress - always visible */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{formatPlaybackTime(playbackTime)}</span>
          <span className="text-xs">{Math.round(playbackPercent)}%</span>
        </div>
        <input
          type="range"
          min={startUnix}
          max={endUnix}
          step={intervalSec}
          value={playbackTime}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            setPlaybackTime(v)
          }}
          className="w-full h-1.5 cursor-pointer accent-primary"
          disabled={allTracks.length === 0}
        />
        {allTracks.length === 0 && (
          <div className="text-xs text-slate-500 text-center">No ships at this time</div>
        )}
      </div>

    </div>
  )
}
