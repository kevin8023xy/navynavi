import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronDown,
  ChevronRight,
  Square,
  Download,
  Calendar,
  Radar,
  RotateCcw,
  TableProperties,
  ArrowUpFromDot,
} from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const PLAYBACK_SPEEDS = ['0.5x', '1x', '2x', '5x', '10x', '50x', '100x']

const TOOLS_MENU = [
  { label: 'AIS Codec', submenu: ['Encoder', 'Decoder'] },
  { label: 'AIS Playback' },
  { separator: true },
  { label: 'Broadcasting' },
  { label: 'Ship Simulation' },
  { label: 'Ship Relationships' },
  { separator: true },
  { label: 'Ship Analysis' },
  { separator: true },
  { label: 'Close All...' },
]

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
  const [toolsOpen, setToolsOpen] = useState(false)
  const [aisSubmenuOpen, setAisSubmenuOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  const startTimeRef = useRef<HTMLInputElement>(null)
  const endTimeRef = useRef<HTMLInputElement>(null)
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

      m.on('load', () => {
        console.log('[Map] Loaded successfully. Canvas:', m.getCanvas())
      })

      map.current = m

      // Debug: check container dimensions
      const rect = mapContainer.current.getBoundingClientRect()
      console.log('[Map] Container size:', rect.width, 'x', rect.height)
    } catch (e) {
      console.error('[Map] Init error:', e)
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

  const speedRef = useRef<HTMLDivElement>(null)

  // Close tools menu on outside click
  useEffect(() => {
    if (!toolsOpen) return
    const handleClick = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false)
        setAisSubmenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [toolsOpen])

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

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#c4dced]">
      {/* ── Top Menu Bar (Radix-style menubar) ── */}
      <div className="absolute inset-x-0 top-0 z-20">
        <div
          role="menubar"
          className="flex h-9 items-center space-x-1 border p-1 shadow-sm rounded-none border-b border-none px-[9px] bg-secondary/50 backdrop-blur-sm"
        >
          <Link
            to="/"
            className="flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground font-heading"
          >
            <span className="mb-[2px]">NavyNavi</span>
          </Link>
          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
            >
              Tools
            </button>
            {toolsOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-48 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md bg-secondary/85 border-none">
                {TOOLS_MENU.map((item, i) =>
                  item.separator ? (
                    <div key={`sep-${i}`} className="-mx-1 my-1 h-px opacity-20 bg-foreground/25" />
                  ) : item.submenu ? (
                    <div key={item.label} className="relative">
                      <button
                        onMouseEnter={() => setAisSubmenuOpen(true)}
                        onMouseLeave={() => setAisSubmenuOpen(false)}
                        className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                      >
                        {item.label}
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </button>
                      {aisSubmenuOpen && (
                        <div
                          className="absolute left-full top-0 ml-1 min-w-32 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md bg-secondary/85 border-none"
                          onMouseEnter={() => setAisSubmenuOpen(true)}
                          onMouseLeave={() => setAisSubmenuOpen(false)}
                        >
                          {item.submenu.map((sub) => (
                            <button
                              key={sub}
                              onClick={() => {
                                setToolsOpen(false)
                                setAisSubmenuOpen(false)
                              }}
                              className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      key={item.label}
                      onClick={() => setToolsOpen(false)}
                      className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Full-screen Map ── */}
      <div ref={mapContainer} className="flex-1 min-h-0" />

      {/* ── Error Overlay ── */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-30">
          <div className="text-center p-6 rounded-lg bg-white shadow-lg border border-red-200">
            <p className="text-red-500 text-sm font-medium mb-1">Map Error</p>
            <p className="text-slate-400 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* ── Bottom-Left Control Panel — shadcn/ui Style ── */}
      <div className="absolute bottom-4 left-4 z-999 bg-background/50 backdrop-blur-sm w-[calc(100%-2rem)] max-w-[627px] rounded-xl border shadow-lg border-none p-4">
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
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 bg-secondary/50 shadow-2xl w-full justify-start text-left font-normal mt-1"
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
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 bg-secondary/50 shadow-2xl w-full justify-start text-left font-normal mt-1"
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
              className="flex h-9 w-full rounded-md border border-input px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 bg-secondary/50 shadow-2xl border-none mt-1"
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
                className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 bg-secondary/50 shadow-2xl border-none"
              >
                <span>{speed}</span>
                <ChevronDown
                  className={`h-4 w-4 opacity-50 transition-transform duration-200 ${
                    speedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {speedOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md bg-secondary/85 border-none">
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
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 bg-primary/85 shadow-2xl"
          >
            <Radar className="h-4 w-4 mr-2" />
            Query Data
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-3 bg-primary/85 shadow-2xl"
            title="Rewind"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={handlePlayPause}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-6 bg-primary/85 shadow-2xl"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 animate-pulse" />
            )}
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-3 bg-primary/85 shadow-2xl"
            title="Fast Forward"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            onClick={handleStop}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-6 bg-primary/85 shadow-2xl"
            title="Stop"
          >
            <Square className="h-4 w-4" />
          </button>
          <button
            disabled={!isPlaying && loadProgress === 0}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-6 bg-primary/85 shadow-2xl"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 relative px-3 bg-primary/85 shadow-2xl"
            title="Table View"
          >
            <TableProperties className="h-4 w-4 transform scale-x-[-1]" />
          </button>
          <button
            disabled
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-3 bg-primary/85 shadow-2xl"
            title="Clear realtime ships"
          >
            <ArrowUpFromDot className="h-4 w-4" />
          </button>
          <button
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 h-9 py-2 px-3 bg-primary/85 shadow-2xl"
            title="Export all playback data to CSV"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>

        {/* Progress slider */}
        {(isLoading || loadProgress > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                {isLoading ? 'Loading...' : 'Complete'}
              </span>
              <span className="text-xs">
                {Math.min(Math.round(loadProgress), 100)}%
              </span>
            </div>
            <div className="relative flex w-full touch-none select-none items-center grow shadow-2xl">
              <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
                <div
                  className="absolute h-full bg-primary transition-all duration-200 ease-out"
                  style={{ width: `${Math.min(loadProgress, 99)}%` }}
                />
              </div>
              <div
                className="absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors"
                style={{ left: `calc(${Math.min(loadProgress, 99)}% - 8px)` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
