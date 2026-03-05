import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table'
import { getLeads, excludeLead, sendSMS, buildLeads } from '../lib/api'
import type { Lead } from '../types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Select } from '../components/ui/select'
import { Dialog } from '../components/ui/dialog'
import { useToast } from '../components/ui/toast'

type BadgeVariant = 'success' | 'error' | 'default' | 'outline' | 'warning' | 'blue' | 'purple'

const intentVariant = (intent: Lead['intent']): BadgeVariant => {
  if (intent === 'POSITIVE') return 'success'
  if (intent === 'NEGATIVE') return 'error'
  if (intent === 'NEUTRAL') return 'default'
  return 'outline'
}

const buildVariant = (status: Lead['build_status']): BadgeVariant => {
  const map: Record<NonNullable<Lead['build_status']>, BadgeVariant> = {
    QUEUED: 'warning',
    BUILDING: 'blue',
    COMPLETE: 'success',
    FAILED: 'error',
  }
  return status ? map[status] : 'outline'
}

const stageVariant = (stage: Lead['pipeline_stage']): BadgeVariant => {
  const map: Record<string, BadgeVariant> = {
    NEW: 'default',
    CONTACTED: 'blue',
    REPLIED: 'purple',
    BUILDING: 'warning',
    DEPLOYED: 'success',
    FOLLOWUP_SENT: 'blue',
    INVOICED: 'purple',
    WON: 'success',
    LOST: 'error',
  }
  return stage ? (map[stage] ?? 'default') : 'default'
}

