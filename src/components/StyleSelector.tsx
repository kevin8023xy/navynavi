import { useState } from 'react'
import type { LayerStyle } from './LayerManager'

interface StyleSelectorProps {
  onStyleSelect: (style: LayerStyle) => void
  onClose: () => void
  initialStyle?: LayerStyle
}

const DEFAULT_STYLE: LayerStyle = {
  color: '#4ECDC4',
  width: 2,
  opacity: 0.8,
  dashArray: [5, 5],
}

export default function StyleSelector({
  onStyleSelect,
  onClose,
  initialStyle = DEFAULT_STYLE,
}: StyleSelectorProps) {
  const [style, setStyle] = useState<LayerStyle>(initialStyle)

  const handleConfirm = () => {
    onStyleSelect(style)
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/20"
        onClick={onClose}
      />

      {/* Style Selector Sidebar (left side of LayerManager) */}
      <div className="fixed left-auto right-[20%] top-9 h-[calc(100vh-36px)] w-64 bg-white border-r border-slate-200 shadow-lg flex flex-col z-50">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-800">Style Settings</h3>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Line Type */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">
              Line Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() =>
                  setStyle((s) => ({ ...s, dashArray: null }))
                }
                className={`px-2 py-2 rounded text-xs font-medium transition-colors ${
                  !style.dashArray
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Solid line"
              >
                ━━━━
              </button>
              <button
                onClick={() =>
                  setStyle((s) => ({ ...s, dashArray: [5, 5] }))
                }
                className={`px-2 py-2 rounded text-xs font-medium transition-colors ${
                  style.dashArray?.[0] === 5 && style.dashArray?.[1] === 5
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="5-5 dash"
              >
                ⸌ ⸌ ⸌
              </button>
              <button
                onClick={() =>
                  setStyle((s) => ({ ...s, dashArray: [10, 2] }))
                }
                className={`px-2 py-2 rounded text-xs font-medium transition-colors ${
                  style.dashArray?.[0] === 10 && style.dashArray?.[1] === 2
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="10-2 dash"
              >
                ⸏⸏ ⸏⸏
              </button>
            </div>
          </div>

          {/* Line Width */}
          <div>
            <label className="text-xs font-semibold text-slate-600 flex justify-between mb-2">
              <span>Width</span>
              <span className="text-blue-600">{style.width}px</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={style.width}
              onChange={(e) =>
                setStyle((s) => ({ ...s, width: parseInt(e.target.value) }))
              }
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                  (style.width / 10) * 100
                }%, #e2e8f0 ${(style.width / 10) * 100}%, #e2e8f0 100%)`,
              }}
            />
          </div>

          {/* Opacity */}
          <div>
            <label className="text-xs font-semibold text-slate-600 flex justify-between mb-2">
              <span>Opacity</span>
              <span className="text-blue-600">{Math.round(style.opacity * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.opacity}
              onChange={(e) =>
                setStyle((s) => ({ ...s, opacity: parseFloat(e.target.value) }))
              }
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-2 mb-2">
              <div
                className="w-4 h-4 rounded border border-slate-300"
                style={{ backgroundColor: style.color }}
              />
              Color
            </label>
            <input
              type="color"
              value={style.color}
              onChange={(e) =>
                setStyle((s) => ({ ...s, color: e.target.value }))
              }
              className="w-full h-10 rounded cursor-pointer border border-slate-200"
            />
          </div>
        </div>

        {/* Footer (Action Buttons) */}
        <div className="px-4 py-3 border-t border-slate-200 flex-shrink-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-3 py-2 text-sm font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  )
}
