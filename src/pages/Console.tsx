import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Layers } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import compassIcon from '../assets/compass.png'
import AisPlayback from '../components/AisPlayback'

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

  const [toolsOpen, setToolsOpen] = useState(false)
  const [aisSubmenuOpen, setAisSubmenuOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [chartVisible, setChartVisible] = useState(true)

  // Playback data surfaced from AisPlayback module for map rendering
  const [allTracks, setAllTracks] = useState<any[]>([])
  const [playbackTime, setPlaybackTime] = useState<number>(0)
  const [intervalSec, setIntervalSec] = useState(10)
  const [iconLoaded, setIconLoaded] = useState(false)

  // ── Initialize map with CARTO basemap + Mapbox vector overlay + S-57 ENC chart ──
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    let protocolCleanup: (() => void) | null = null

    const init = async () => {
      try {
        const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

        // 注册 PMTiles protocol（必须在地图创建前完成）
        try {
          const { Protocol } = await import('pmtiles')
          const protocol = new Protocol()
          maplibregl.addProtocol('pmtiles', protocol.tile)
          protocolCleanup = () => maplibregl.removeProtocol('pmtiles')
          console.log('[Map] PMTiles protocol registered')
        } catch (e) {
          console.warn('[Map] Failed to load PMTiles protocol:', e)
        }

        const m = new maplibregl.Map({
          container: mapContainer.current!,
          style: {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
              'raster-tiles': {
                type: 'raster',
                tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
              },
              'navy-chart': {
                type: 'vector',
                url: 'pmtiles://pmtiles/navy_chart.pmtiles',
                attribution: 'S-57 ENC Data',
                minzoom: 0,
                maxzoom: 5,
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

      m.on('load', async () => {
        console.log('[Map] Basemap loaded, adding custom tilesets…')

        // 加载 S-52 海图样式
        try {
          const res = await fetch('/styles/s52-chart.json')
          if (res.ok) {
            const s52Style = await res.json()
            // 将 S-52 图层添加到当前地图
            s52Style.layers.forEach((layer: any) => {
              if (layer.id === 'background') return
              if (!m.getLayer(layer.id)) {
                m.addLayer({ ...layer, layout: { visibility: chartVisible ? 'visible' : 'none', ...layer.layout } })
              }
            })
            console.log('[Map] S-52 chart layers added')
          }
        } catch (e) {
          console.warn('[Map] Failed to load S-52 style:', e)
        }

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

      const rect = mapContainer.current!.getBoundingClientRect()
      console.log('[Map] Container size:', rect.width, 'x', rect.height)
    } catch (e) {
      console.error('[Map] Init error:', e)
      setError('Failed to initialize map')
    }
    }

    init()

    return () => {
      protocolCleanup?.()
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const handleResize = () => map.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Toggle chart layer visibility
  useEffect(() => {
    if (!map.current) return
    const chartLayerIds = [
      'depth_areas-deep', 'depth_areas-medium', 'depth_areas-shallow', 'depth_areas-default',
      'sea_areas', 'land_areas', 'rivers_area', 'fairways', 'anchorages',
      'restricted_areas', 'berths', 'shoreline_construction', 'bridges',
      'admin_areas', 'meta_coverage', 'coastline', 'depth_contours',
      'depth_contours-label', 'fairways_line', 'rivers', 'roads', 'tunnels',
      'pipelines', 'fences', 'radar_call', 'land_line', 'soundings',
      'lights', 'lights-label', 'buoys', 'beacons', 'topmarks',
      'obstructions', 'wrecks', 'landmarks', 'buildings', 'pilots',
      'radar_stations', 'route_beacons', 'land_elevation', 'tidal_stations',
      'tidal_w_stations', 'restricted_areas-outline', 'anchorages-outline',
      'berths-outline', 'production_areas-outline', 'magvar',
    ]
    chartLayerIds.forEach((id) => {
      if (map.current!.getLayer(id)) {
        map.current!.setLayoutProperty(id, 'visibility', chartVisible ? 'visible' : 'none')
      }
    })
  }, [chartVisible])

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

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#c4dced]">
      {/* ── Top Menu Bar (Radix-style menubar) ── */}
      <div className="absolute inset-x-0 top-0 z-20">
        <div
          role="menubar"
          className="flex h-9 items-center space-x-1 border p-1 shadow-sm rounded-none border-b border-none px-[9px] bg-secondary/95 backdrop-blur-sm"
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
          <button
            onClick={() => setChartVisible(!chartVisible)}
            className={`flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground ${chartVisible ? 'bg-accent text-accent-foreground' : ''}`}
            title={chartVisible ? '隐藏海图' : '显示海图'}
          >
            <Layers className="h-4 w-4 mr-1" />
            ENC
          </button>
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

      {/* ── AIS Playback Module ── */}
      <AisPlayback
        onTracksChange={setAllTracks}
        onPlaybackTimeChange={setPlaybackTime}
        onIntervalChange={setIntervalSec}
        onError={setError}
      />
    </div>
  )
}
