import { useState, useEffect } from 'react'
import { Upload, Trash2, RotateCw, BarChart3, X } from 'lucide-react'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

interface DataManagerProps {
  onClose: () => void
}

interface Stats {
  timeRange: { min: number; max: number }
  total: { records: number; mmsi: number }
  filtered: { records: number; mmsi: number }
}

export default function DataManager({ onClose }: DataManagerProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [deleteMmsi, setDeleteMmsi] = useState('')
  const [deleteStartTime, setDeleteStartTime] = useState<Date | null>(null)
  const [deleteEndTime, setDeleteEndTime] = useState<Date | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const API_BASE = '/api'

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  // 获取统计数据
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const params = new URLSearchParams()
        if (deleteStartTime) {
          params.append('start_time', Math.floor(deleteStartTime.getTime() / 1000).toString())
        }
        if (deleteEndTime) {
          params.append('end_time', Math.floor(deleteEndTime.getTime() / 1000).toString())
        }

        const response = await fetch(`${API_BASE}/stats?${params}`)
        const data = await response.json()

        if (response.ok) {
          setStats(data)
        } else {
          showMessage('error', `Error: ${data.error}`)
        }
      } catch (err) {
        showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setStatsLoading(false)
      }
    }

    fetchStats()
  }, [deleteStartTime, deleteEndTime])

  const handleUploadCsv = async () => {
    if (!csvFile) {
      showMessage('error', 'Please select a CSV file')
      return
    }

    setLoading(true)
    try {
      const text = await csvFile.text()
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      })

      const data = await response.json()

      if (!response.ok) {
        showMessage('error', `Error: ${data.error}`)
        return
      }

      showMessage('success', `Successfully merged ${data.recordCount} records into ${data.sizeKb} KB`)
      setCsvFile(null)
    } catch (err) {
      showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDryRun = async () => {
    if (!deleteMmsi && !deleteStartTime && !deleteEndTime) {
      showMessage('error', 'Specify at least one filter: MMSI, Start Time, or End Time')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mmsi: deleteMmsi ? parseInt(deleteMmsi) : undefined,
          start_time: deleteStartTime ? Math.floor(deleteStartTime.getTime() / 1000) : undefined,
          end_time: deleteEndTime ? Math.floor(deleteEndTime.getTime() / 1000) : undefined,
          dry_run: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        showMessage('error', `Error: ${data.error}`)
        return
      }

      showMessage('info', `Preview: Will delete ${data.deletedCount} records, keep ${data.remainingCount} records`)
    } catch (err) {
      showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!window.confirm('⚠️ Are you sure you want to delete these records? This action cannot be undone.')) {
      return
    }

    if (!deleteMmsi && !deleteStartTime && !deleteEndTime) {
      showMessage('error', 'Specify at least one filter: MMSI, Start Time, or End Time')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mmsi: deleteMmsi ? parseInt(deleteMmsi) : undefined,
          start_time: deleteStartTime ? Math.floor(deleteStartTime.getTime() / 1000) : undefined,
          end_time: deleteEndTime ? Math.floor(deleteEndTime.getTime() / 1000) : undefined,
          dry_run: false,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        showMessage('error', `Error: ${data.error}`)
        return
      }

      showMessage('success', `Deleted ${data.deletedCount} records, kept ${data.remainingCount} records`)
      setDeleteMmsi('')
      setDeleteStartTime(null)
      setDeleteEndTime(null)
    } catch (err) {
      showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRebuild = async () => {
    if (!window.confirm('Rebuild data cache? This may take a moment.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await response.json()

      if (!response.ok) {
        showMessage('error', `Error: ${data.error}`)
        return
      }

      showMessage('success', `Built successfully! Records: ${data.recordCount}, JSON: ${data.jsonSizeMb}MB, CSV: ${data.csvSizeMb}MB`)
    } catch (err) {
      showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/10">
        <div
          className="relative w-full max-w-2xl h-[85vh] rounded-xl bg-white/75 p-8 shadow-2xl backdrop-blur-md flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-shrink-0">
            <h2 className="font-heading text-lg font-bold text-slate-800">Data Manager</h2>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors -mt-1 -mr-1"
              aria-label="Close"
            >
              <X size={10} />
            </button>
          </div>

          {/* Content Scroll Area */}
          <div className="overflow-y-auto flex-1 pr-2">
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

            {/* Upload Section */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload CSV
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              CSV must contain: mmsi, lat, lon, sog, cog, heading, status, timestamp_ms
            </p>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".csv,.gz"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={loading}
              />
              <button
                onClick={handleUploadCsv}
                disabled={!csvFile || loading}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 my-6" />

          {/* Statistics Section */}
          {stats && (
            <div className="mb-6 p-4 bg-slate-50/50 rounded-lg border border-slate-200">
              <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Data Statistics
              </h3>

              {/* Overall Stats */}
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-600 mb-2">📊 Overall Data</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded border border-slate-200">
                    <p className="text-xs text-slate-500">Total Records</p>
                    <p className="text-lg font-bold text-blue-600">{stats.total.records.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-slate-200">
                    <p className="text-xs text-slate-500">Vessels</p>
                    <p className="text-lg font-bold text-blue-600">{stats.total.mmsi}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Time Range: {new Date(stats.timeRange.min * 1000).toLocaleDateString()} → {new Date(stats.timeRange.max * 1000).toLocaleDateString()}
                </p>
              </div>

              {/* Time Range Filter */}
              {stats && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-slate-600 mb-2">🗓️ Filter by Time Range</p>
                  <div className="grid grid-cols-2 gap-3">
                    <DatePicker
                      label="From"
                      value={deleteStartTime}
                      onChange={(date) => setDeleteStartTime(date)}
                      minDate={new Date(stats.timeRange.min * 1000)}
                      maxDate={new Date(stats.timeRange.max * 1000)}
                      slotProps={{
                        textField: {
                          size: 'small',
                          fullWidth: true,
                          className: 'rounded-lg',
                        },
                      }}
                    />
                    <DatePicker
                      label="To"
                      value={deleteEndTime}
                      onChange={(date) => setDeleteEndTime(date)}
                      minDate={new Date(stats.timeRange.min * 1000)}
                      maxDate={new Date(stats.timeRange.max * 1000)}
                      slotProps={{
                        textField: {
                          size: 'small',
                          fullWidth: true,
                          className: 'rounded-lg',
                        },
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Filtered Stats */}
              {(deleteStartTime || deleteEndTime) && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">📌 In Selected Range</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 p-3 rounded border border-green-200">
                      <p className="text-xs text-slate-500">Records</p>
                      <p className="text-lg font-bold text-green-600">{stats.filtered.records.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded border border-green-200">
                      <p className="text-xs text-slate-500">Vessels</p>
                      <p className="text-lg font-bold text-green-600">{stats.filtered.mmsi}</p>
                    </div>
                  </div>
                </div>
              )}

              {statsLoading && <p className="text-xs text-slate-500 mt-2">Loading statistics...</p>}
            </div>
          )}

          <div className="border-t border-slate-200 my-6" />

          {/* Delete Section */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Delete Data
            </h3>
            <p className="text-xs text-slate-600 mb-3">
              {deleteStartTime || deleteEndTime
                ? `Delete data from the selected time range (${stats?.filtered.records.toLocaleString()} records)`
                : 'Select a time range in the statistics section above, or enter MMSI to delete specific vessel data'}
            </p>
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-600">MMSI (optional)</label>
              <input
                type="number"
                value={deleteMmsi}
                onChange={(e) => setDeleteMmsi(e.target.value)}
                placeholder="e.g., 412226207"
                className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={loading}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteDryRun}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-slate-400 text-white text-sm font-medium rounded-lg hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Loading...' : 'Preview Delete'}
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 my-6" />

          {/* Rebuild Section */}
          <div>
            <h3 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <RotateCw className="w-4 h-4" />
              Rebuild Cache
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              After uploading or deleting data, rebuild the cache to apply changes to APIs.
            </p>
            <button
              onClick={handleRebuild}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Rebuilding...' : 'Rebuild Data Cache'}
            </button>
          </div>
            </div>
          {/* End Scroll Area */}
        </div>
      </div>
    </LocalizationProvider>
  )
}
