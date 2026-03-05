import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getScrapeJobs, createScrapeJob } from '../lib/api'
import type { ScrapeJob } from '../types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/ui/table'
import { Dialog } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { useToast } from '../components/ui/toast'

type BadgeVariant = 'warning' | 'blue' | 'success' | 'error' | 'default'

const statusVariant = (status: ScrapeJob['status']): BadgeVariant => {
  const map: Record<ScrapeJob['status'], BadgeVariant> = {
    PENDING: 'warning',
    RUNNING: 'blue',
    COMPLETE: 'success',
    FAILED: 'error',
  }
  return map[status] ?? 'default'
}

export const ScrapeJobsPage: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [jobs, setJobs] = useState<ScrapeJob[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')

  const fetchJobs = useCallback(async () => {
    try {
      const res = await getScrapeJobs()
      setJobs(res.data.jobs)
    } catch {
      showToast('Failed to load scrape jobs', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await createScrapeJob(query, location)
      showToast('Scrape job created', 'success')
      setDialogOpen(false)
      setQuery('')
      setLocation('')
      fetchJobs()
    } catch {
      showToast('Failed to create scrape job', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Scrape Jobs</h1>
          <p className="text-gray-400 text-sm mt-1">Manage and monitor lead scraping jobs</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          + New Scrape Job
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-8 w-8 mr-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">🔍</div>
              <p>No scrape jobs yet. Create one to get started!</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>Query</TableHeader>
                  <TableHeader>Location</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Leads</TableHeader>
                  <TableHeader>Created</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow
                    key={job.id}
                    onClick={() => navigate(`/leads?job_id=${job.id}`)}
                  >
                    <TableCell className="font-mono text-gray-400">#{job.id}</TableCell>
                    <TableCell className="font-medium text-gray-200">{job.query}</TableCell>
                    <TableCell>{job.location}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)} animate={job.status === 'RUNNING'}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-indigo-400 font-medium">{job.lead_count}</span>
                    </TableCell>
                    <TableCell className="text-gray-400 text-xs">
                      {new Date(job.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="New Scrape Job">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Search Query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "restaurants", "plumbers"'
            required
          />
          <Input
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder='e.g. "New York, NY"'
            required
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={creating} className="flex-1">
              Create Job
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
