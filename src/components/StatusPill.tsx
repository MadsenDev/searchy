import type { StatusSnapshot } from '../lib/types'

const phaseClasses: Record<StatusSnapshot['phase'], string> = {
  idle: 'border-white/12 text-slate-200',
  scanning: 'border-amber-300/30 text-amber-200',
  ready: 'border-emerald-300/30 text-emerald-200',
  error: 'border-red-300/30 text-red-200',
}

export function StatusPill({ status }: { status: StatusSnapshot | null }) {
  if (!status) {
    return null
  }

  const watcherTone =
    status.watcherState === 'degraded'
      ? 'text-amber-200'
      : status.watcherState === 'healthy'
        ? 'text-emerald-200'
        : 'text-sky-200'

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-[0.2em] uppercase ${phaseClasses[status.phase]}`}
    >
      <span>{status.phase}</span>
      <span className="text-white/40">•</span>
      <span className="text-white/70">{status.indexedEntries.toLocaleString()} entries</span>
      <span className="text-white/40">•</span>
      <span className={watcherTone}>{status.watcherState}</span>
    </div>
  )
}
