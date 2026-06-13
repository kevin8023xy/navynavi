import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Anchor,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronDown,
  Search,
  Square,
  Maximize2,
  RefreshCw,
  LayoutGrid,
  ArrowUp,
  Download,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const PLAYBACK_SPEEDS = ['0.5x', '1x', '2x', '5x', '10x', '50x', '100x']

export default function Console() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  // Playback state
  const [startTime, setStartTime] = useState('2021-10-01T00:00')
  const [endTime, setEndTime] = useState('2021-10-01T23:59')
  const [intervalSec, setIntervalSec] = useState(10)
  const [speed, setSpeed] = useState('1x')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [speedOpen, setSpeedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize map — light blue nautical style matching the screenshot
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    try {
      const m = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'raster-tiles': {
              type: 'raster',
              tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: 'simple-tiles',
              type: 'raster',
              source: 'raster-tiles',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [118.05, 24.45],
        zoom: 9.5,
        attributionControl: false,
      })

      m.addControl(new maplibregl.NavigationControl(), 'bottom-right')
      m.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left')
      m.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-right'
      )

      m.on('error', (e) => {
        setError(e.error?.message || 'Map failed to load')
      })

      map.current = m
    } catch (e) {
      setError('Failed to initialize map')
    }

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const handleResize = () => map.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleQueryData = async () => {
    setIsLoading(true)
    setLoadProgress(0)
    // Simulate progress
    const interval = setInterval(() => {
      setLoadProgress((prev) => {
        if (prev >= 99) {
          clearInterval(interval)
          return 99
        }
        return prev + Math.random() * 15
      })
    }, 200)
    await new Promise((r) => setTimeout(r, 2500))
    clearInterval(interval)
    setLoadProgress(0)
    setIsLoading(false)
  }

  const handlePlayPause = () => setIsPlaying(!isPlaying)

  const handleStop = () => {
    setIsPlaying(false)
    setLoadProgress(0)
  }

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-[#c4dced]">
      {/* ── Top Menu Bar ── */}
      <header className="absolute top-0 left-0 right-0 h-9 bg-white/70 backdrop-blur-sm border-b border-gray-300/40 flex items-center px-3 z-20">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-slate-700 hover:text-blue-600 transition-colors mr-6"
        >
          <Anchor className="w-4 h-4" strokeWidth={2} />
          <span className="font-bold text-sm tracking-tight">NavyNavi</span>
        </Link>
        <button className="px-3 py-0.5 rounded text-xs font-medium text-slate-600 hover:bg-black/5 transition-colors">
          Tools
        </button>
      </header>

      {/* ── Full-screen Map ── */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* ── Error Overlay ── */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-30">
          <div className="text-center p-6 rounded-lg bg-white shadow-lg border border-red-200">
            <p className="text-red-500 text-sm font-medium mb-1">Map Error</p>
            <p className="text-slate-400 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* ── Bottom-Left Control Panel — iOS Frosted Glass Style ── */}
      <div className="absolute bottom-5 left-5 z-10 w-[360px] rounded-2xl bg-white/20 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/30 overflow-hidden">
        {/* Parameter rows */}
        <div className="p-4 space-y-3">
          {/* Row 1: Start Time | End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700/80 block mb-0.5 tracking-wide">
                Start Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="ios-glass-input w-full h-9 rounded-lg border border-white/40 bg-white/25 backdrop-blur-sm px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-white/60 focus:bg-white/35 transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700/80 block mb-0.5 tracking-wide">
                End Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="ios-glass-input w-full h-9 rounded-lg border border-white/40 bg-white/25 backdrop-blur-sm px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-white/60 focus:bg-white/35 transition-all"
              />
            </div>
          </div>

          {/* Row 2: Interval | Playback Speed */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700/80 block mb-0.5 tracking-wide">
                Interval (seconds)
              </label>
              <input
                type="number"
                min={1}
                value={intervalSec}
                onChange={(e) =>
                  setIntervalSec(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="ios-glass-input w-full h-9 rounded-lg border border-white/40 bg-white/25 backdrop-blur-sm px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-white/60 focus:bg-white/35 transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700/80 block mb-0.5 tracking-wide">
                Playback Speed
              </label>
              <div className="relative">
                <button
                  onClick={() => setSpeedOpen(!speedOpen)}
                  className="ios-glass-input w-full h-9 rounded-lg border border-white/40 bg-white/25 backdrop-blur-sm px-2.5 text-xs text-slate-800 flex items-center justify-between focus:outline-none focus:border-white/60 focus:bg-white/35 hover:bg-white/30 transition-all"
                >
                  <span>{speed}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500/70 transition-transform duration-200 ${
                      speedOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {speedOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-white/30 bg-white/25 backdrop-blur-2xl shadow-[0_8px_24px_rgba(0,0,0,0.14)] z-30 py-1 overflow-hidden">
                    {PLAYBACK_SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSpeed(s)
                          setSpeedOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          s === speed
                            ? 'bg-white/45 text-slate-900 font-medium'
                            : 'text-slate-700/80 hover:bg-white/20'
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

          {/* Row 3: Control buttons bar — iOS glass style */}
          <div className="flex items-center gap-1.5 pt-1">
            {/* Query Data */}
            <button
              onClick={handleQueryData}
              disabled={isLoading}
              className="ios-glass-btn flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-xl text-slate-700 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Search className="w-3.5 h-3.5" />
              Query Data
            </button>

            {/* Separator */}
            <div className="w-px h-7 bg-white/25 mx-0.5 rounded-full" />

            {/* Rewind */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Rewind">
              <SkipBack className="w-3.5 h-3.5 fill-current" />
            </button>

            {/* Play / Pause — accent when active */}
            <button
              onClick={handlePlayPause}
              className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-blue-500/80 text-white shadow-md shadow-blue-300/40 active:scale-95'
                  : 'ios-glass-btn-icon'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            {/* Fast Forward */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Fast Forward">
              <SkipForward className="w-3.5 h-3.5 fill-current" />
            </button>

            {/* Stop */}
            <button
              onClick={handleStop}
              className="ios-glass-btn-icon h-9 w-9 rounded-xl"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>

            {/* Separator */}
            <div className="w-px h-7 bg-white/25 mx-0.5 rounded-full" />

            {/* Fullscreen */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Fullscreen">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Refresh */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Grid view */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Grid View">
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>

            {/* Arrow Up */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Expand">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>

            {/* Download */}
            <button className="ios-glass-btn-icon h-9 w-9 rounded-xl" title="Download">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Row 4: Loading status + Progress */}
          {(isLoading || loadProgress > 0) && (
            <div className="pt-1">
              <div className="flex items-center justify-between text-xs text-slate-600/80 mb-1.5 font-medium">
                <span>{isLoading ? 'Loading...' : 'Complete'}</span>
                <span>{Math.min(Math.round(loadProgress), 99)}%</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className="h-full bg-gradient-to-r from-blue-400/80 to-blue-500/90 rounded-full transition-all duration-200 ease-out shadow-sm shadow-blue-300/40"
                  style={{ width: `${Math.min(loadProgress, 99)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
