/** Diagnóstico local: notas e tempos, sem gravar áudio ou enviar dados. */
const KEY = 'baiana.sessions.v1'
const MAX_SESSIONS = 3
const MAX_EVENTS = 2500
export type SessionEvent = { atMs: number; type: string; data: unknown }
export type SessionLog = {
  version: 1
  startedAt: string
  environment: string
  config: unknown
  events: SessionEvent[]
  dropped: number
}
export function loadSessions(): SessionLog[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.slice(-MAX_SESSIONS) : []
  } catch { return [] }
}
export class SessionRecorder {
  session: SessionLog | null = null
  private origin = 0
  begin(config: unknown): void {
    this.origin = performance.now()
    this.session = {
      version: 1, startedAt: new Date().toISOString(), environment: navigator.userAgent,
      config, events: [], dropped: 0,
    }
    this.add('start', {})
    this.save()
  }
  add(type: string, data: unknown): void {
    if (!this.session) return
    this.session.events.push({ atMs: Math.round(performance.now() - this.origin), type, data })
    if (this.session.events.length > MAX_EVENTS) {
      this.session.events.shift()
      this.session.dropped++
    }
  }
  save(): boolean {
    if (!this.session) return true
    try {
      const sessions = loadSessions().filter((s) => s.startedAt !== this.session!.startedAt)
      localStorage.setItem(KEY, JSON.stringify([...sessions, this.session].slice(-MAX_SESSIONS)))
      return true
    } catch { return false }
  }
}
export function exportSessions(current: SessionLog | null = null): void {
  const saved = loadSessions()
  const sessions = current
    ? [...saved.filter((s) => s.startedAt !== current.startedAt), current].slice(-MAX_SESSIONS)
    : saved
  const blob = new Blob([JSON.stringify({ app: 'Baiana', sessions }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `baiana-sessoes-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
