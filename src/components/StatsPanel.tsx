import { useState } from 'react'
import { X, Download, BarChart3 } from 'lucide-react'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'

interface StatsPanelProps {
  onClose?: () => void
}

interface ZoneShip {
  mmsi: number
  fairways: string[]
  zones: string[]
  points: number
  zoneCount: number
  fairwayCount: number
}

const API_BASE = import.meta.env.VITE_API_BASE || ''

function dateToLocalDateTimeString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}:${s}`
}

function toUnixLocal(datetimeLocal: string): number | undefined {
  if (!datetimeLocal) return undefined
  const ms = new Date(datetimeLocal).getTime()
  return Math.floor(ms / 1000)
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => (c == null ? '' : String(c)))
        .map((c) => (c.includes(',') ? `"${c}"` : c))
        .join(',')
    )
    .join('\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function StatsPanel({ onClose }: StatsPanelProps) {
  const [tab, setTab] = useState<'zone'>('zone')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [zoneMinSog, setZoneMinSog] = useState<string>('3')
  const [zoneExcludeFishing, setZoneExcludeFishing] = useState<boolean>(true)
  const [zoneExcludeTowing, setZoneExcludeTowing] = useState<boolean>(true)

  const [zoneShips, setZoneShips] = useState<ZoneShip[]>([])
  const [zoneSummary, setZoneSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const [msgKind, setMsgKind] = useState<'error' | 'warn' | 'info'>('error')

  const runZoneStats = async () => {
    setLoading(true)
    setMsg('')
    try {
      const params = new URLSearchParams()
      const s = toUnixLocal(startTime)
      const e = toUnixLocal(endTime)
      if (s != null) params.set('start_time', String(s))
      if (e != null) params.set('end_time', String(e))
      params.set('min_sog', zoneMinSog || '0')
      params.set('exclude_fishing', zoneExcludeFishing ? '1' : '0')
      params.set('exclude_towing', zoneExcludeTowing ? '1' : '0')
      const res = await fetch(`${API_BASE}/api/zone-stats?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(data.error || 'Request failed')
        setZoneShips([])
        setZoneSummary(null)
        return
      }
      setZoneShips(data.ships || [])
      setZoneSummary(data.summary || null)
      if (!data.ships || data.ships.length === 0) {
        setMsg('No ships entered any fairway in the current range')
        setMsgKind('info')
      }
    } catch (err: any) {
      setMsg(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const exportZoneStats = () => {
    const rows: (string | number | null)[][] = [
      ['MMSI', 'Fairways', 'Zones', 'Points', 'Zone count', 'Fairway count'],
      ...zoneShips.map((z) => [
        z.mmsi,
        z.fairways.join('|'),
        z.zones.join('|'),
        z.points,
        z.zoneCount,
        z.fairwayCount,
      ]),
    ]
    downloadCsv('zone_stats.csv', rows)
  }

  return (
    <div className="absolute right-3 top-3 z-20 w-[440px] max-h-[85vh] overflow-auto rounded-xl border border-white/50 bg-white/70 px-4 py-3 shadow-xl backdrop-blur-md text-slate-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-800" />
          <span className="text-base font-bold text-slate-900">Fairway / Zone Stats</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab */}
      <div className="flex mb-3 border-b border-white/40">
        <button
          className={`px-3 py-1.5 text-sm ${tab === 'zone' ? 'border-b-2 border-slate-700 font-semibold' : 'text-slate-400'}`}
          onClick={() => setTab('zone')}
        >
          Zone Stats
        </button>
      </div>

      {/* 时间范围（两个 tab 共用） */}
      <div className="space-y-2 mb-3">
        <label className="block text-xs text-slate-500">Time range (optional, empty = all data)</label>
        <div className="flex items-center gap-2">
          <DateTimePicker
            value={startTime ? new Date(startTime) : null}
            onChange={(d) => setStartTime(d ? dateToLocalDateTimeString(d) : '')}
            format="MM/dd/yyyy hh:mm aa"
            ampm
            slotProps={{
              textField: {
                size: 'small',
                className: 'flex-1',
              },
            }}
          />
          <span className="text-xs text-slate-400">to</span>
          <DateTimePicker
            value={endTime ? new Date(endTime) : null}
            onChange={(d) => setEndTime(d ? dateToLocalDateTimeString(d) : '')}
            format="MM/dd/yyyy hh:mm aa"
            ampm
            slotProps={{
              textField: {
                size: 'small',
                className: 'flex-1',
              },
            }}
          />
        </div>
      </div>

      {tab === 'zone' && (
        <div className="space-y-2 mb-3">
          <label className="block text-xs text-slate-500">
            Ships entering fairways by MMSI, and the zone faces they passed through
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Min SOG (kn)</label>
            <input
              type="number"
              value={zoneMinSog}
              onChange={(e) => setZoneMinSog(e.target.value)}
              className="w-20 rounded border border-white/40 bg-white/60 px-2 py-1 text-xs"
            />
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={zoneExcludeFishing}
                onChange={(e) => setZoneExcludeFishing(e.target.checked)}
              />
              Exclude fishing
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={zoneExcludeTowing}
                onChange={(e) => setZoneExcludeTowing(e.target.checked)}
              />
              Exclude towing
            </label>
          </div>
          <button
            onClick={runZoneStats}
            disabled={loading}
            className="w-full rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Running…' : 'Run Zone Stats'}
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`mb-2 rounded px-2 py-1 text-xs ${
            msgKind === 'warn'
              ? 'bg-amber-100 text-amber-700'
              : msgKind === 'info'
              ? 'bg-slate-100 text-slate-600'
              : 'bg-red-100 text-red-600'
          }`}
        >
          {msg}
        </div>
      )}

      {/* 结果区 */}
      {tab === 'zone' && zoneSummary && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">
              {zoneSummary.totalShipsInFairway} ships entered fairways ({zoneSummary.totalTrackPoints} track points)
            </span>
            <button onClick={exportZoneStats} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
              <Download className="h-3 w-3" /> Export CSV
            </button>
          </div>
          <div className="overflow-auto max-h-[40vh] border border-white/40 rounded">
            <table className="w-full text-xs">
              <thead className="bg-white/60 sticky top-0">
                <tr>
                  <th className="px-1 py-1 text-left">MMSI</th>
                  <th className="px-1 py-1 text-left">Fairways</th>
                  <th className="px-1 py-1 text-left">Zones</th>
                  <th className="px-1 py-1 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {zoneShips.map((z) => (
                  <tr key={z.mmsi} className="border-t border-white/30">
                    <td className="px-1 py-1 tabular-nums">{z.mmsi}</td>
                    <td className="px-1 py-1">{z.fairways.join(', ')}</td>
                    <td className="px-1 py-1">{z.zones.join(', ')}</td>
                    <td className="px-1 py-1 text-right tabular-nums">{z.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
