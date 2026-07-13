import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Trash2, X, AlertCircle } from 'lucide-react'
import { Button } from '@mui/material'

interface DataManagerProps {
  onClose: () => void
  onDataChange?: () => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateInput(date: Date | null): string {
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatTimeInput(date: Date | null): string {
  if (!date) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function parseDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return null
  const [_, y, m, d] = match
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
  if (
    date.getFullYear() !== parseInt(y, 10) ||
    date.getMonth() !== parseInt(m, 10) - 1 ||
    date.getDate() !== parseInt(d, 10)
  ) {
    return null
  }
  return date
}

function parseTimeInput(value: string): { h: number; m: number; s: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/)
  if (!match) return null
  const [_, h, m, s] = match.map((v) => parseInt(v, 10))
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null
  return { h, m, s }
}

function combineDateTime(date: Date | null, time: { h: number; m: number; s: number } | null): Date | null {
  if (!date) return null
  const result = new Date(date)
  if (time) {
    result.setHours(time.h, time.m, time.s)
  } else {
    result.setHours(0, 0, 0)
  }
  return result
}

function formatDateTime(date: Date | null): string {
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isBetweenDay(target: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  return t >= s && t <= e
}

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekDay = firstDay.getDay()
  const rows = 6
  const cols = 7
  const days: Array<{ date: Date; currentMonth: boolean }> = []
  const prevMonthDays = new Date(year, month, 0).getDate()

  for (let i = 0; i < rows * cols; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const dayNumber = row * cols + col - startWeekDay + 1

    let date: Date
    let currentMonth = true

    if (dayNumber <= 0) {
      date = new Date(year, month - 1, prevMonthDays + dayNumber)
      currentMonth = false
    } else if (dayNumber > daysInMonth) {
      date = new Date(year, month + 1, dayNumber - daysInMonth)
      currentMonth = false
    } else {
      date = new Date(year, month, dayNumber)
    }
    days.push({ date, currentMonth })
  }
  return days
}

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
}

function TimePicker({ value, onChange, onClose }: TimePickerProps) {
  const parse = (v: string) => {
    const t = parseTimeInput(v)
    return t ? { h: pad(t.h), m: pad(t.m), s: pad(t.s) } : { h: '00', m: '00', s: '00' }
  }
  const [draft, setDraft] = useState(parse(value))
  const hours = Array.from({ length: 24 }, (_, i) => pad(i))
  const minutes = Array.from({ length: 60 }, (_, i) => pad(i))
  const seconds = Array.from({ length: 60 }, (_, i) => pad(i))

  const renderColumn = (list: string[], selected: string, key: 'h' | 'm' | 's') => (
    <div className="flex-1 h-40 overflow-y-auto text-center border-r border-slate-200 last:border-r-0">
      {list.map((item) => (
        <div
          key={item}
          onClick={() => setDraft((prev) => ({ ...prev, [key]: item }))}
          className={`py-1.5 text-xs cursor-pointer hover:bg-slate-100 ${item === selected ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700'}`}
        >
          {item}
        </div>
      ))}
    </div>
  )

  return (
    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-300 rounded shadow-lg z-50 w-44">
      <div className="flex">
        {renderColumn(hours, draft.h, 'h')}
        {renderColumn(minutes, draft.m, 'm')}
        {renderColumn(seconds, draft.s, 's')}
      </div>
      <div className="flex justify-end gap-2 p-2 border-t border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-xs text-slate-600 hover:text-blue-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(`${draft.h}:${draft.m}:${draft.s}`)
            onClose()
          }}
          className="px-2 py-1 text-xs text-blue-500 font-medium hover:text-blue-600"
        >
          OK
        </button>
      </div>
    </div>
  )
}

interface DateTimeRangePickerProps {
  start: Date | null
  end: Date | null
  onChange: (range: { start: Date | null; end: Date | null }) => void
}

