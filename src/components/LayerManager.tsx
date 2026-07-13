import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Layers } from 'lucide-react'
import { useLayerSearch } from '../hooks/useLayerSearch'
import StyleSelector from './StyleSelector'

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
  onLayerFocus?: (layerId: string | null) => void
}

const STORAGE_KEY = 'layerManager_activeLayers'

export default function LayerManager({
  onLayersChange,
  onLayerFocus,
}: LayerManagerProps) {
  const [allLayers, setAllLayers] = useState<MapLayer[]>([])
  const [activeLayers, setActiveLayers] = useState<MapLayer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [styleSelector, setStyleSelector] = useState<{ layerId: string; isEdit: boolean } | null>(null)
  const [pendingLayer, setPendingLayer] = useState<MapLayer | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const searchWorkerRef = useRef<Worker | null>(null)
  const activeScrollRef = useRef<HTMLDivElement>(null)
  const libraryScrollRef = useRef<HTMLDivElement>(null)
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
        const response = await fetch('/api/tracks?page_size=100000000000000000')
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

  // 勾选图层时显示样式选择器
  const handleLibraryCheck = useCallback((layer: MapLayer) => {
    setPendingLayer(layer)
    setStyleSelector({ layerId: layer.id, isEdit: false })
  }, [])

  // 编辑已勾选图层的样式
  const handleEditStyle = useCallback((layer: MapLayer) => {
    setPendingLayer(layer)
    setStyleSelector({ layerId: layer.id, isEdit: true })
  }, [])

  // 样式选择完成
  const handleStyleConfirm = useCallback(
    (style: LayerStyle) => {
      if (!pendingLayer) return

      if (styleSelector?.isEdit) {
        // 编辑模式：更新现有图层
        const newActiveLayers = activeLayers.map((l) =>
          l.id === pendingLayer.id ? { ...l, style } : l
        )
        setActiveLayers(newActiveLayers)
        saveActiveLayers(newActiveLayers)
        onLayersChange?.(newActiveLayers)
      } else {
        // 添加模式：添加新图层
        const newLayer = {
          ...pendingLayer,
          visible: true,
          style,
          zIndex: activeLayers.length,
        }
        const newActiveLayers = [...activeLayers, newLayer]
        setActiveLayers(newActiveLayers)
        saveActiveLayers(newActiveLayers)
        onLayersChange?.(newActiveLayers)
        setHighlightId(newLayer.id)
        onLayerFocus?.(newLayer.id)
        setTimeout(() => setHighlightId(null), 1500)
      }

      setStyleSelector(null)
      setPendingLayer(null)
    },
    [pendingLayer, styleSelector, activeLayers, saveActiveLayers, onLayersChange]
  )

  // 移除图层
  const removeLayer = useCallback(
    (layerId: string) => {
      const newActiveLayers = activeLayers.filter((l) => l.id !== layerId)
      setActiveLayers(newActiveLayers)
      saveActiveLayers(newActiveLayers)
      onLayersChange?.(newActiveLayers)
    },
    [activeLayers, saveActiveLayers, onLayersChange]
  )


  // 合并搜索结果（包括活跃和库）
  const getSearchResults = useCallback(() => {
    if (!searchQuery.trim()) return { active: [], library: [] }

    return {
      active: activeLayers.filter((layer) =>
        searchResults.some((r) => r.id === layer.id)
      ),
      library: searchResults.filter(
        (layer) => !activeLayers.some((a) => a.id === layer.id)
      ),
    }
  }, [searchQuery, activeLayers, searchResults])

  const { active: searchActiveResults, library: searchLibraryResults } = getSearchResults()
  const isSearching = searchQuery.trim().length > 0

  return (
    <>
      <div className="fixed right-0 top-9 h-[calc(100vh-36px)] w-1/5 bg-white/90 backdrop-blur-md border-l border-slate-200 flex flex-col z-40">
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
        <div className="flex-1 overflow-hidden flex flex-col gap-4 p-3">
          {/* Active Layers */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-xs font-semibold text-slate-600 mb-2">
              Active ({activeLayers.length})
            </h3>
            <div
              ref={activeScrollRef}
              className="flex-1 overflow-y-auto space-y-1"
            >
              {activeLayers.length === 0 ? (
                <p className="text-xs text-slate-400">No active layers</p>
              ) : (
                activeLayers.map((layer) => (
                  <div
                    key={layer.id}
                    id={`layer-${layer.id}`}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
                      highlightId === layer.id
                        ? 'bg-yellow-100 ring-1 ring-yellow-400'
                        : 'hover:bg-blue-50'
                    }`}
                    onClick={() => onLayerFocus?.(layer.id)}
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => removeLayer(layer.id)}
                      className="w-3 h-3 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {layer.name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEditStyle(layer)}
                      className="w-3 h-3 rounded-full flex-shrink-0 hover:ring-2 hover:ring-blue-400"
                      style={{ backgroundColor: layer.style.color }}
                      title="Edit style"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Library */}
          <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200 pt-3">
            <h3 className="text-xs font-semibold text-slate-600 mb-2">
              {isSearching ? `Search Results` : `Library`} (
              {isSearching ? searchLibraryResults.length : allLayers.length - activeLayers.length})
            </h3>
            <div
              ref={libraryScrollRef}
              className="flex-1 overflow-y-auto space-y-1"
            >
              {loading ? (
                <p className="text-xs text-slate-400">Loading...</p>
              ) : isSearching ? (
                <>
                  {searchActiveResults.length > 0 && (
                    <>
                      <p className="text-xs text-slate-500 px-2 py-1">In Active</p>
                      {searchActiveResults.map((layer) => (
                        <div
                          key={`search-active-${layer.id}`}
                          id={`layer-${layer.id}`}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-xs text-slate-500 ${
                            highlightId === layer.id
                              ? 'bg-yellow-100 ring-1 ring-yellow-400'
                              : 'hover:bg-blue-50'
                          }`}
                        >
                          ✓ {layer.name}
                        </div>
                      ))}
                    </>
                  )}
                  {searchLibraryResults.length > 0 && (
                    <>
                      {searchActiveResults.length > 0 && <div className="h-px bg-slate-200" />}
                      <p className="text-xs text-slate-500 px-2 py-1">Available</p>
                      {searchLibraryResults.map((layer) => (
                        <div
                          key={`search-lib-${layer.id}`}
                          id={`layer-${layer.id}`}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                            highlightId === layer.id
                              ? 'bg-yellow-100 ring-1 ring-yellow-400'
                              : 'hover:bg-blue-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => handleLibraryCheck(layer)}
                            className="w-3 h-3 cursor-pointer flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {layer.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {searchActiveResults.length === 0 && searchLibraryResults.length === 0 && (
                    <p className="text-xs text-slate-400">No results</p>
                  )}
                </>
              ) : (
                (allLayers.filter((l) => !activeLayers.find((a) => a.id === l.id)).length === 0 ? (
                  <p className="text-xs text-slate-400">All active</p>
                ) : (
                  allLayers
                    .filter((l) => !activeLayers.find((a) => a.id === l.id))
                    .map((layer) => (
                      <div
                        key={layer.id}
                        id={`layer-${layer.id}`}
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                          highlightId === layer.id
                            ? 'bg-yellow-100 ring-1 ring-yellow-400'
                            : 'hover:bg-blue-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleLibraryCheck(layer)}
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
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Style Selector Modal */}
      {styleSelector && (
        <StyleSelector
          initialStyle={pendingLayer?.style}
          onStyleSelect={handleStyleConfirm}
          onClose={() => {
            setStyleSelector(null)
            setPendingLayer(null)
          }}
        />
      )}
    </>
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
