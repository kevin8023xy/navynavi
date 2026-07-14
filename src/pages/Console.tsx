import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Ship, MapPin, Navigation, Anchor, Clock } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import compassIcon from '../assets/compass.png'
import logo from '../assets/logo.webp'
import { groupByMmsi, interpolateRecord, type InterpolatableRecord } from '../lib/interpolate'
import AisPlayback from '../components/AisPlayback'
import DataManager from '../components/DataManager'
import LayerManager from '../components/LayerManager'
import type { MapLayer } from '../components/LayerManager'

const TOOLS_MENU = [
  { label: 'AIS Codec', submenu: ['Encoder', 'Decoder'] },
  { label: 'AIS Playback' },
  { label: 'Layer Manager' },
  { separator: true },
  { label: 'Data Manager' },
  { separator: true },
  { label: 'Broadcasting' },
  { label: 'Ship Simulation' },
  { label: 'Ship Relationships' },
  { separator: true },
  { label: 'Ship Analysis' },
  { separator: true },
  { label: 'Close All...' },
]

const NAV_STATUS: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted maneuverability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Grounded',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  9: 'Reserved',
  10: 'Reserved',
  11: 'Power-driven vessel towing',
  12: 'Reserved',
  13: 'Reserved',
  14: 'Reserved',
}

function navStatusText(status: number | null) {
  if (status == null || status === 15) return 'Undefined'
  return NAV_STATUS[status] ?? 'Undefined'
}