function DateTimeRangePicker({ start, end, onChange }: DateTimeRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [leftMonth, setLeftMonth] = useState(() => {
    const base = start ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const rightMonth = new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1, 1)

  const [draftStart, setDraftStart] = useState<Date | null>(start)
  const [draftEnd, setDraftEnd] = useState<Date | null>(end)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [startDateInput, setStartDateInput] = useState(formatDateInput(start))
  const [startTimeInput, setStartTimeInput] = useState(formatTimeInput(start))
  const [endDateInput, setEndDateInput] = useState(formatDateInput(end))
  const [endTimeInput, setEndTimeInput] = useState(formatTimeInput(end))
  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'end' | null>(null)
  const [leftMode, setLeftMode] = useState<'date' | 'month' | 'year'>('date')
  const [rightMode, setRightMode] = useState<'date' | 'month' | 'year'>('date')
  const [leftViewYear, setLeftViewYear] = useState(leftMonth.getFullYear())
  const [, setLeftViewMonth] = useState(leftMonth.getMonth())
  const [rightViewYear, setRightViewYear] = useState(rightMonth.getFullYear())
  const [, setRightViewMonth] = useState(rightMonth.getMonth())

  const syncInputs = (s: Date | null, e: Date | null) => {
    setStartDateInput(formatDateInput(s))
    setStartTimeInput(formatTimeInput(s))
    setEndDateInput(formatDateInput(e))
    setEndTimeInput(formatTimeInput(e))
  }

  const handleOpen = () => {
    setDraftStart(start)
    setDraftEnd(end)
    setHoverDate(null)
    const base = start ?? new Date()
    setLeftMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    syncInputs(start, end)
    setOpen(true)
  }

  const handleClose = () => setOpen(false)

  const applyInputs = (): { start: Date | null; end: Date | null } => {
    const sDate = parseDateInput(startDateInput)
    const sTime = parseTimeInput(startTimeInput)
    const eDate = parseDateInput(endDateInput)
    const eTime = parseTimeInput(endTimeInput)
    let s = combineDateTime(sDate, sTime)
    let e = combineDateTime(eDate, eTime)
    if (s && e && s > e) {
      [s, e] = [e, s]
    }
    return { start: s, end: e }
  }

  const handleConfirm = () => {
    const result = applyInputs()
    onChange(result)
    setOpen(false)
  }

  const handleClear = () => {
    setDraftStart(null)
    setDraftEnd(null)
    setStartDateInput('')
    setStartTimeInput('')
    setEndDateInput('')
    setEndTimeInput('')
  }

  const handleDateClick = (date: Date) => {
    let nextStart = draftStart
    let nextEnd = draftEnd

    if (!draftStart || (draftStart && draftEnd)) {
      nextStart = date
      nextEnd = null
    } else if (draftStart) {
      if (date < draftStart) {
        nextStart = date
        nextEnd = draftStart
      } else {
        nextEnd = date
      }
    }

    setDraftStart(nextStart)
    setDraftEnd(nextEnd)
    setHoverDate(null)
    syncInputs(nextStart, nextEnd)
  }

  const updateFromInputs = () => {
    const result = applyInputs()
    setDraftStart(result.start)
    setDraftEnd(result.end)
  }

  const renderPanel = (baseMonth: Date, side: 'left' | 'right') => {
    const mode = side === 'left' ? leftMode : rightMode
    const setMode = side === 'left' ? setLeftMode : setRightMode
    const viewYear = side === 'left' ? leftViewYear : rightViewYear
    const setViewYear = side === 'left' ? setLeftViewYear : setRightViewYear
    const setViewMonth = side === 'left' ? setLeftViewMonth : setRightViewMonth

    const goPrev = () => {
      if (mode === 'date') {
        setLeftMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
      } else if (mode === 'month') {
        setViewYear((y) => y - 1)
      } else if (mode === 'year') {
        setViewYear((y) => y - 10)
      }
    }

    const goNext = () => {
      if (mode === 'date') {
        setLeftMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
      } else if (mode === 'month') {
        setViewYear((y) => y + 1)
      } else if (mode === 'year') {
        setViewYear((y) => y + 10)
      }
    }

    const selectYear = (year: number) => {
      setViewYear(year)
      setMode('month')
    }

    const selectMonth = (month: number) => {
      setViewMonth(month)
      if (side === 'left') {
        setLeftMonth(new Date(viewYear, month, 1))
      } else {
        setLeftMonth(new Date(viewYear, month - 1, 1))
      }
      setMode('date')
    }

    const headerText = () => {
      if (mode === 'year') {
        const startYear = Math.floor(viewYear / 10) * 10
        return `${startYear} - ${startYear + 9}`
      }
      if (mode === 'month') {
        return `${viewYear}`
      }
      return `${baseMonth.getFullYear()} ${baseMonth.toLocaleString('en-US', { month: 'long' })}`
    }

    return (
      <div className="flex-1 min-w-0 px-2">
        <div className="flex items-center justify-center py-2 relative h-9">
          {side === 'left' && (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-0 p-1 hover:text-blue-500 text-slate-400 text-lg leading-none"
            >
              ‹
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (mode === 'date') {
                setViewYear(baseMonth.getFullYear())
                setViewMonth(baseMonth.getMonth())
                setMode('year')
              } else if (mode === 'month') {
                setMode('year')
              }
            }}
            className="text-sm font-medium text-slate-700 hover:text-blue-500"
          >
            {headerText()}
          </button>
          {side === 'right' && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-0 p-1 hover:text-blue-500 text-slate-400 text-lg leading-none"
            >
              ›
            </button>
          )}
        </div>

        {mode === 'year' && (
          <div className="grid grid-cols-4 text-center gap-y-5 py-6">
            {Array.from({ length: 10 }, (_, i) => {
              const startYear = Math.floor(viewYear / 10) * 10
              const year = startYear + i
              const selected = year === baseMonth.getFullYear()
              return (
                <div key={year} className="py-1">
                  <div
                    onClick={() => selectYear(year)}
                    className={`inline-flex items-center justify-center h-8 px-4 text-xs cursor-pointer rounded-full transition ${selected ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-slate-700 hover:text-blue-500'}`}
                  >
                    {year}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {mode === 'month' && (
          <div className="grid grid-cols-4 text-center gap-y-5 py-6">
            {Array.from({ length: 12 }, (_, i) => {
              const monthName = new Date(2000, i, 1).toLocaleString('en-US', { month: 'short' })
              const selected = i === baseMonth.getMonth() && viewYear === baseMonth.getFullYear()
              return (
                <div key={i} className="py-1">
                  <div
                    onClick={() => selectMonth(i)}
                    className={`inline-flex items-center justify-center h-8 px-4 text-xs cursor-pointer rounded-full transition ${selected ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-slate-700 hover:text-blue-500'}`}
                  >
                    {monthName}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {mode === 'date' && renderDatePanel(baseMonth)}
      </div>
    )
  }

  const renderDatePanel = (baseMonth: Date) => {
    const year = baseMonth.getFullYear()
    const month = baseMonth.getMonth()
    const days = getMonthData(year, month)
    const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const activeStart = draftStart || hoverDate
    const activeEnd = draftEnd || hoverDate

    return (
      <div className="grid grid-cols-7 text-center gap-y-1">
        {weekLabels.map((label) => (
          <div key={label} className="text-xs text-slate-500 py-1 font-medium">
            {label}
          </div>
        ))}
        {days.map(({ date, currentMonth }, idx) => {
          const isStart = draftStart ? isSameDay(date, draftStart) : false
          const isEnd = draftEnd ? isSameDay(date, draftEnd) : false
          const inRange = isBetweenDay(date, activeStart, activeEnd)
          const baseClass =
            'h-7 w-7 mx-auto flex items-center justify-center text-xs cursor-pointer transition select-none rounded-full'
          let cls = baseClass
          if (!currentMonth) {
            cls += ' text-slate-300'
          } else if (isStart || isEnd) {
            cls += ' bg-blue-500 text-white hover:bg-blue-600'
          } else if (inRange) {
            cls += ' bg-blue-50 text-blue-700 hover:bg-blue-100'
          } else {
            cls += ' text-slate-700 hover:text-blue-500'
          }
          return (
            <div key={idx} className="py-0.5">
              <div
                className={cls}
                onClick={() => handleDateClick(date)}
                onMouseEnter={() => {
                  if (draftStart && !draftEnd) setHoverDate(date)
                }}
                onMouseLeave={() => setHoverDate(null)}
              >
                {date.getDate()}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const inputClass =
    'px-2 py-1 text-xs border border-slate-300 rounded focus:border-blue-500 focus:outline-none text-slate-700'

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full px-3 py-1.5 text-xs text-left bg-white border border-slate-300 rounded hover:border-blue-500 focus:outline-none focus:border-blue-500 text-slate-900 truncate"
      >
        {start && end ? `${formatDateTime(start)} - ${formatDateTime(end)}` : 'Pick a date range'}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={handleClose}>
          <div className="bg-white rounded shadow-xl w-[680px] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            {/* Top inputs */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
              <input
                type="text"
                value={startDateInput}
                onChange={(e) => {
                  setStartDateInput(e.target.value)
                }}
                onBlur={updateFromInputs}
                placeholder="YYYY-MM-DD"
                className={`${inputClass} flex-1`}
              />
              <div className="relative">
                <input
                  type="text"
                  value={startTimeInput}
                  readOnly
                  onFocus={() => setActiveTimePicker('start')}
                  placeholder="HH:mm:ss"
                  className={`${inputClass} w-24 cursor-pointer`}
                />
                {activeTimePicker === 'start' && (
                  <TimePicker
                    value={startTimeInput}
                    onChange={(v) => setStartTimeInput(v)}
                    onClose={() => {
                      setActiveTimePicker(null)
                      updateFromInputs()
                    }}
                  />
                )}
              </div>
              <span className="text-slate-400 text-xs">›</span>
              <input
                type="text"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                onBlur={updateFromInputs}
                placeholder="YYYY-MM-DD"
                className={`${inputClass} flex-1`}
              />
              <div className="relative">
                <input
                  type="text"
                  value={endTimeInput}
                  readOnly
                  onFocus={() => setActiveTimePicker('end')}
                  placeholder="HH:mm:ss"
                  className={`${inputClass} w-24 cursor-pointer`}
                />
                {activeTimePicker === 'end' && (
                  <TimePicker
                    value={endTimeInput}
                    onChange={(v) => setEndTimeInput(v)}
                    onClose={() => {
                      setActiveTimePicker(null)
                      updateFromInputs()
                    }}
                  />
                )}
              </div>
            </div>

            {/* Calendar panels */}
            <div className="flex px-3 py-3">
              {renderPanel(leftMonth, 'left')}
              <div className="w-px bg-slate-200 mx-2" />
              {renderPanel(rightMonth, 'right')}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-500 text-slate-600 rounded transition"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


interface DataRecord {
  id: string
  mmsi: number
  name: string
  timestamp: number
  lat?: number
  lon?: number
  sog?: number
  cog?: number
  heading?: number
  status?: string
}

export default function DataManager({ onClose, onDataChange }: DataManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Data list states
  const [allData, setAllData] = useState<DataRecord[]>([])
  const [filteredData, setFilteredData] = useState<DataRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterName, setFilterName] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState<Date | null>(null)
  const [filterDateTo, setFilterDateTo] = useState<Date | null>(null)

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Display limit for virtualized list
  const [displayLimit, setDisplayLimit] = useState(500)

  // 后端 API 地址
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 通用数据获取：按时间范围从后端加载
  const parseRawRecords = useCallback((rawData: any[]): DataRecord[] => {
    return rawData
      .map((record: any, idx: number) => {
        let timestamp = 0
        if (record.timestamp_ms) {
          timestamp = Math.floor(record.timestamp_ms / 1000)
        } else if (record.timestamp) {
          timestamp = typeof record.timestamp === 'string'
            ? Math.floor(new Date(record.timestamp).getTime() / 1000)
            : record.timestamp
        } else if (record.time) {
          timestamp = typeof record.time === 'string'
            ? Math.floor(new Date(record.time).getTime() / 1000)
            : record.time
        }

        return {
          id: `${record.mmsi}_${idx}`,
          mmsi: record.mmsi,
          name: record.name || `Vessel ${record.mmsi}`,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          lat: record.lat,
          lon: record.lon,
          sog: record.sog,
          cog: record.cog,
          heading: record.heading,
          status: record.status,
        }
      })
      .filter((record: DataRecord) => record.timestamp > 0)
  }, [])

  const fetchRecords = useCallback(async (start: number, end: number): Promise<DataRecord[]> => {
    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE}/tracks?start_time=${start}&end_time=${end}&page_size=100000&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      const data = await response.json()

      if (data.data && Array.isArray(data.data)) {
        return parseRawRecords(data.data)
      }
      return []
    } catch (err) {
      console.error('Failed to fetch records:', err)
      showMessage('error', 'Failed to fetch records')
      return []
    } finally {
      setLoading(false)
    }
  }, [API_BASE, parseRawRecords])

  const fetchByMmsi = useCallback(async (mmsi: string) => {
    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE}/tracks?mmsi=${encodeURIComponent(mmsi)}&page_size=100000&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      const data = await response.json()

      if (data.data && Array.isArray(data.data)) {
        const records = parseRawRecords(data.data)
        setAllData(records)
        setFilteredData(records)
      }
    } catch (err) {
      console.error('Failed to fetch by MMSI:', err)
      showMessage('error', 'Failed to fetch by MMSI')
    } finally {
      setLoading(false)
    }
  }, [API_BASE, parseRawRecords])

  // 名字筛选（时间范围已在后端过滤）
  const applyNameFilter = useCallback((data: DataRecord[], name: string) => {
    if (!name) {
      setFilteredData(data)
      return
    }
    const filtered = data.filter(record => {
      const nameMatch =
        record.mmsi.toString().includes(name) ||
        record.name.toLowerCase().includes(name.toLowerCase())
      return nameMatch
    })
    setFilteredData(filtered)
  }, [])

  // Toggle record selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredData.map(r => r.id)))
    }
  }

  // 根据时间范围或 MMSI 查询后端数据
  useEffect(() => {
    const timer = setTimeout(() => {
      const hasName = filterName.trim().length > 0
      const hasDate = filterDateFrom || filterDateTo

      if (!hasName && !hasDate) {
        setAllData([])
        setFilteredData([])
        return
      }

      if (hasDate) {
        const start = filterDateFrom
          ? Math.floor(filterDateFrom.getTime() / 1000)
          : 0
        const end = filterDateTo
          ? Math.floor(filterDateTo.getTime() / 1000)
          : Math.floor(Date.now() / 1000)
        fetchRecords(start, end).then(records => {
          setAllData(records)
          applyNameFilter(records, filterName)
        })
      } else if (hasName) {
        fetchByMmsi(filterName)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [filterName, filterDateFrom, filterDateTo, fetchRecords, fetchByMmsi, applyNameFilter])

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    if (!file) return

    setUploading(true)
    try {
      // 验证文件类型
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.gz')) {
        showMessage('error', 'Please select a CSV or GZ file')
        setUploading(false)
        return
      }

      // 显示上传中的提示（显示文件大小）
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2)
      showMessage('info', `Uploading ${file.name} (${fileSizeMB}MB)...`)

      // 读取文件内容
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result
          if (typeof content === 'string') {
            resolve(content)
          } else {
            reject(new Error('Failed to read file'))
          }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsText(file)
      })

      console.log('[Upload] File content size:', fileContent.length, 'bytes')
      console.log('[Upload] Starting upload to:', `${API_BASE}/upload`)

      // 用 JSON 格式上传
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: fileContent }),
      })

      console.log('[Upload] Response status:', response.status)

      // 首先尝试解析响应
      let data: any
      try {
        const text = await response.text()
        console.log('[Upload] Response text:', text)
        data = text ? JSON.parse(text) : {}
      } catch (parseErr) {
        console.error('[Upload] Failed to parse response:', parseErr)
        data = {}
      }

      if (!response.ok) {
        const errorMsg = data.error || data.message || `HTTP ${response.status}`
        console.error('[Upload] Error:', errorMsg)
        showMessage('error', `✗ Upload failed: ${errorMsg}`)
        return
      }

      // 上传成功提示
      const recordCount = data.recordCount || data.count || 0
      showMessage('success', `✓ Successfully uploaded ${recordCount} records. Building data cache...`)

      // 等待后端构建完成（大文件需要更长时间）
      const fileSizeGB = file.size / (1024 * 1024 * 1024)
      const waitTime = Math.max(2000, Math.min(15000, fileSizeGB * 3000)) // 2-15 秒
      console.log('[Upload] Waiting', waitTime, 'ms for build to complete...')
      await new Promise(resolve => setTimeout(resolve, waitTime))

      // 重新加载当前时间范围的数据
      const start = filterDateFrom
        ? Math.floor(filterDateFrom.getTime() / 1000)
        : 0
      const end = filterDateTo
        ? Math.floor(filterDateTo.getTime() / 1000)
        : Math.floor(Date.now() / 1000)
      const refreshRecords = await fetchRecords(start, end)
      setAllData(refreshRecords)
      applyNameFilter(refreshRecords, filterName)
      showMessage('success', `✓ Loaded ${refreshRecords.length} records from cache`)

      // 通知外部数据已变更
      onDataChange?.()
    } catch (err) {
      showMessage('error', `✗ Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
      // 重置 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteInitiate = () => {
    if (selectedIds.size === 0) {
      showMessage('error', 'Select records to delete')
      return
    }
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedIds.size === 0) {
      showMessage('error', 'No records selected')
      return
    }

    setLoading(true)
    try {
      // Get MMSI and timestamps from selected records
      const toDelete = Array.from(selectedIds)
        .map(id => allData.find(r => r.id === id))
        .filter(Boolean) as DataRecord[]

      const deletePayload = toDelete.map(record => ({
        mmsi: record.mmsi,
        timestamp_ms: record.timestamp * 1000,
      }))

      const response = await fetch(`${API_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: deletePayload,
          dry_run: false,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        showMessage('error', `Error: ${data.error}`)
        return
      }

      showMessage('success', `Deleted ${selectedIds.size} record(s)`)
      setSelectedIds(new Set())
      setShowDeleteModal(false)

      // 重置筛选条件并清空表格
      setFilterName('')
      setFilterDateFrom(null)
      setFilterDateTo(null)
      setAllData([])
      setFilteredData([])

      // 通知外部数据已变更
      onDataChange?.()
    } catch (err) {
      showMessage('error', `Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteModal(false)
  }

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800">Data Manager</h2>
              <p className="text-xs text-slate-500 mt-1">
                Active: <span className="text-blue-600 font-medium">{filteredData.length}</span> records
                {filterName && allData.length > 0 && (
                  <span className="text-slate-400 ml-1">/ {allData.length} total</span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex flex-col px-5">
          {/* Message Alert */}
          {message && (
            <div
              className={`mt-3 p-2 rounded text-xs ${
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
          <div className="py-3 border-b border-slate-200">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.gz"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  handleFileUpload(file)
                }
              }}
              className="hidden"
            />
            <Button
              variant="outlined"
              component="label"
              startIcon={<Upload />}
              disabled={uploading}
              fullWidth
              sx={{
                textTransform: 'none',
                fontSize: '0.875rem',
                color: 'inherit',
                borderColor: '#cbd5e1',
                '&:hover': {
                  borderColor: '#3b82f6',
                  backgroundColor: '#f0f9ff',
                },
              }}
            >
              {uploading ? 'Uploading...' : 'Upload CSV'}
              <input
                hidden
                accept=".csv,.gz"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(file)
                  }
                }}
              />
            </Button>
          </div>

          {/* Filter Section */}
          <div className="py-3 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Filter</p>

            {/* Search */}
            <div className="mb-2.5">
              <label className="text-xs text-slate-600 block mb-1">Vessel Name / MMSI</label>
              <input
                type="text"
                placeholder="Search..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-blue-500 focus:outline-none text-slate-900 placeholder-slate-400"
              />
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <DateTimeRangePicker
                start={filterDateFrom}
                end={filterDateTo}
                onChange={({ start, end }) => {
                  setFilterDateFrom(start)
                  setFilterDateTo(end)
                }}
              />
            </div>
          </div>

          {/* Data List - Only show when filter is applied */}
          {(filterName || filterDateFrom || filterDateTo) && (
            <div className="py-3 border-b border-slate-200 flex-1 min-h-0 flex flex-col">
              {/* Summary Row */}
              <div className="flex items-center justify-between mb-2.5 pb-2.5 border-b border-slate-200">
                <p className="text-xs text-slate-600">
                  <span>{filteredData.length}</span> records
                  <span className="text-blue-600 font-medium">
                    {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
                  </span>
                </p>
                {filteredData.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredData.length && filteredData.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4"
                    />
                    <span className="text-xs text-slate-600 hover:text-slate-800">Select all</span>
                  </label>
                )}
              </div>

              {/* Data Table - Virtualized with configurable limit */}
              <div className="overflow-y-auto flex-1 space-y-1">
                {filteredData.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 py-8">No records found</div>
                ) : (
                  filteredData.slice(0, displayLimit).map((record) => (
                    <div
                      key={record.id}
                      onClick={() => toggleSelect(record.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border-l-4 transition ${
                        selectedIds.has(record.id)
                          ? 'bg-blue-50 border-blue-500'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(record.id)}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleSelect(record.id)
                        }}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{record.name}</p>
                        <p className="text-xs text-slate-500">MMSI: {record.mmsi}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-slate-500">
                          {new Date(record.timestamp * 1000).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {filteredData.length > displayLimit && (
                  <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded">
                    <p className="text-xs text-amber-700">
                      Showing {displayLimit} of {filteredData.length} records
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDisplayLimit(displayLimit + 500)}
                        className="flex-1 px-2 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition"
                      >
                        Load More (+500)
                      </button>
                      <button
                        onClick={() => setDisplayLimit(filteredData.length)}
                        className="flex-1 px-2 py-1.5 text-xs bg-slate-400 hover:bg-slate-500 text-white rounded transition"
                      >
                        Show All
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {!(filterName || filterDateFrom || filterDateTo) && (
            <div className="py-8 text-center text-xs text-slate-500">
              <p>Apply a filter to view records</p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex-shrink-0">
          {selectedIds.size > 0 ? (
            <button
              onClick={handleDeleteInitiate}
              disabled={loading}
              className="w-full px-3 py-2.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition border border-red-600 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
              Delete Selected ({selectedIds.size})
            </button>
          ) : (
            <button
              disabled
              className="w-full px-3 py-2.5 text-xs text-slate-500 text-center bg-slate-100 rounded-lg border border-slate-300 cursor-default"
            >
              Select records to delete
            </button>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
            <div className="bg-white border border-slate-300 rounded-lg shadow-2xl w-[90%] max-w-sm p-6">
              {/* Modal Header */}
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-semibold text-slate-900">
                  Confirm Deletion
                </h3>
              </div>

              {/* Modal Body */}
              <div className="mb-6 space-y-3">
                <p className="text-sm text-slate-700">
                  You are about to delete <span className="font-semibold text-red-600">{selectedIds.size}</span> record(s).
                </p>
                <p className="text-sm text-slate-600">
                  This action <span className="font-semibold text-red-600">cannot be undone</span>.
                </p>
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCancel}
                  className="flex-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}
