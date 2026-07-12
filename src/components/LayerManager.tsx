import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Layers } from 'lucide-react'
import { useLayerSearch } from '../hooks/useLayerSearch'

export interface LayerStyle {
  color: string
  width: number
  opacity: number
  dashArray: number[] | null
}

export interface MapLayer {
  id: string
  mmsi: number
  name: string
  visible: boolean
  zIndex: number
  style: LayerStyle
}

interface LayerManagerProps {
  onLayersChange?: (layers: MapLayer[]) => void
}

const STORAGE_KEY = 'layerManager_activeLayers'

export default function LayerManager({
  onLayersChange,
}: LayerManagerProps) {
  const [allLayers, setAllLayers] = useState<MapLayer[]>([])
  const [activeLayers, setActiveLayers] = useState<MapLayer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const searchWorkerRef = useRef<Worker | null>(null)
  const { searchResults } = useLayerSearch(searchQuery, allLayers, searchWorkerRef)

  // 初始化 Worker
  useEffect(() => {
    try {
      searchWorkerRef.current = new Worker(
        new URL('../workers/layerSearch.worker.ts', import.meta.url),
        { type: 'module' }
      )
    } catch (error) {
      console.warn('[LayerManager] Failed to initialize Web Worker:', error)
    }

    return () => {
      searchWorkerRef.current?.terminate()
    }
  }, [])

  // 加载初始船舶数据
  useEffect(() => {
    const loadLayers = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/tracks?page_size=100000')
        const data = await response.json()

        if (data.data && Array.isArray(data.data)) {
          const vesselMap = new Map<number, MapLayer>()

          data.data.forEach((record: any) => {
            const mmsi = record.mmsi
            if (!vesselMap.has(mmsi)) {
              vesselMap.set(mmsi, {
                id: mmsi.toString(),
                mmsi,
                name: `Vessel ${mmsi}`,
                visible: false,
                zIndex: 0,
                style: {
                  color: getRandomColor(),
                  width: 2,
                  opacity: 0.8,
                  dashArray: [5, 5],
                },
              })
            }
          })

          const layers = Array.from(vesselMap.values()).sort(
            (a, b) => b.mmsi - a.mmsi
          )
          setAllLayers(layers)

          // 加载之前保存的活跃图层
          const savedActiveIds = localStorage.getItem(STORAGE_KEY)
          if (savedActiveIds) {
            try {
              const activeIds: string[] = JSON.parse(savedActiveIds)
              const saved = layers.filter((l) => activeIds.includes(l.id))
              setActiveLayers(saved)
            } catch (e) {
              console.warn('[LayerManager] Failed to restore saved layers:', e)
            }
          }
        }
      } catch (error) {
        console.error('[LayerManager] Failed to load layers:', error)
      } finally {
        setLoading(false)
      }
    }

    loadLayers()
  }, [])

  // 保存活跃图层到 localStorage
  const saveActiveLayers = useCallback((layers: MapLayer[]) => {
    const ids = layers.map((l) => l.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }, [])

  // 切换图层可见性
  const toggleLayer = useCallback(
    (layerId: string, shouldEnable: boolean) => {
      const layer = allLayers.find((l) => l.id === layerId)
      if (!layer) return

      let newActiveLayers: MapLayer[]

      if (shouldEnable) {
        // 添加到 Active
        const newLayer = {
          ...layer,
          visible: true,
          zIndex: activeLayers.length,
        }
        newActiveLayers = [...activeLayers, newLayer]
      } else {
        // 从 Active 移除
        newActiveLayers = activeLayers.filter((l) => l.id !== layerId)
      }

      setActiveLayers(newActiveLayers)
      saveActiveLayers(newActiveLayers)
      onLayersChange?.(newActiveLayers)
    },
    [allLayers, activeLayers, onLayersChange, saveActiveLayers]
  )

  const libraryLayers = allLayers.filter(
    (layer) => !activeLayers.find((al) => al.id === layer.id)
  )

  const displayLayers = searchQuery.trim() ? searchResults : libraryLayers

  return (
    <div className="fixed right-0 top-0 bottom-0 w-1/5 bg-white/90 backdrop-blur-md border-l border-slate-200 flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-600" />
          <h2 className="font-semibold text-slate-800 text-sm">Layers</h2>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-3">
        {/* Active Layers */}
        <div className="flex-1 min-h-0 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-600 mb-2">
            Active ({activeLayers.length})
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1">
            {activeLayers.length === 0 ? (
              <p className="text-xs text-slate-400">No active layers</p>
            ) : (
              activeLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => toggleLayer(layer.id, false)}
                    className="w-3 h-3 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {layer.name}
                    </p>
                  </div>
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: layer.style.color }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Library */}
        <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200 pt-3">
          <h3 className="text-xs font-semibold text-slate-600 mb-2">
            Library ({displayLayers.length})
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : displayLayers.length === 0 ? (
              <p className="text-xs text-slate-400">
                {searchQuery.trim() ? 'No results' : 'All active'}
              </p>
            ) : (
              displayLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-blue-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggleLayer(layer.id, true)}
                    className="w-3 h-3 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {layer.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {layer.mmsi}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getRandomColor(): string {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
    '#F8B88B',
    '#82E0AA',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