export const LeadsPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [intentFilter, setIntentFilter] = useState('ALL')
  const [buildFilter, setBuildFilter] = useState('ALL')
  const [stageFilter, setStageFilter] = useState('ALL')
  const [showExcluded, setShowExcluded] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const jobId = searchParams.get('job_id')

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = {}
      if (jobId) params.job_id = parseInt(jobId)
      if (intentFilter !== 'ALL') params.intent = intentFilter
      if (buildFilter !== 'ALL') params.build_status = buildFilter
      if (stageFilter !== 'ALL') params.pipeline_stage = stageFilter
      if (!showExcluded) params.excluded = false
      const res = await getLeads(params)
      setLeads(res.data.leads)
    } catch {
      showToast('Failed to load leads', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId, intentFilter, buildFilter, stageFilter, showExcluded, showToast])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map((k) => leads[parseInt(k)]?.id)
    .filter((id): id is number => id !== undefined)

  const handleSendSMS = async () => {
    if (!selectedIds.length) return
    setActionLoading(true)
    try {
      const res = await sendSMS(selectedIds)
      showToast(`SMS sent to ${res.data.sent} leads`, 'success')
      setRowSelection({})
      fetchLeads()
    } catch {
      showToast('Failed to send SMS', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleExclude = async () => {
    if (!selectedIds.length) return
    setActionLoading(true)
    try {
      await Promise.all(selectedIds.map((id) => excludeLead(id, true)))
      showToast(`Excluded ${selectedIds.length} leads`, 'success')
      setRowSelection({})
      fetchLeads()
    } catch {
      showToast('Failed to exclude leads', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBuild = async () => {
    if (!selectedIds.length) return
    setActionLoading(true)
    try {
      const res = await buildLeads(selectedIds)
      showToast(`Queued ${res.data.queued} builds`, 'success')
      setRowSelection({})
      fetchLeads()
    } catch {
      showToast('Failed to queue builds', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleExclude = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await excludeLead(lead.id, !lead.excluded)
      showToast(lead.excluded ? 'Lead included' : 'Lead excluded', 'success')
      fetchLeads()
    } catch {
      showToast('Failed to update lead', 'error')
    }
  }

  const columns: ColumnDef<Lead>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-indigo-600"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-indigo-600"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'business_name',
      header: 'Business Name',
      cell: ({ row }) => (
        <span className={`font-medium ${row.original.excluded ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {row.original.business_name}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ?? <span className="text-gray-600">—</span>
      },
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ?? <span className="text-gray-600">—</span>
      },
    },
    {
      accessorKey: 'rating',
      header: 'Rating',
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return v ? <span className="text-yellow-400">★ {v}</span> : <span className="text-gray-600">—</span>
      },
    },
    {
      accessorKey: 'sms_sent',
      header: 'SMS',
      cell: ({ getValue }) => (
        <Badge variant={getValue() ? 'success' : 'outline'}>
          {getValue() ? 'Sent' : 'Pending'}
        </Badge>
      ),
    },
    {
      accessorKey: 'intent',
      header: 'Intent',
      cell: ({ getValue }) => {
        const v = getValue() as Lead['intent']
        return v ? <Badge variant={intentVariant(v)}>{v}</Badge> : <span className="text-gray-600">—</span>
      },
    },
    {
      accessorKey: 'build_status',
      header: 'Build',
      cell: ({ getValue }) => {
        const v = getValue() as Lead['build_status']
        return v ? (
          <Badge variant={buildVariant(v)} animate={v === 'BUILDING'}>
            {v}
          </Badge>
        ) : (
          <span className="text-gray-600">—</span>
        )
      },
    },
    {
      accessorKey: 'pipeline_stage',
      header: 'Stage',
      cell: ({ getValue }) => {
        const v = getValue() as Lead['pipeline_stage']
        return v ? <Badge variant={stageVariant(v)}>{v}</Badge> : <span className="text-gray-600">—</span>
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSelectedLead(row.original)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View
          </button>
          <button
            onClick={(e) => handleToggleExclude(row.original, e)}
            className={`text-xs transition-colors ${
              row.original.excluded
                ? 'text-green-400 hover:text-green-300'
                : 'text-red-400 hover:text-red-300'
            }`}
          >
            {row.original.excluded ? 'Include' : 'Exclude'}
          </button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: leads,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Leads</h1>
          <p className="text-gray-400 text-sm mt-1">
            {jobId ? `Filtered by Job #${jobId} · ` : ''}{leads.length} total leads
          </p>
        </div>
        {jobId && (
          <Button variant="outline" size="sm" onClick={() => navigate('/leads')}>
            Clear Filter
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value)}
          options={[
            { value: 'ALL', label: 'All Intent' },
            { value: 'POSITIVE', label: 'Positive' },
            { value: 'NEGATIVE', label: 'Negative' },
            { value: 'NEUTRAL', label: 'Neutral' },
          ]}
        />
        <Select
          value={buildFilter}
          onChange={(e) => setBuildFilter(e.target.value)}
          options={[
            { value: 'ALL', label: 'All Build Status' },
            { value: 'QUEUED', label: 'Queued' },
            { value: 'BUILDING', label: 'Building' },
            { value: 'COMPLETE', label: 'Complete' },
            { value: 'FAILED', label: 'Failed' },
          ]}
        />
        <Select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          options={[
            { value: 'ALL', label: 'All Stages' },
            { value: 'NEW', label: 'New' },
            { value: 'CONTACTED', label: 'Contacted' },
            { value: 'REPLIED', label: 'Replied' },
            { value: 'BUILDING', label: 'Building' },
            { value: 'DEPLOYED', label: 'Deployed' },
            { value: 'FOLLOWUP_SENT', label: 'Follow-up Sent' },
            { value: 'INVOICED', label: 'Invoiced' },
            { value: 'WON', label: 'Won' },
            { value: 'LOST', label: 'Lost' },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showExcluded}
            onChange={(e) => setShowExcluded(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600"
          />
          Show Excluded
        </label>
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-indigo-900/20 border border-indigo-800 rounded-lg">
          <span className="text-sm text-indigo-300 font-medium">{selectedIds.length} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" onClick={handleSendSMS} loading={actionLoading}>
              📱 Send SMS
            </Button>
            <Button size="sm" variant="outline" onClick={handleBuild} loading={actionLoading}>
              🏗️ Build
            </Button>
            <Button size="sm" variant="destructive" onClick={handleExclude} loading={actionLoading}>
              🚫 Exclude
            </Button>
          </div>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-800">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="px-4 py-3 font-medium">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-16 text-gray-400">
                      No leads found matching your filters.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedLead(row.original)}
                      className={`text-gray-300 hover:bg-gray-800/50 transition-colors cursor-pointer ${
                        row.original.excluded ? 'opacity-50' : ''
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Lead Detail Dialog */}
      {selectedLead && (
        <Dialog
          open={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={selectedLead.business_name}
          className="max-w-lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Phone', value: selectedLead.phone },
                { label: 'Category', value: selectedLead.category },
                { label: 'Rating', value: selectedLead.rating ? `★ ${selectedLead.rating}` : null },
                { label: 'Intent', value: selectedLead.intent },
                { label: 'Build Status', value: selectedLead.build_status },
                { label: 'Stage', value: selectedLead.pipeline_stage },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-sm text-gray-200">{value ?? '—'}</p>
                </div>
              ))}
            </div>
            {selectedLead.site_url && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Site URL</p>
                <a href={selectedLead.site_url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:underline break-all">
                  {selectedLead.site_url}
                </a>
              </div>
            )}
            {selectedLead.reply_text && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Reply</p>
                <p className="text-sm text-gray-300 bg-gray-800 rounded-lg p-3">{selectedLead.reply_text}</p>
              </div>
            )}
            {selectedLead.build_log && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Build Log</p>
                <pre className="text-xs text-gray-300 bg-gray-800 rounded-lg p-3 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                  {selectedLead.build_log}
                </pre>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
