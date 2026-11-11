import type { ReactNode } from 'react'
import { Card } from './Card'

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'accent' | 'gold' | 'success'
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'gold'
        ? 'text-gold'
        : tone === 'success'
          ? 'text-success'
          : 'text-ink'

  return (
    <Card hover className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="label">{label}</span>
        {icon ? <span className="text-faint">{icon}</span> : null}
      </div>
      <div className={`tabular mt-3 text-3xl font-bold ${valueTone}`}>{value}</div>
      {hint ? <div className="mt-1.5 text-sm text-muted">{hint}</div> : null}
    </Card>
  )
}
