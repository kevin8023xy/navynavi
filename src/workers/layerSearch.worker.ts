// Web Worker for fast layer search without blocking UI thread

interface Layer {
  id: string
  mmsi: number
  name: string
  visible: boolean
}

interface SearchMessage {
  query: string
  layers: Layer[]
}

const escapeRegex = (str: string) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

self.onmessage = ({ data }: MessageEvent<SearchMessage>) => {
  const { query, layers } = data

  if (!query.trim()) {
    self.postMessage({
      results: layers,
      timestamp: Date.now(),
    })
    return
  }

  try {
    const regex = new RegExp(escapeRegex(query), 'i')

    const filtered = layers.filter(
      (layer) =>
        regex.test(layer.name) || regex.test(layer.mmsi.toString())
    )

    self.postMessage({
      results: filtered,
      timestamp: Date.now(),
    })
  } catch (error) {
    self.postMessage({
      results: [],
      error: error instanceof Error ? error.message : 'Search error',
      timestamp: Date.now(),
    })
  }
}