function formatLatLng(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`
}

function formatSpeed(sog: number | null) {
  if (sog == null) return '-- kt'
  return `${sog.toFixed(1)} kt`
}

function formatCourse(value: number | null) {
  if (value == null) return '--'
  return `${Math.round(value)}°`
}

function formatUtcTime(ts: number) {
  const d = new Date(ts * 1000)
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }
  return `${d.toLocaleString('en-US', opts)} UTC`
}

function getShipRotation(record: InterpolatableRecord): number {
  if (record.heading != null && record.heading !== 511) return record.heading
  if (record.cog != null && record.cog !== 511) return record.cog
  return 0
}

function createShipMarkerElement(): HTMLElement {
  const el = document.createElement('div')
  el.style.width = '24px'
  el.style.height = '24px'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.pointerEvents = 'auto'
  el.style.cursor = 'pointer'

  const img = document.createElement('img')
  img.src = compassIcon
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'contain'
  img.style.pointerEvents = 'none'
  el.appendChild(img)

  return el
}

interface HoverShip {
  x: number
  y: number
  mmsi: number
  sog: number | null
  cog: number | null
  heading: number | null
  status: number | null
  timestamp: number
  lat: number
  lng: number
}

export default function Console() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)

  const [toolsOpen, setToolsOpen] = useState(false)
  const [aisSubmenuOpen, setAisSubmenuOpen] = useState(false)
  const toolsRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [aisPlaybackOpen, setAisPlaybackOpen] = useState(false)
  const [dataManagerOpen, setDataManagerOpen] = useState(false)
  const [layerManagerOpen, setLayerManagerOpen] = useState(false)

  const trajectorySourceRef = useRef<string | null>(null)
  const trajectoryLayersRef = useRef<string[]>([])
  const trajectoryCoordinatesRef = useRef<Map<number, [number, number][]>>(new Map())
  const [activeLayers, setActiveLayers] = useState<MapLayer[]>([])
  const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null)
  const [dataVersion, setDataVersion] = useState(0)


  // NavyNavi app menu state
  const [navyMenuOpen, setNavyMenuOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const navyMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // ── Close NavyNavi dropdown on outside click ──
  useEffect(() => {
    if (!navyMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (navyMenuRef.current && !navyMenuRef.current.contains(e.target as Node)) {
        setNavyMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [navyMenuOpen])

  // ── Close About modal on Escape ──
  useEffect(() => {
    if (!aboutOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [aboutOpen])

  // Playback data surfaced from AisPlayback module for map rendering
  const [allTracks, setAllTracks] = useState<any[]>([])
  const [playbackTime, setPlaybackTime] = useState<number>(0)
  const [cursorCoords, setCursorCoords] = useState<{ lng: number; lat: number } | null>(null)
  const [hoverShip, setHoverShip] = useState<HoverShip | null>(null)

  // ── Custom DOM markers for active ships (Plan C) ──
  const shipMarkers = useRef<Map<number, maplibregl.Marker>>(new Map())
  const shipRecordsRef = useRef<Map<number, InterpolatableRecord>>(new Map())
  const shipsSymbolLayerRemoved = useRef(false)
  const shipsByMmsi = useMemo(() => groupByMmsi(allTracks as InterpolatableRecord[]), [allTracks])

  // Update marker positions/rotations as playback time advances; add/remove markers as the window changes.
  useEffect(() => {
    if (!map.current) return

    const m = map.current
    const markers = shipMarkers.current
    const activeMmsis = new Set<number>()


    // Remove legacy symbol layer from previous approaches if it still exists
    if (!shipsSymbolLayerRemoved.current) {
      try {
        if (m.getLayer('ships-points')) m.removeLayer('ships-points')
        if (m.getSource('ships')) m.removeSource('ships')
      } catch (e) {
        // ignore
      }
      shipsSymbolLayerRemoved.current = true
    }

    for (const [mmsi, records] of shipsByMmsi) {
      const r = interpolateRecord(records, playbackTime)
      if (!r) continue

      activeMmsis.add(mmsi)
      shipRecordsRef.current.set(mmsi, r)
      let marker = markers.get(mmsi)
      if (!marker) {
        const el = createShipMarkerElement()
        marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
          rotationAlignment: 'map',
          pitchAlignment: 'map',
        })
          .setLngLat([r.lng, r.lat])
          .setRotation(getShipRotation(r))
          .addTo(m)
        markers.set(mmsi, marker)

        el.addEventListener('mouseenter', () => {
          m.getCanvas().style.cursor = 'pointer'
        })
        el.addEventListener('mouseleave', () => {
          m.getCanvas().style.cursor = ''
          setHoverShip(null)
        })
        el.addEventListener('mousemove', (e) => {
          const record = shipRecordsRef.current.get(mmsi)
          if (!record) return
          setHoverShip({
            x: e.clientX,
            y: e.clientY,
            mmsi: record.mmsi,
            lat: record.lat,
            lng: record.lng,
            sog: record.sog ?? null,
            cog: record.cog ?? null,
            heading: record.heading ?? null,
            status: record.status ?? null,
            timestamp: record.timestamp,
          })
        })
      } else {
        marker.setLngLat([r.lng, r.lat])
        marker.setRotation(getShipRotation(r))
      }
    }

    // Remove markers for ships that are no longer in the window
    for (const [mmsi, marker] of markers) {
      if (!activeMmsis.has(mmsi)) {
        marker.remove()
        markers.delete(mmsi)
        shipRecordsRef.current.delete(mmsi)
      }
    }

  }, [shipsByMmsi, playbackTime])

  // Remove all markers on unmount
  useEffect(() => {
    return () => {
      for (const marker of shipMarkers.current.values()) {
        marker.remove()
      }
      shipMarkers.current.clear()
      shipRecordsRef.current.clear()
    }
  }, [])

  // ── Update map trajectories ──
  const updateMapTrajectories = useCallback(async (vessels: Array<{ mmsi: number; color: string; dashed: boolean; visible: boolean }>, mapRef: maplibregl.Map | null) => {
    if (!mapRef) return

    // 移除旧的轨迹图层
    trajectoryLayersRef.current.forEach((layerName) => {
      try {
        mapRef.removeLayer(layerName)
      } catch (e) {
        // Layer might not exist
      }
    })
    trajectoryLayersRef.current = []

    // 移除旧的数据源
    if (trajectorySourceRef.current) {
      try {
        mapRef.removeSource(trajectorySourceRef.current)
      } catch (e) {
        // Source might not exist
      }
    }

    trajectoryCoordinatesRef.current.clear()

    if (vessels.length === 0) return

    try {
      // 获取每条船的轨迹数据
      const features: any[] = []

      for (const vessel of vessels) {
        if (!vessel.visible) continue

        const response = await fetch(`/api/tracks?mmsi=${vessel.mmsi}&page_size=10000000000000000`)
        const data = await response.json()

        if (data.data && data.data.length > 0) {
          // 创建线条坐标数组，应用线性插值使其丝滑
          const coordinates = data.data
            .sort((a: any, b: any) => a.timestamp - b.timestamp)
            .map((record: any) => [record.lng, record.lat])

          trajectoryCoordinatesRef.current.set(vessel.mmsi, coordinates)

          features.push({
            type: 'Feature',
            properties: { mmsi: vessel.mmsi, color: vessel.color, dashed: vessel.dashed },
            geometry: {
              type: 'LineString',
              coordinates,
            },
          })
        }
      }

      if (features.length === 0) return

      // 添加数据源
      const sourceName = `trajectory-source-${Date.now()}`
      trajectorySourceRef.current = sourceName

      mapRef.addSource(sourceName, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      })

      // 添加线条图层（为每条线使用不同颜色）
      features.forEach((feature, idx) => {
        const layerName = `trajectory-layer-${sourceName}-${idx}`
        trajectoryLayersRef.current.push(layerName)

        mapRef.addLayer({
          id: layerName,
          type: 'line',
          source: sourceName,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': feature.properties.color,
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': feature.properties.dashed ? [5, 3] : [1, 0],
          },
          filter: ['==', ['get', 'mmsi'], feature.properties.mmsi],
        })

        // 为轨迹线添加方向箭头
        const arrowLayerName = `trajectory-arrow-${sourceName}-${idx}`
        trajectoryLayersRef.current.push(arrowLayerName)
        mapRef.addLayer({
          id: arrowLayerName,
          type: 'symbol',
          source: sourceName,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 60,
            'text-field': '▶',
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-keep-upright': false,
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'map',
          },
          paint: {
            'text-color': feature.properties.color,
            'text-opacity': 0.9,
          },
          filter: ['==', ['get', 'mmsi'], feature.properties.mmsi],
        })
      })
    } catch (err) {
      console.error('[Trajectory] Error:', err)
    }
  }, [])

  // ── Watch active layers and update map trajectories ──
  useEffect(() => {
    if (!map.current) return

    const vessels = activeLayers.map((layer) => ({
      mmsi: layer.mmsi,
      color: layer.style.color,
      dashed: layer.style.dashArray !== null,
      visible: layer.visible,
    }))

    updateMapTrajectories(vessels, map.current)
  }, [activeLayers, dataVersion, updateMapTrajectories])


  // ── Handle layer focus (highlight and fly to) ──
  useEffect(() => {
    if (!map.current || !focusedLayerId) return

    const layer = activeLayers.find((l) => l.id === focusedLayerId)
    if (!layer) return

    // 获取该图层的坐标
    const coordinates = trajectoryCoordinatesRef.current.get(layer.mmsi)
    if (!coordinates || coordinates.length === 0) return

    // 计算边界框
    const bounds = coordinates.reduce(
      (acc, [lng, lat]) => {
        return {
          minLng: Math.min(acc.minLng, lng),
          minLat: Math.min(acc.minLat, lat),
          maxLng: Math.max(acc.maxLng, lng),
          maxLat: Math.max(acc.maxLat, lat),
        }
      },
      { minLng: coordinates[0][0], minLat: coordinates[0][1], maxLng: coordinates[0][0], maxLat: coordinates[0][1] }
    )

    // 飞到该区域并添加一些 padding
    map.current.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 100, duration: 1000 }
    )

    // 高亮该轨迹线条（增加线宽和不透明度）
    trajectoryLayersRef.current.forEach((layerName) => {
      if (layerName.startsWith('trajectory-layer-')) {
        map.current!.setPaintProperty(
          layerName,
          'line-width',
          [
            'case',
            ['==', ['get', 'mmsi'], layer.mmsi],
            6, // 高亮时的宽度
            2, // 正常宽度
          ]
        )
        map.current!.setPaintProperty(
          layerName,
          'line-opacity',
          [
            'case',
            ['==', ['get', 'mmsi'], layer.mmsi],
            1.0, // 高亮时的透明度
            0.8, // 正常透明度
          ]
        )
      } else if (layerName.startsWith('trajectory-arrow-')) {
        map.current!.setLayoutProperty(
          layerName,
          'text-size',
          [
            'case',
            ['==', ['get', 'mmsi'], layer.mmsi],
            18, // 高亮时的箭头大小
            12, // 正常箭头大小
          ]
        )
        map.current!.setPaintProperty(
          layerName,
          'text-opacity',
          [
            'case',
            ['==', ['get', 'mmsi'], layer.mmsi],
            1.0, // 高亮时的透明度
            0.9, // 正常透明度
          ]
        )
      }
    })

    // 3 秒后恢复高亮
    const timer = setTimeout(() => {
      if (!map.current) return
      trajectoryLayersRef.current.forEach((layerName) => {
        try {
          if (layerName.startsWith('trajectory-layer-')) {
            map.current!.setPaintProperty(layerName, 'line-width', 2)
            map.current!.setPaintProperty(layerName, 'line-opacity', 0.8)
          } else if (layerName.startsWith('trajectory-arrow-')) {
            map.current!.setLayoutProperty(layerName, 'text-size', 12)
            map.current!.setPaintProperty(layerName, 'text-opacity', 0.9)
          }
        } catch (e) {
          // Layer might not exist
        }
      })
      setFocusedLayerId(null)
    }, 3000)

    return () => clearTimeout(timer)
  }, [focusedLayerId, activeLayers])

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
                minzoom: 6,
                maxzoom: 14,
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

      m.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left')
      m.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-right'
      )

      m.on('error', (e) => {
        setError(e.error?.message || 'Map failed to load')
      })

      m.on('mousemove', (e) => {
        setCursorCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat })
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
                m.addLayer({ ...layer, layout: { visibility: 'visible', ...layer.layout } })
              }
            })
            console.log('[Map] S-52 chart layers added')
          }
        } catch (e) {
          console.warn('[Map] Failed to load S-52 style:', e)
        }

        // 添加 S-57 水深点标签（白色 12px，来自 .000 原始文件）
        try {
          m.addSource('soundings', {
            type: 'geojson',
            data: '/data/soundings.json',
          })
          m.addLayer({
            id: 'soundings-label',
            type: 'symbol',
            source: 'soundings',
            minzoom: 10,
            layout: {
              'text-field': ['get', 'VALSOU'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 6,
              'text-anchor': 'center',
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': 'rgba(255,255,255,0.3)',
              'text-halo-color': 'rgba(0, 0, 0, 0.5)',
              'text-halo-width': 0,
            },
          })
          console.log('[Map] Soundings label added')
        } catch (e) {
          console.warn('[Map] Failed to add soundings:', e)
        }



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

        // 添加自定义 line1 线段（第二条线：#F2D0E8）
        try {
          m.addSource('line1-2', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [121.864398, 40.302282],
                      [121.923241, 40.312429],
                      [121.991482, 40.307805],
                    ],
                  },
                },
              ],
            },
          })
          m.addLayer({
            id: 'line1-2-line',
            type: 'line',
            source: 'line1-2',
            paint: {
              'line-color': '#F2D0E8',
              'line-width': 1,
              'line-dasharray': [4, 4],
            },
          })
          console.log('[Map] Line1-2 added')
        } catch (e) {
          console.warn('[Map] Failed to add line1-2:', e)
        }

        // 添加自定义 line1 线段（第一条线：#4fd0c7）
        try {
          m.addSource('line1', {
            type: 'geojson',
            data: '/data/line1.geojson',
          })
          m.addLayer({
            id: 'line1-line',
            type: 'line',
            source: 'line1',
            paint: {
              'line-color': '#4fd0c7',
              'line-width': 1,
              'line-dasharray': [4, 4],
            },
          })
          console.log('[Map] Line1 added')
        } catch (e) {
          console.warn('[Map] Failed to add line1:', e)
        }

        // 添加自定义航行区域面
        try {
          m.addSource('zone-polygon', {
            type: 'geojson',
            data: '/data/zone-polygon.geojson',
          })
          m.addLayer({
            id: 'zone-polygon-fill',
            type: 'fill',
            source: 'zone-polygon',
            paint: {
              'fill-color': 'rgba(0, 0, 0, 0.1)',
            },
          })
          m.addLayer({
            id: 'zone-polygon-line',
            type: 'line',
            source: 'zone-polygon',
            paint: {
              'line-color': 'rgba(0, 0, 0, 1)',
              'line-width': 1,
              'line-dasharray': [2, 2],
            },
          })
          console.log('[Map] Zone polygon added')

          // 为每个面添加中心 id 标签
          try {
            const res2 = await fetch('/data/zone-polygon.geojson')
            const zoneData = await res2.json()
            zoneData.features.forEach((feature: any, index: number) => {
              const coords = feature.geometry.coordinates[0] as [number, number][]
              const centroid = coords
                .reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
                .map((v) => v / coords.length) as [number, number]

              const el = document.createElement('div')
              el.style.cssText = `
                width: 20px;
                height: 20px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.2);
                color: rgba(0, 0, 0, 0.9);
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
                pointer-events: none;
                font-family: system-ui, -apple-system, sans-serif;
              `
              el.textContent = String(feature.properties?.id ?? index + 1)

              new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(centroid)
                .addTo(m)
            })
          } catch (e) {
            console.warn('[Map] Failed to add zone labels:', e)
          }
        } catch (e) {
          console.warn('[Map] Failed to add zone polygon:', e)
        }

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
  // ENC 图层常显，不再提供切换按钮

  // (ships layer logic moved above: shipsGeoJson + data/filter effects)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#c4dced]">
      {/* ── Top Menu Bar (Radix-style menubar) ── */}
      <div className="absolute inset-x-0 top-0 z-20">
        <div
          role="menubar"
          className="flex h-9 items-center space-x-1 border p-1 shadow-sm rounded-none border-b border-none px-[9px] bg-[#d3d5d7]/75 backdrop-blur-md"
        >
          <div className="relative" ref={navyMenuRef}>
            <button
              onClick={() => setNavyMenuOpen(!navyMenuOpen)}
              className="flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground font-heading"
            >
              <span className="mb-[2px]">NavyNavi</span>
            </button>
            {navyMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-48 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md bg-secondary/75 backdrop-blur-md border-none">
                <button
                  onClick={() => {
                    setNavyMenuOpen(false)
                    setAboutOpen(true)
                  }}
                  className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                >
                  About NavyNavi..
                </button>
                <button
                  onClick={() => {
                    setNavyMenuOpen(false)
                    navigate('/')
                  }}
                  className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
                >
                  Quit Console
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={toolsRef}>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
            >
              Tools
            </button>
            {toolsOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-48 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md bg-secondary/75 backdrop-blur-md border-none">
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
                          className="absolute left-full top-0 ml-1 min-w-32 overflow-hidden rounded-md border p-1 text-popover-foreground shadow-md bg-secondary/75 backdrop-blur-md border-none"
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
                      onClick={() => {
                        setToolsOpen(false)
                        if (item.label === 'AIS Playback') setAisPlaybackOpen(true)
                        if (item.label === 'Data Manager') setDataManagerOpen(true)
                        if (item.label === 'Layer Manager') setLayerManagerOpen(true)
                      }}
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


      {/* ── Cursor Coordinates (bottom-right) ── */}
      {cursorCoords && (
        <div className="absolute bottom-2 right-2 z-10 rounded-md border px-2 py-1 text-xs font-mono shadow-md bg-white/75 backdrop-blur-md border-white/30 text-slate-700">
          {cursorCoords.lat.toFixed(6)}°, {cursorCoords.lng.toFixed(6)}°
        </div>
      )}

      {/* ── Ship Hover Card ── */}
      {hoverShip && (
        <div
          className="absolute z-30 pointer-events-none min-w-[260px] rounded-xl border border-white/50 bg-white/70 px-4 py-3 shadow-xl backdrop-blur-md text-slate-700"
          style={{ left: hoverShip.x + 12, top: hoverShip.y + 12 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Ship className="h-5 w-5 text-slate-800" />
              <span className="text-base font-bold text-slate-900">{hoverShip.mmsi}</span>
            </div>
            <span className="text-slate-400">×</span>
          </div>

          <div className="mb-3 text-xs text-slate-500">Vessel {hoverShip.mmsi}</div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
              <span>{formatLatLng(hoverShip.lat, hoverShip.lng)}</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 shrink-0 text-slate-500" />
                <span>{formatSpeed(hoverShip.sog)}</span>
              </div>
              <span className="text-xs text-slate-400">COG</span>
              <span className="font-medium tabular-nums">{formatCourse(hoverShip.cog)}</span>
              <span className="text-xs text-slate-400">HDG</span>
              <span className="font-medium tabular-nums">{formatCourse(hoverShip.heading)}</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Anchor className="h-4 w-4 shrink-0 text-slate-500" />
                <span>{navStatusText(hoverShip.status)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-slate-500" />
                <span>{formatUtcTime(hoverShip.timestamp)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {aisPlaybackOpen && (
        <AisPlayback
          onTracksChange={setAllTracks}
          onPlaybackTimeChange={setPlaybackTime}
          onIntervalChange={() => {}}
          onError={setError}
          onClose={() => setAisPlaybackOpen(false)}
        />
      )}

      {/* ── Data Manager Modal ── */}
      {dataManagerOpen && (
        <DataManager
          onClose={() => setDataManagerOpen(false)}
          onDataChange={() => setDataVersion((v) => v + 1)}
        />
      )}


      {/* ── Layer Manager Sidebar ── */}
      {layerManagerOpen && (
        <LayerManager
          refreshKey={dataVersion}
          onClose={() => {
            setLayerManagerOpen(false)
            setActiveLayers([])
          }}
          onLayersChange={(layers) => setActiveLayers(layers)}
          onLayerFocus={(layerId) => setFocusedLayerId(layerId)}
        />
      )}


      {/* ── About NavyNavi Modal ── */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-xl bg-white/75 p-8 shadow-2xl text-center backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-heading text-lg font-bold text-slate-800">About</h2>
              <button
                onClick={() => setAboutOpen(false)}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors -mt-1 -mr-1"
                aria-label="Close"
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Logo */}
            <div className="flex justify-center mb-4">
              <img src={logo} alt="NavyNavi Logo" className="w-16 h-16 object-contain" />
            </div>

            {/* Title */}
            <h2 className="font-heading text-2xl font-bold text-slate-800 mb-1">NavyNavi</h2>

            {/* Version */}
            <p className="text-sm text-slate-400 mb-5">Version 0.6.2</p>

            {/* Description */}
            <p className="text-sm text-slate-600 leading-relaxed mb-5 px-2">
              A modern Vessel Traffic Service (VTS) platform designed for intelligent maritime navigation orchestration.
            </p>

            {/* Developer */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-700">Developed by</p>
              <p className="text-sm text-slate-500">NavyNavi Team</p>
            </div>

            {/* Copyright */}
            <p className="text-xs text-slate-400">
              Copyright &copy; 2024-2025 NavyNavi Team. All rights reserved.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
