'use client' // Force next.js to recognize file

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, Filter, Sun, Moon, Calendar, Clock, Download, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { formatMemberId } from '@/types'
import { fetchAttendanceLogsAction } from './actions'
import { toast } from 'react-hot-toast'

interface AttendanceLog {
  id: string
  member_id: string
  gym_id: string
  date: string
  created_at: string
  check_out_time: string | null
  session: 'morning' | 'evening'
  members: {
    id: string
    name: string
    member_number: number
    phone: string
  } | null
}

interface Props {
  initialLogs: any[]
  gymId: string
}

function calculateDuration(checkIn: string | null, checkOut: string | null) {
  if (!checkIn || !checkOut) return '—'
  const inTime = new Date(checkIn)
  const outTime = new Date(checkOut)
  if (isNaN(inTime.getTime()) || isNaN(outTime.getTime())) return '—'
  
  const diffMs = outTime.getTime() - inTime.getTime()
  if (diffMs < 0) return '—'
  
  const hrs = Math.floor(diffMs / 3600000)
  const mins = Math.floor((diffMs % 3600000) / 60000)
  
  if (hrs > 0) {
    return `${hrs}h ${mins}m`
  }
  return `${mins}m`
}

function formatTimeOnly(dateString: string | null) {
  if (!dateString) return '—'
  try {
    const d = new Date(dateString)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch (e) {
    return '—'
  }
}

export function AttendanceLogClient({ initialLogs, gymId }: Props) {
  const router = useRouter()
  const [logs, setLogs] = useState<AttendanceLog[]>(initialLogs)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Filters
  // Filters
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all' | 'custom'>('7days')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  
  const [timeFilterStart, setTimeFilterStart] = useState('')
  const [timeFilterEnd, setTimeFilterEnd] = useState('')

  useEffect(() => {
    // Avoid fetching if it's the exact same as initial load
    if (dateRange === '7days') {
      setLogs(initialLogs)
      return
    }

    async function loadFilteredData() {
      setLoading(true)
      let startDate: string | null = null
      let endDate: string | null = null // Current day is max usually

      const today = new Date()
      if (dateRange === 'today') {
        startDate = today.toISOString().split('T')[0]
      } else if (dateRange === '7days') {
        const d = new Date(today)
        d.setDate(d.getDate() - 7)
        startDate = d.toISOString().split('T')[0]
      } else if (dateRange === '30days') {
        const d = new Date(today)
        d.setDate(d.getDate() - 30)
        startDate = d.toISOString().split('T')[0]
      } else if (dateRange === 'custom') {
        if (!customStart && !customEnd) {
          setLoading(false)
          return // wait for user to input something
        }
        if (customStart) startDate = customStart
        if (customEnd) endDate = customEnd
      }

      const res = await fetchAttendanceLogsAction(gymId, startDate, endDate, 'all')
      if (res.success && res.data) {
        setLogs(res.data as any)
      } else {
        toast.error(res.error || 'Failed to load logs')
      }
      setLoading(false)
    }

    loadFilteredData()
  }, [dateRange, gymId, initialLogs, customStart, customEnd])

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search logic
      const q = search.toLowerCase()
      let matchesSearch = true
      if (q) {
        const mem = log.members
        if (!mem) matchesSearch = false
        else {
          const memberNumStr = mem.member_number ? formatMemberId(mem.member_number).toLowerCase() : ''
          matchesSearch = mem.name.toLowerCase().includes(q) || 
                          mem.phone.includes(q) || 
                          memberNumStr.includes(q)
        }
      }
      if (!matchesSearch) return false

      // Time filter logic
      if (timeFilterStart || timeFilterEnd) {
        if (!log.created_at) return false
        
        const dateObj = new Date(log.created_at)
        const hours = dateObj.getHours().toString().padStart(2, '0')
        const mins = dateObj.getMinutes().toString().padStart(2, '0')
        const logTimeStr = `${hours}:${mins}`

        if (timeFilterStart && logTimeStr < timeFilterStart) return false
        if (timeFilterEnd && logTimeStr > timeFilterEnd) return false
      }

      return true
    })
  }, [logs, search, timeFilterStart, timeFilterEnd])

  // Group logs by date for cleaner UI
  const groupedLogs = useMemo(() => {
    const groups: Record<string, AttendanceLog[]> = {}
    filteredLogs.forEach(log => {
      if (!groups[log.date]) {
        groups[log.date] = []
      }
      groups[log.date].push(log)
    })
    
    // Sort dates descending
    return Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).map(date => ({
      date,
      logs: groups[date]
    }))
  }, [filteredLogs])

  const exportToExcel = async () => {
    try {
      setLoading(true)
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Attendance Log')
      
      sheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Member Name', key: 'name', width: 25 },
        { header: 'Member ID', key: 'member_id', width: 15 },
        { header: 'Session', key: 'session', width: 12 },
        { header: 'Check In', key: 'check_in', width: 15 },
        { header: 'Check Out', key: 'check_out', width: 15 },
        { header: 'Duration', key: 'duration', width: 15 },
      ]

      // Add rows
      filteredLogs.forEach(log => {
        sheet.addRow({
          date: formatDate(log.date),
          name: log.members?.name || 'Deleted Member',
          member_id: log.members?.member_number ? formatMemberId(log.members.member_number) : '',
          session: log.session === 'morning' ? 'Morning' : 'Evening',
          check_in: formatTimeOnly(log.created_at),
          check_out: formatTimeOnly(log.check_out_time),
          duration: calculateDuration(log.created_at, log.check_out_time)
        })
      })

      // Style header
      sheet.getRow(1).font = { bold: true }
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_log_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success('Exported to Excel')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/owner/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Members
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Attendance Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={exportToExcel}
            disabled={loading || filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card p-3 md:p-4 flex flex-wrap gap-4 items-center w-full">
        <div className="flex flex-wrap items-center gap-3 w-full">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="search" 
              placeholder="Search member..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          
          {/* Date Range */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'today', label: 'Today' },
                { id: '7days', label: '7 Days' },
                { id: '30days', label: '30 Days' },
                { id: 'all', label: 'All Time' },
                { id: 'custom', label: 'Custom' }
              ].map(range => (
                <button
                  key={range.id}
                  onClick={() => setDateRange(range.id as any)}
                  className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap rounded-lg transition-all ${
                    dateRange === range.id 
                      ? 'bg-white text-slate-900 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>

            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <div className="flex items-center gap-1.5 px-2">
                  <span className="text-xs font-semibold text-slate-500">From:</span>
                  <input 
                    type="datetime-local" 
                    step="60"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="w-px h-4 bg-slate-200"></div>
                <div className="flex items-center gap-1.5 px-2">
                  <span className="text-xs font-semibold text-slate-500">To:</span>
                  <input 
                    type="datetime-local" 
                    step="60"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Time Filter */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <div className="flex items-center gap-1.5 px-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="time" 
                  value={timeFilterStart}
                  onChange={e => setTimeFilterStart(e.target.value)}
                  className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none w-20"
                />
              </div>
              <div className="w-px h-4 bg-slate-200"></div>
              <div className="flex items-center gap-1.5 px-2">
                <input 
                  type="time" 
                  value={timeFilterEnd}
                  onChange={e => setTimeFilterEnd(e.target.value)}
                  className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none w-20"
                />
              </div>
            </div>
          </div>

      </div>

      {/* Logs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Member</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Session</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Check In</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Check Out</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse bg-white">
                    <td className="px-5 py-4"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                    <td className="px-5 py-4"><div className="h-4 w-32 bg-slate-100 rounded mb-1.5"></div><div className="h-3 w-16 bg-slate-50 rounded"></div></td>
                    <td className="px-5 py-4"><div className="h-6 w-20 bg-slate-100 rounded-full"></div></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 bg-slate-100 rounded"></div></td>
                    <td className="px-5 py-4"><div className="h-4 w-20 bg-slate-100 rounded"></div></td>
                    <td className="px-5 py-4"><div className="h-4 w-16 bg-slate-100 rounded"></div></td>
                  </tr>
                ))
              ) : groupedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No attendance records found</h3>
                    <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or search query.</p>
                  </td>
                </tr>
              ) : (
                groupedLogs.map((group) => (
                  group.logs.map((log, idx) => {
                    const mem = log.members
                    const isFirstInGroup = idx === 0
                    
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors border-t border-slate-100">
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-900">{formatDate(log.date)}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {mem ? (
                            <div className="flex flex-col">
                              <Link href={`/owner/members/${mem.id}`} className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                                {mem.name}
                              </Link>
                              <span className="text-xs text-slate-400 font-mono">
                                {mem.member_number ? formatMemberId(mem.member_number) : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Deleted Member</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {log.session === 'morning' ? (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full w-fit border border-amber-200/50">
                              <Sun className="w-3.5 h-3.5" /> Morning
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full w-fit border border-indigo-200/50">
                              <Moon className="w-3.5 h-3.5" /> Evening
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="font-medium text-slate-700">{formatTimeOnly(log.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${log.check_out_time ? 'bg-red-400' : 'bg-slate-200'}`} />
                            <span className={`font-medium ${log.check_out_time ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                              {formatTimeOnly(log.check_out_time)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Clock className="w-4 h-4 text-slate-400" />
                            {log.check_out_time ? (
                              <span className="font-medium">{calculateDuration(log.created_at, log.check_out_time)}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
