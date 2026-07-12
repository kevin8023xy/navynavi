import { useState, useEffect } from 'react'
import { X, Ship } from 'lucide-react'

interface VesselConfig {
  mmsi: number
  color: string
  selected: boolean
}

interface VesselStats {
  mmsi: number
  recordCount: number
  minTime: number
  maxTime: number
}

interface VesselTrajectoryProps {
  onClose: () => void
  onTrajectoryChange?: (vessels: Array<{ mmsi: number; color: string; dashed: boolean }>) => void
}

export default function VesselTrajectory({ onClose, onTrajectoryChange }: VesselTrajectoryProps) {
  const [vessels, setVessels] = useState<VesselConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [lineWidth, setLineWidth] = useState(2)
  const [isDashed, setIsDashed] = useState(true)
  const [opacity, setOpacity] = useState(0.8)

  const API_BASE = '/api'

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // 获取船舶列表
  useEffect(() => {
    const fetchVessels = async () => {
      setLoading(true)
      try {
        // 获取轨迹数据来统计船舶
        const response = await fetch(`${API_BASE}/tracks?page=1&page_size=1000000`)
        const data = await response.json()

        if (!response.ok) {
          showMessage('error', `Error: ${data.error}`)
          return
        }

        // 统计每个 MMSI 的信息
        const vesselMap = new Map<number, VesselStats>()

        data.data.forEach((record: any) => {
          const mmsi = record.mmsi
          if (!vesselMap.has(mmsi)) {
            vesselMap.set(mmsi, {
              mmsi,
              recordCount: 0,
              minTime: record.timestamp,
              maxTime: record.timestamp,
            })
          }

          const stats = vesselMap.get(mmsi)!
          stats.recordCount++
          stats.minTime = Math.min(stats.minTime, record.timestamp)
          stats.maxTime = Math.max(stats.maxTime, record.timestamp)
        })

        // 生成颜色并创建配置
        const colors = [
          '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
          '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#82E0AA',
        ]

        const vesselConfigs = Array.from(vesselMap.values())
          .sort((a, b) => b.recordCount - a.recordCount)
          .map((stats, idx) => ({
            mmsi: stats.mmsi,
            color: colors[idx % colors.length],
            selected: false,
          }))

        setVessels(vesselConfigs)
      } catch (err) {
        showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    fetchVessels()
  }, [])

  // 更新地图轨迹
  useEffect(() => {
    if (onTrajectoryChange) {
      const selectedVessels = vessels
        .filter((v) => v.selected)
        .map((v) => ({
          mmsi: v.mmsi,
          color: v.color,
          dashed: isDashed,
        }))

      onTrajectoryChange(selectedVessels)
    }
  }, [vessels, isDashed, onTrajectoryChange])

  const toggleVessel = (mmsi: number) => {
    setVessels((prev) =>
      prev.map((v) =>
        v.mmsi === mmsi ? { ...v, selected: !v.selected } : v
      )
    )
  }

  const updateColor = (mmsi: number, color: string) => {
    setVessels((prev) =>
      prev.map((v) =>
        v.mmsi === mmsi ? { ...v, color } : v
      )
    )
  }

  const selectedCount = vessels.filter((v) => v.selected).length

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/10">
      <div className="relative w-full max-w-2xl h-[85vh] rounded-xl bg-white/75 p-8 shadow-2xl backdrop-blur-md flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-shrink-0">
          <h2 className="font-heading text-lg font-bold text-slate-800">Vessel Trajectory</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors -mt-1 -mr-1"
            aria-label="Close"
          >
            <X size={10} />
          </button>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : message.type === 'error'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Content Scroll Area */}
        <div className="overflow-y-auto flex-1 pr-2">
          {/* Trajectory Settings */}
          <div className="mb-6 p-4 bg-slate-50/50 rounded-lg border border-slate-200">
            <h3 className="text-base font-semibold text-slate-700 mb-3">⚙️ Trajectory Settings</h3>

            <div className="space-y-3">
              {/* Line Width */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Line Width: {lineWidth}px
                </label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={lineWidth}
                  onChange={(e) => setLineWidth(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Line Style */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">Line Style:</label>
                <button
                  onClick={() => setIsDashed(true)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    isDashed
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  ⸌ Dashed
                </button>
                <button
                  onClick={() => setIsDashed(false)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    !isDashed
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  ━ Solid
                </button>
              </div>

              {/* Opacity */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">
                  Opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 my-6" />

          {/* Vessel List */}
          <div>
            <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Ship className="w-4 h-4" />
              Vessels ({selectedCount} selected)
            </h3>

            {loading ? (
              <p className="text-xs text-slate-500">Loading vessels...</p>
            ) : vessels.length === 0 ? (
              <p className="text-xs text-slate-500">No vessels found</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {vessels.map((vessel) => (
                  <div
                    key={vessel.mmsi}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={vessel.selected}
                      onChange={() => toggleVessel(vessel.mmsi)}
                      className="w-4 h-4 cursor-pointer"
                    />

                    {/* MMSI Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{vessel.mmsi}</p>
                      <p className="text-xs text-slate-500">
                        {vessels.find((v) => v.mmsi === vessel.mmsi)?.selected
                          ? '✓ Selected for display'
                          : 'Click to select'}
                      </p>
                    </div>

                    {/* Color Picker */}
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={vessel.color}
                        onChange={(e) => updateColor(vessel.mmsi, e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-slate-300"
                        title={`Color for vessel ${vessel.mmsi}`}
                      />
                      <span className="text-xs text-slate-500 font-mono">{vessel.color}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
