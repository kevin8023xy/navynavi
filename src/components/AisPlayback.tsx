import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronDown,
  Square,
  Download,
  Calendar,
  Radar,
  RotateCcw,
  TableProperties,
  ArrowUpFromDot,
} from 'lucide-react'

const PLAYBACK_SPEEDS = ['0.5x', '1x', '2x', '5x', '10x', '50x', '100x']
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

interface AisPlaybackProps {
  onTracksChange: (tracks: any[]) => void
  onPlaybackTimeChange: (time: number) => void
  onIntervalChange: (interval: number) => void
  onError?: (error: string | null) => void
}

export default function AisPlayback({
  onTracksChange,
  onPlaybackTimeChange,
  onIntervalChange,
  onError,
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
  const [playbackTime, setPlaybackTime] = useState<number>(0)

  const startTimeRef = useRef<HTMLInputElement>(null)
  const endTimeRef = useRef<HTMLInputElement>(null)
  const speedRef = useRef<HTMLDivElement>(null)
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startUnix = Math.floor(new Date(startTime).getTime() / 1000)
  const endUnix = Math.floor(new Date(endTime).getTime() / 1000)
  const totalDuration = Math.max(1, endUnix - startUnix)
  const playbackPercent =
    allTracks.length > 0
      ? Math.min(100, Math.max(0, ((playbackTime - startUnix) / totalDuration) * 100))
      : 0

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

  const handleQueryData = async () => {
    setIsLoading(true)
    setLoadProgress(5)
    onError?.(null)
    setAllTracks([])

    const s = Math.floor(new Date(startTime).getTime() / 1000)
    const e = Math.floor(new Date(endTime).getTime() / 1000)

    let progress = 5
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 2
      if (progress > 90) progress = 90
      setLoadProgress(progress)
    }, 80)

    try {
      const res = await fetch(
        `${API_BASE}/tracks?start_time=${s}&end_time=${e}&page=1&page_size=500000`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      clearInterval(progressInterval)
      setLoadProgress(100)
      setAllTracks(data.data || [])
      setPlaybackTime(s)
    } catch (err: any) {
      clearInterval(progressInterval)
      setLoadProgress(100)
      onError?.(err?.message || 'Failed to query data')
    } finally {
      setTimeout(() => {
        setIsLoading(false)
        setLoadProgress(0)
      }, 1000)
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
    <div className="absolute bottom-4 left-4 z-999 bg-background w-[calc(100%-2rem)] max-w-[627px] rounded-xl border shadow-lg border-none p-4">
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Start Time */}  
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="start-time">
            Start Time (UTC)
          </label>
          <input
            ref={startTimeRef}
            id="start-time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => startTimeRef.current?.showPicker()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 bg-secondary shadow-2xl w-full justify-start text-left font-normal mt-1"
          >
            <Calendar className="mr-2 h-4 w-4" />
            <span>{formatTime(startTime)}</span>
          </button>
        </div>
        {/* End Time */}
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="end-time">
            End Time (UTC)
          </label>
          <input
            ref={endTimeRef}
            id="end-time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => endTimeRef.current?.showPicker()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 bg-secondary shadow-2xl w-full justify-start text-left font-normal mt-1"
          >
            <Calendar className="mr-2 h-4 w-4" />
            <span>{formatTime(endTime)}</span>
          </button>
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
            className="flex h-9 w-full rounded-md border border-input px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 bg-secondary shadow-2xl border-none mt-1"
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
              className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 bg-secondary shadow-2xl border-none"
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
                style={{ backgroundColor: '#ffffff' }}
              >
                {PLAYBACK_SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s)
                      setSpeedOpen(false)
                    }}
                    className={`w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground text-left ${
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
      </div>

      {/* Buttons row */}
      <div className="flex space-x-2 mb-3">
        <button
          onClick={handleQueryData}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 px-4 py-2 bg-primary shadow-2xl"
        >
          <Radar className="h-4 w-4 mr-2" />
          Query Data
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Rewind"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={handlePlayPause}
          disabled={allTracks.length === 0}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-6 bg-primary shadow-2xl"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 animate-pulse" />
          )}
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Fast Forward"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={handleStop}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-6 bg-primary shadow-2xl"
          title="Stop"
        >
          <Square className="h-4 w-4" />
        </button>
        <button
          onClick={handleReset}
          disabled={allTracks.length === 0}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-6 bg-primary shadow-2xl"
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 relative px-3 bg-primary shadow-2xl"
          title="Table View"
        >
          <TableProperties className="h-4 w-4 transform scale-x-[-1]" />
        </button>
        <button
          disabled
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Clear realtime ships"
        >
          <ArrowUpFromDot className="h-4 w-4" />
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary h-9 py-2 px-3 bg-primary shadow-2xl"
          title="Export all playback data to CSV"
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

      {/* Playback progress - draggable */}
      {allTracks.length > 0 && (
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
          />
        </div>
      )}
    </div>
  )
}
