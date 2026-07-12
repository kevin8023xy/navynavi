import { useState, useEffect, useRef, MutableRefObject } from 'react'
import type { MapLayer } from '../components/LayerManager'

export function useLayerSearch(
  query: string,
  allLayers: MapLayer[],
  workerRef: MutableRefObject<Worker | null>
): { searchResults: MapLayer[] } {
  const [searchResults, setSearchResults] = useState<MapLayer[]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 清除之前的超时
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (!query.trim()) {
      setSearchResults(allLayers)
      return
    }

    // 如果 Worker 不可用，使用主线程搜索（降级方案）
    if (!workerRef.current) {
      timeoutRef.current = setTimeout(() => {
        const regex = new RegExp(escapeRegex(query), 'i')
        const filtered = allLayers.filter(
          (layer) =>
            regex.test(layer.name) || regex.test(layer.mmsi.toString())
        )
        setSearchResults(filtered)
      }, 100)
      return
    }

    // 使用 Worker 搜索
    const messageHandler = (event: MessageEvent) => {
      const { results } = event.data
      setSearchResults(results)
    }

    workerRef.current.addEventListener('message', messageHandler)

    // 防抖发送搜索请求
    timeoutRef.current = setTimeout(() => {
      workerRef.current?.postMessage({
        query,
        layers: allLayers,
      })
    }, 100)

    return () => {
      if (workerRef.current) {
        workerRef.current.removeEventListener('message', messageHandler)
      }
    }
  }, [query, allLayers, workerRef])

  return { searchResults }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
