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
import compassIcon from '../assets/compass.png'

const PLAYBACK_SPEEDS = ['0.5x', '1x', '2x', '5x', '10x', '50x', '100x']
const API_BASE = '/api'

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

  // Data & playback
  const [allTracks, setAllTracks] = useState<any[]>([])
  const [playbackTime, setPlaybackTime] = useState<number>(0) // unix timestamp
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [iconLoaded, setIconLoaded] = useState(false)

  const startUnix = Math.floor(new Date(startTime).getTime() / 1000)
  const endUnix = Math.floor(new Date(endTime).getTime() / 1000)
  const totalDuration = Math.max(1, endUnix - startUnix)
  const playbackPercent = allTracks.length > 0
    ? Math.min(100, Math.max(0, ((playbackTime - startUnix) / totalDuration) * 100))
    : 0

  // ── Initialize map with CARTO basemap + Mapbox vector overlay ──
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    try {
      const MAPBOX_TOKEN =
        '***REMOVED***'

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
        center: [121.863873, 40.242037],
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
        console.log('[Map] Basemap loaded, adding custom tilesets…')

        // 加载船舶图标（用 Image 对象更可靠）
        const img = new Image()
        img.onload = () => {
          if (!m.hasImage('ship-icon')) {
            m.addImage('ship-icon', img)
            console.log('[Map] Ship icon loaded:', img.width, 'x', img.height)
          }
          setIconLoaded(true)
        }
        img.onerror = () => console.warn('[Map] Failed to load ship icon')
        img.src = compassIcon

        const tilesetIds = [
          '9zmxcsih', '9hg1rjmh', 'aodinnmf', '20gt82m7',
          'dntm19bq', 'd5eml1db', 'b7x708bt', 'bcxlucqt',
          '18ksrpzm', '4sap4ro3', '13hr208n', '2qu2v5ef',
          '9ryul5ol', '9qacc1x4', '63c62biw',
        ]
        const palette = [
          '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6',
          '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
          '#14b8a6', '#e11d48', '#0ea5e9', '#a855f7', '#eab308',
        ]

        const tileJSONUrl =
          `https://api.mapbox.com/v4/` +
          tilesetIds.map((id) => `cfan.${id}`).join(',') +
          `.json?secure&access_token=${MAPBOX_TOKEN}`

        fetch(tileJSONUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`TileJSON ${res.status}`)
            return res.json()
          })
          .then((tj) => {
            m.addSource('cfan-custom', {
              type: 'vector',
              tiles: tj.tiles,
              minzoom: tj.minzoom ?? 0,
              maxzoom: tj.maxzoom ?? 14,
            })

            tilesetIds.forEach((ts, i) => {
              m.addLayer({
                id: `cfan-${ts}-fill`,
                type: 'fill',
                source: 'cfan-custom',
                'source-layer': ts,
                paint: {
                  'fill-color': palette[i],
                  'fill-opacity': 0.35,
                  'fill-outline-color': '#1e293b',
                },
              })
              m.addLayer({
                id: `cfan-${ts}-line`,
                type: 'line',
                source: 'cfan-custom',
                'source-layer': ts,
                paint: {
                  'line-color': '#1e293b',
                  'line-width': 1.5,
                },
              })
            })

            console.log('[Map] Custom tilesets loaded:', tilesetIds.length)
          })
          .catch((err) => {
            console.warn('[Map] Failed to load custom tilesets:', err)
          })
      })

      map.current = m

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

  // ── Update map ships layer based on playbackTime ──
  useEffect(() => {
    if (!map.current || allTracks.length === 0 || !iconLoaded) return

    const currentEnd = playbackTime + Number(intervalSec)
    const active = allTracks.filter(
      (t) => t.timestamp >= playbackTime && t.timestamp < currentEnd
    )

    const geojson: any = {
      type: 'FeatureCollection',
      features: active.map((r) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [r.lng, r.lat],
        },
        properties: {
          mmsi: r.mmsi,
          sog: r.sog,
          cog: (r.cog != null && r.cog !== 511) ? r.cog : 0,
        },
      })),
    }

    const source = map.current.getSource('ships') as any
    if (source) {
      source.setData(geojson)
    } else {
      map.current.addSource('ships', {
        type: 'geojson',
        data: geojson,
      })
      map.current.addLayer({
        id: 'ships-points',
        type: 'symbol',
        source: 'ships',
        layout: {
          'icon-image': 'ship-icon',
          'icon-size': 0.04,
          'icon-allow-overlap': true,
          'icon-rotate': ['get', 'cog'],
          'icon-rotation-alignment': 'map',
        },
      })
    }
  }, [playbackTime, allTracks, intervalSec, iconLoaded])

  const handleQueryData = async () => {
    setIsLoading(true)
    setLoadProgress(5)
    setError(null)
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
      setError(err?.message || 'Failed to query data')
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
            <p className="text-red-500 text-sm font-medium mb-1">Error</p>
            <p className="text-slate-400 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* ── Bottom-Left Control Panel ── */}
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
            disabled={allTracks.length === 0}
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
            onClick={handleReset}
            disabled={allTracks.length === 0}
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

        {/* Loading progress */}
        {isLoading && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Loading...</span>
              <span className="text-xs">{Math.min(Math.round(loadProgress), 100)}%</span>
            </div>
            <div className="relative flex w-full touch-none select-none items-center grow shadow-2xl">
              <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
                <div
                  className="absolute h-full bg-primary transition-all duration-200 ease-out"
                  style={{ width: `${Math.min(loadProgress, 100)}%` }}
                />
              </div>
              <div
                className="absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors"
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
    </div>
  )
}
