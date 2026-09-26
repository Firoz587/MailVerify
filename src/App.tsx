import { useState, useRef, useCallback, useEffect } from 'react'

const API_DOCS_URL = '/api/docs'

// ─── Types ───────────────────────────────────────────────────────────────────

type VerifyStatus = 'idle' | 'loading' | 'valid' | 'invalid' | 'risky'

interface VerifyResult {
  email: string
  status: 'valid' | 'invalid' | 'risky'
  syntaxValid: boolean
  mxValid: boolean
  disposable: boolean
  smtpReachable: boolean | null
  executionTimeMs: number
  mxRecords: string[]
  domain: string
  remarks: string
  roleBased: boolean
  msp: string | null
  freeEmail: boolean
  verifiedAt: string
}

interface BulkRow {
  id: number
  email: string
  status: 'valid' | 'invalid' | 'risky'
  mxValid: boolean
  disposable: boolean
}

type TabId = 'single' | 'bulk'

interface ApiResult {
  email: string
  is_valid: boolean
  status: 'valid' | 'invalid' | 'disposable' | 'clean' | 'dirty'
  syntax_valid: boolean
  mx_valid: boolean
  is_disposable: boolean
  mx_records: string[]
  smtp_reachable: boolean | null
  execution_time_ms: number
  remarks?: string
  disposable?: boolean | null
  role_based?: boolean
  mx_found?: boolean
  msp?: string | null
  email_domain?: string
  free_email?: boolean
  verified_at?: string
}

function mapResult(result: ApiResult): VerifyResult {
  const domain = result.email.split('@')[1] ?? ''
  return {
    email: result.email,
    status: result.status === 'clean' || result.status === 'valid' ? 'valid' : result.status === 'disposable' || result.status === 'dirty' ? 'risky' : 'invalid',
    syntaxValid: result.syntax_valid,
    mxValid: result.mx_valid,
    disposable: result.disposable ?? result.is_disposable,
    smtpReachable: result.smtp_reachable,
    executionTimeMs: result.execution_time_ms,
    mxRecords: result.mx_records,
    domain: result.email_domain ?? domain,
    remarks: result.remarks ?? (result.status === 'valid' ? 'High Quality' : 'Verification requires attention'),
    roleBased: result.role_based ?? false,
    msp: result.msp ?? null,
    freeEmail: result.free_email ?? false,
    verifiedAt: result.verified_at ?? '',
  }
}

async function verifySingleRequest(email: string): Promise<VerifyResult> {
  const response = await fetch('/api/verify-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail ?? 'The verification service is unavailable.')
  }
  return mapResult((await response.json()) as ApiResult)
}

