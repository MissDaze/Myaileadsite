import React, { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import type { CampaignSummary, Contact } from '../types'
import {
  approveCampaign, createCampaign, generateCampaign, getCampaigns,
  getContacts, getGoogleOAuthUrl, getMultichannelStatus, importContacts,
} from '../lib/api'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { useToast } from '../components/ui/toast'

type ProviderStatus = {
  google_oauth_available: boolean
  microsoft_oauth_available: boolean
  sms_available: boolean
  connections: Array<{ provider: string; provider_email?: string; status: string }>
}

export const MultichannelPage: React.FC = () => {
  const { showToast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('EMAIL_ONLY')
  const [sequence, setSequence] = useState('EMAIL_THEN_SMS')
  const [brief, setBrief] = useState('')
  const [tone, setTone] = useState('PROFESSIONAL')

  const refresh = useCallback(async () => {
    const [contactResult, campaignResult, statusResult] = await Promise.all([
      getContacts(), getCampaigns(), getMultichannelStatus(),
    ])
    setContacts(Array.isArray(contactResult.data.contacts) ? contactResult.data.contacts : [])
    setCampaigns(Array.isArray(campaignResult.data.campaigns) ? campaignResult.data.campaigns : [])
    setStatus(statusResult.data as ProviderStatus)
  }, [])

  useEffect(() => {
    refresh().catch(() => showToast('Failed to load multichannel outreach', 'error'))
  }, [refresh, showToast])

  const handleFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('The workbook has no readable sheet')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!rows.length) throw new Error('No contact rows were found')
      const result = await importContacts(rows, file.name, file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'EXCEL')
      const summary = result.data as { imported: number; duplicates: number; rejected: number }
      showToast(`Imported ${summary.imported}; duplicates ${summary.duplicates}; rejected ${summary.rejected}`, 'success')
      await refresh()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Import failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const connectGoogle = async () => {
    try {
      const result = await getGoogleOAuthUrl()
      window.location.href = result.data.url
    } catch {
      showToast('Google OAuth needs platform credentials configured first', 'error')
    }
  }

  const submitCampaign = async (event: React.FormEvent) => {
    event.preventDefault()
    const contact_ids = Object.entries(selected).filter(([, value]) => value).map(([id]) => id)
    if (!contact_ids.length) {
      showToast('Select at least one contact', 'error')
      return
    }
    setBusy(true)
    try {
      await createCampaign({ name, channel, sequence, brief, tone, contact_ids })
      setName('')
      setBrief('')
      setSelected({})
      showToast('Campaign created as a draft', 'success')
      await refresh()
    } catch {
      showToast('Campaign could not be created', 'error')
    } finally {
      setBusy(false)
    }
  }

  const campaignAction = async (id: string, action: 'generate' | 'approve') => {
    setBusy(true)
    try {
      if (action === 'generate') await generateCampaign(id)
      else await approveCampaign(id)
      showToast(action === 'generate' ? 'Messages generated for review' : 'Campaign approved', 'success')
      await refresh()
    } catch {
      showToast(action === 'generate' ? 'Message generation failed' : 'Approval failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const google = status?.connections.find((item) => item.provider === 'google' && item.status === 'CONNECTED')
  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Multichannel Outreach</h1>
        <p className="text-gray-400 text-sm mt-1">Import contacts and create approved email, SMS or combined campaigns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Google connection</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400 mb-4">
              {google ? `Connected as ${google.provider_email || 'Google account'}` :
                status?.google_oauth_available ? 'Connect each customer’s own Google account.' :
                'OAuth-ready. Platform credentials must be configured before customers can connect.'}
            </p>
            <Button onClick={connectGoogle} disabled={!status?.google_oauth_available}>
              {google ? 'Reconnect Google' : 'Connect Google'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>SMS provider</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400">
              {status?.sms_available ? 'TextMagic is configured and available.' : 'TextMagic credentials are not configured. SMS sending remains disabled.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Microsoft 365</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400">
              {status?.microsoft_oauth_available ? 'Platform credentials detected; connection UI is coming next.' : 'Provider slot is ready for Microsoft OAuth credentials.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Import contacts</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={busy}
            onChange={(event) => handleFile(event.target.files?.[0])}
            className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white"
          />
          <p className="text-xs text-gray-500">
            CSV and Excel are imported directly. Columns such as company, contact name, title, email, phone and website are detected automatically. Google Sheets and Docs become available after Google is connected.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contacts ({contacts.length}) · Selected {selectedCount}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Import a CSV or Excel file to add contacts.</div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900 text-gray-400">
                  <tr>
                    <th className="p-3 text-left">Select</th><th className="p-3 text-left">Contact</th>
                    <th className="p-3 text-left">Company</th><th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="text-gray-300">
                      <td className="p-3"><input type="checkbox" checked={Boolean(selected[contact.id])} onChange={(e) => setSelected((old) => ({ ...old, [contact.id]: e.target.checked }))} /></td>
                      <td className="p-3">{[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.job_title || '—'}</td>
                      <td className="p-3 font-medium">{contact.company}</td>
                      <td className="p-3">{contact.email || '—'} {contact.email_valid && <span className="text-green-400">✓</span>}</td>
                      <td className="p-3">{contact.phone || '—'} {contact.phone_valid && <span className="text-green-400">✓</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Create campaign</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submitCampaign} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} options={[
              { value: 'EMAIL_ONLY', label: 'Email only' },
              { value: 'SMS_ONLY', label: 'SMS only' },
              { value: 'BOTH', label: 'Email + SMS' },
            ]} />
            <Select value={sequence} onChange={(e) => setSequence(e.target.value)} options={[
              { value: 'EMAIL_THEN_SMS', label: 'Email first, SMS follow-up' },
              { value: 'SMS_THEN_EMAIL', label: 'SMS first, email follow-up' },
              { value: 'SIMULTANEOUS', label: 'Send both together' },
              { value: 'EMAIL_FALLBACK_SMS', label: 'Email, otherwise SMS' },
            ]} />
            <Select value={tone} onChange={(e) => setTone(e.target.value)} options={[
              { value: 'PROFESSIONAL', label: 'Professional' },
              { value: 'FRIENDLY', label: 'Friendly' },
              { value: 'DIRECT', label: 'Direct' },
              { value: 'CONSULTATIVE', label: 'Consultative' },
            ]} />
            <label className="md:col-span-2 text-sm text-gray-300">
              Campaign brief
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} required rows={4} className="mt-1 w-full rounded-md bg-gray-800 border border-gray-700 p-3 text-gray-100" placeholder="Explain the offer, audience and desired call to action." />
            </label>
            <div className="md:col-span-2"><Button type="submit" loading={busy}>Create draft for {selectedCount} contacts</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Campaigns</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {campaigns.length === 0 ? <p className="text-gray-400">No campaigns yet.</p> : campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-lg border border-gray-800 p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <p className="font-medium text-gray-100">{campaign.name}</p>
                <p className="text-xs text-gray-400">{campaign.channel.replaceAll('_', ' ')} · {campaign.sequence.replaceAll('_', ' ')} · {campaign._count?.contacts ?? 0} contacts · {campaign.status}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => campaignAction(campaign.id, 'generate')}>Generate drafts</Button>
              <Button size="sm" disabled={busy || campaign.status === 'DRAFT'} onClick={() => campaignAction(campaign.id, 'approve')}>Approve all</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
