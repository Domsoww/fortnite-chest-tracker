import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return <div className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-3 text-accent">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}