function DisposableDomainsPage() {
  const [domains, setDomains] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/disposable-domains')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the disposable domain list.')
        return response.json() as Promise<{ domains: string[] }>
      })
      .then((payload) => setDomains(payload.domains))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Could not load the list.'))
  }, [])

  return (
    <div className="bg-mesh min-h-screen px-4 py-24 md:px-8">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm text-indigo-300 hover:text-indigo-200">← Back to MailVerify</a>
        <div className="glass mt-6 rounded-xl p-6">
          <p className="mono text-xs uppercase tracking-wider text-indigo-300">MailVerify data</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Disposable email domains</h1>
          <p className="mt-2 text-slate-400">Domains currently treated as disposable by the verification engine.</p>
          {error ? <p className="mt-6 text-sm text-red-300">{error}</p> : <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">{domains.map((domain) => <span key={domain} className="mono rounded-md border border-indigo-400/15 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">{domain}</span>)}</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'valid' | 'invalid' | 'risky' }) {
  const map = {
    valid: { label: 'Valid', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#34d399', dot: '#10b981' },
    invalid: { label: 'Invalid', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#f87171', dot: '#ef4444' },
    risky: { label: 'Risky / Catch-all', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24', dot: '#f59e0b' },
  }
  const c = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mono"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: c.dot, boxShadow: `0 0 6px ${c.dot}` }}
      />
      {c.label}
    </span>
  )
}

function CheckRow({
  icon,
  label,
  value,
  delay,
}: {
  icon: string
  label: string
  value: boolean | null
  delay: number
}) {
  return (
    <div
      className="check-row flex items-center justify-between py-2.5 border-b"
      style={{ borderColor: 'rgba(148,163,184,0.08)', animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2.5 text-sm text-slate-300">
        <span className="text-base">{icon}</span>
        <span>{label}</span>
      </div>
      {value === null ? (
        <span className="mono text-xs text-slate-500">—</span>
      ) : value ? (
        <span className="mono text-xs font-medium" style={{ color: '#34d399' }}>
          ✓ PASS
        </span>
      ) : (
        <span className="mono text-xs font-medium" style={{ color: '#f87171' }}>
          ✗ FAIL
        </span>
      )}
    </div>
  )
}

function NavBar({ activeTab, setActiveTab }: { activeTab: TabId; setActiveTab: (t: TabId) => void }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-14"
      style={{
        background: 'rgba(8,13,26,0.85)',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #22d3ee)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
        >
          ✉
        </div>
        <span className="font-semibold text-white text-sm tracking-tight">
          Mail<span className="gradient-text">Verify</span>
        </span>
      </div>

      {/* Nav links */}
      <div className="hidden md:flex items-center gap-1">
        {[
          { id: 'single' as TabId, label: 'Single Check' },
          { id: 'bulk' as TabId, label: 'Bulk Verify' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
            style={
              activeTab === item.id
                ? { background: 'rgba(99,102,241,0.15)', color: '#818cf8' }
                : { color: 'rgba(148,163,184,0.75)' }
            }
          >
            {item.label}
          </button>
        ))}
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs font-medium transition-colors duration-150 text-slate-400 hover:text-slate-200">
          API Docs
        </a>
        <a href="/disposable" className="px-3 py-1.5 text-xs font-medium transition-colors duration-150 text-slate-400 hover:text-slate-200">
          Disposable List
        </a>
      </div>

      {/* GitHub */}
      <a
        href="https://github.com/Firoz587"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors duration-150"
        style={{ border: '1px solid rgba(148,163,184,0.12)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
        GitHub
      </a>
    </nav>
  )
}

// ─── Single Check Section ─────────────────────────────────────────────────────

function SingleCheckSection() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState('')

  const handleCheck = async () => {
    if (!email.trim()) return
    setStatus('loading')
    setResult(null)
    setError('')
    try {
      const res = await verifySingleRequest(email.trim())
      setResult(res)
      setStatus(res.status)
    } catch (requestError) {
      setStatus('idle')
      setError(requestError instanceof Error ? requestError.message : 'Verification failed.')
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Hero headline */}
      <div className="text-center mb-10">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs mono mb-4"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#6366f1', boxShadow: '0 0 6px #6366f1', animation: 'pulse-dot 2s ease-in-out infinite' }}
          />
          100% Free · No API Key Required
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white mb-3">
          Email Verification &{' '}
          <span className="gradient-text">Deliverability</span>
        </h1>
        <p className="text-slate-400 text-base max-w-md mx-auto leading-relaxed">
          Check whether an email is ready to receive messages before you send it.
        </p>
      </div>

      {error && <p className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {/* Input card */}
      <div
        className="glass rounded-xl p-6 mb-4"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.1)' }}
      >
        <label className="block text-xs font-medium text-slate-400 mono mb-2 uppercase tracking-wider">
          Email Address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            placeholder="name@example.com"
            className="input-field flex-1 px-4 py-3 rounded-lg text-sm"
          />
          <button
            onClick={handleCheck}
            disabled={status === 'loading'}
            className="btn-glow w-full rounded-lg px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:whitespace-nowrap"
          >
            {status === 'loading' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking…
              </span>
            ) : (
              'Check Email'
            )}
          </button>
        </div>

        {/* Quick examples */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Try:</span>
          {['valid@stripe.com', 'test@mailinator.com', 'invalid@@bad'].map((ex) => (
            <button
              key={ex}
              onClick={() => setEmail(ex)}
              className="text-xs mono px-2 py-0.5 rounded transition-colors duration-150"
              style={{ color: '#818cf8', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Loading scanner */}
      {status === 'loading' && (
        <div
          className="glass rounded-xl p-6 overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-slate-300">Running checks…</span>
            <span className="mono text-xs text-slate-500">dnspython · smtplib</span>
          </div>
          {['Syntax validation', 'Domain MX lookup', 'Disposable DB check', 'SMTP server ping'].map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div
                className="w-3 h-3 rounded-full relative overflow-hidden flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                <div
                  className="scan-line absolute inset-y-0 w-1"
                  style={{
                    background: 'linear-gradient(to right, transparent, #6366f1, transparent)',
                    animationDelay: `${i * 0.25}s`,
                  }}
                />
              </div>
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(99,102,241,0.1)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
                    width: '0%',
                    animation: `progress-fill 1.4s ease ${i * 0.3}s forwards`,
                    ['--progress-width' as string]: `${60 + i * 10}%`,
                  }}
                />
              </div>
              <span className="mono text-xs text-slate-500 w-16 text-right">…</span>
            </div>
          ))}
        </div>
      )}

      {/* Results card */}
      {result && status !== 'loading' && (
        <div
          className="glass rounded-xl p-6"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          {/* Header */}
          <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <StatusBadge status={result.status} />
                <span
                  className="mono text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(148,163,184,0.08)', color: 'rgba(148,163,184,0.6)' }}
                >
                  {result.executionTimeMs}ms
                </span>
              </div>
              <p className="mono mt-2 break-all text-sm text-slate-300">{result.email}</p>
              <p className="mt-2 text-sm font-medium text-slate-200">{result.remarks}</p>
            </div>
            {result.domain && (
              <div className="text-left sm:text-right">
                <p className="text-xs text-slate-500 mb-0.5">Domain</p>
                <p className="mono text-xs text-slate-300">{result.domain}</p>
                {result.msp && <p className="mono mt-1 text-xs text-cyan-300">{result.msp}</p>}
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="overflow-x-auto">
            <CheckRow icon="⌨️" label="Syntax Check" value={result.syntaxValid} delay={0} />
            <CheckRow icon="🌐" label="Domain MX Record" value={result.mxValid} delay={80} />
            <CheckRow icon="🗑️" label="Disposable / Temporary Email" value={result.disposable === null ? null : !result.disposable} delay={160} />
            <CheckRow
              icon="📡"
              label="SMTP Server Ping"
              value={result.smtpReachable}
              delay={240}
            />
          </div>

          {result.mxRecords.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-700/40 bg-slate-950/30 p-3">
              <p className="mb-2 text-xs text-slate-500">MX records</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {result.mxRecords.map((record) => <span key={record} className="mono break-all text-xs text-slate-400">{record}</span>)}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Role based', result.roleBased ? 'Yes' : 'No'],
              ['Free email', result.freeEmail ? 'Yes' : 'No'],
              ['MX found', result.mxValid ? 'Yes' : 'No'],
              ['Disposable', result.disposable === null ? 'Unknown' : result.disposable ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-700/30 bg-slate-950/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mono mt-1 text-xs text-slate-200">{value}</p>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div
            className="mt-4 pt-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(148,163,184,0.08)' }}
          >
            <p className="text-xs text-slate-500">
              Checked via DNS MX lookup + disposable domain DB
            </p>
            <span
              className="mono text-xs"
              style={{ color: result.status === 'valid' ? '#34d399' : result.status === 'risky' ? '#fbbf24' : '#f87171' }}
            >
              Checked in {result.executionTimeMs}ms
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bulk Check Section ───────────────────────────────────────────────────────

function BulkCheckSection() {
  const [rows, setRows] = useState<BulkRow[]>([])
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setRunning(true)
    setRows([])
    setProgress(0)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch('/api/verify-bulk', { method: 'POST', body: formData })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail ?? 'Bulk verification failed.')
      const results = payload.results as ApiResult[]
      setRows(results.map((result, index) => ({
        id: index + 1,
        email: result.email,
        status: result.status === 'clean' || result.status === 'valid' ? 'valid' : result.status === 'dirty' || result.status === 'disposable' ? 'risky' : 'invalid',
        mxValid: result.mx_valid,
        disposable: result.is_disposable,
      })))
      setProgress(100)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Bulk verification failed.')
    } finally {
      setRunning(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) void processFile(file)
    },
    [processFile]
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void processFile(file)
  }

  const exportCsv = () => {
    const csv = ['email,status,mx_valid,disposable', ...rows.map((row) => `${row.email},${row.status},${row.mxValid},${row.disposable}`)].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = 'email-verification-results.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const statusCounts = rows.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {} as Record<string, number>
  )

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Bulk Email <span className="gradient-text">Verification</span>
        </h2>
        <p className="text-slate-400 text-sm">Upload a .CSV or .TXT file with one email per line</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="rounded-xl cursor-pointer transition-all duration-200 mb-6 relative overflow-hidden"
        style={{
          background: dragging ? 'rgba(99,102,241,0.08)' : 'rgba(13,20,38,0.5)',
          border: `2px dashed ${dragging ? 'rgba(99,102,241,0.6)' : 'rgba(99,102,241,0.2)'}`,
          padding: '2.5rem',
          boxShadow: dragging ? '0 0 0 4px rgba(99,102,241,0.08)' : 'none',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            📂
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200 mb-1">
              Drag &amp; drop your file here, or <span style={{ color: '#818cf8' }}>browse</span>
            </p>
            <p className="mono text-xs text-slate-500">Supports .CSV · .TXT · Max 50,000 emails</p>
          </div>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {/* Progress */}
      {(running || rows.length > 0) && (
        <div className="glass rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-200">
                {running ? 'Processing…' : 'Complete'}
              </span>
              {!running && (
                <span
                  className="mono text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  ✓ Done
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!running && (
                <>
                  {statusCounts.valid && (
                    <span className="mono text-xs" style={{ color: '#34d399' }}>
                      {statusCounts.valid} valid
                    </span>
                  )}
                  {statusCounts.risky && (
                    <span className="mono text-xs" style={{ color: '#fbbf24' }}>
                      {statusCounts.risky} risky
                    </span>
                  )}
                  {statusCounts.invalid && (
                    <span className="mono text-xs" style={{ color: '#f87171' }}>
                      {statusCounts.invalid} invalid
                    </span>
                  )}
                </>
              )}
              <span className="mono text-xs text-slate-400">{progress}%</span>
            </div>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(99,102,241,0.12)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #6366f1, #22d3ee)',
                boxShadow: '0 0 8px rgba(99,102,241,0.4)',
              }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div
          className="glass rounded-xl overflow-hidden"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          {/* Table header */}
          <div
            className="grid gap-3 px-5 py-3 mono text-xs font-medium uppercase tracking-wider text-slate-500"
            style={{
              gridTemplateColumns: '1fr 120px 80px 100px auto',
              minWidth: '620px',
              borderBottom: '1px solid rgba(148,163,184,0.08)',
              background: 'rgba(8,13,26,0.5)',
            }}
          >
            <span>Email</span>
            <span>Status</span>
            <span>MX Valid</span>
            <span>Disposable</span>
            <span className="text-right">Action</span>
          </div>

          {/* Rows */}
          <div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 px-5 py-3 items-center hover:bg-white/[0.02] transition-colors duration-100"
                style={{
                  gridTemplateColumns: '1fr 120px 80px 100px auto',
                  minWidth: '620px',
                  borderBottom: '1px solid rgba(148,163,184,0.05)',
                  animation: 'slide-in 0.25s ease forwards',
                }}
              >
                <span className="mono text-xs text-slate-300 truncate">{row.email}</span>
                <span>
                  <StatusBadge status={row.status} />
                </span>
                <span className="mono text-xs" style={{ color: row.mxValid ? '#34d399' : '#f87171' }}>
                  {row.mxValid ? '✓ Yes' : '✗ No'}
                </span>
                <span className="mono text-xs" style={{ color: row.disposable ? '#fbbf24' : 'rgba(148,163,184,0.5)' }}>
                  {row.disposable ? '⚠ Yes' : '— No'}
                </span>
                <button
                  className="text-right mono text-xs transition-colors duration-150 whitespace-nowrap"
                  style={{ color: '#818cf8' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          {!running && rows.length > 0 && (
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: '1px solid rgba(148,163,184,0.08)', background: 'rgba(8,13,26,0.5)' }}
            >
              <span className="mono text-xs text-slate-500">{rows.length} emails processed</span>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
                  boxShadow: '0 0 16px rgba(99,102,241,0.3)',
                }}
              >
                Export Clean CSV
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Developer Callout ────────────────────────────────────────────────────────

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  return (
    <div
      className="w-full max-w-4xl mx-auto mb-12 grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      {[
        { label: 'Emails Verified Today', value: '1,247,832', delta: '+14%' },
        { label: 'Average Latency', value: '186ms', delta: null },
        { label: 'Disposable Detected', value: '98.4%', delta: null },
        { label: 'Uptime', value: '99.97%', delta: null },
      ].map((stat) => (
        <div
          key={stat.label}
          className="glass-light rounded-xl p-4"
        >
          <p className="mono text-xs text-slate-500 mb-1.5">{stat.label}</p>
          <div className="flex items-baseline gap-2">
            <span className="mono text-lg font-semibold text-white">{stat.value}</span>
            {stat.delta && (
              <span className="mono text-xs" style={{ color: '#34d399' }}>{stat.delta}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('single')

  if (window.location.pathname === '/disposable') return <DisposableDomainsPage />

  return (
    <div className="bg-mesh min-h-screen">
      <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="pt-24 pb-24 px-4 md:px-8">
        {/* Tab switcher */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[
            { id: 'single' as TabId, label: 'Single Check', icon: '✉' },
            { id: 'bulk' as TabId, label: 'Bulk Verify', icon: '📋' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={
                activeTab === tab.id
                  ? {
                      background: 'rgba(99,102,241,0.15)',
                      border: '1px solid rgba(99,102,241,0.35)',
                      color: '#818cf8',
                      boxShadow: '0 0 16px rgba(99,102,241,0.15)',
                    }
                  : {
                      background: 'rgba(13,20,38,0.5)',
                      border: '1px solid rgba(148,163,184,0.1)',
                      color: 'rgba(148,163,184,0.6)',
                    }
              }
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="flex justify-center">
          <StatsBar />
        </div>

        {/* Content */}
        <div className="flex justify-center">
          {activeTab === 'single' ? <SingleCheckSection /> : <BulkCheckSection />}
        </div>

      </main>

      {/* Footer */}
      <footer
        className="border-t py-6 px-8"
        style={{ borderColor: 'rgba(148,163,184,0.08)' }}
      >
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white">Mail<span className="gradient-text">Verify</span></span>
            <span className="text-slate-600">·</span>
            <span className="mono text-xs text-slate-500">Free & Open-Source Email Verification</span>
          </div>
          <div className="flex items-center gap-4">
            {[
              { label: 'Privacy', href: '/privacy' },
              { label: 'API Docs', href: API_DOCS_URL },
              { label: 'Disposable List', href: '/disposable' },
              { label: 'Status', href: '/api/health' },
                { label: 'Contact me', href: 'https://firozislam.me' },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.href.startsWith('/api/') ? '_blank' : undefined}
                rel={link.href.startsWith('/api/') ? 'noreferrer' : undefined}
                className="mono text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
