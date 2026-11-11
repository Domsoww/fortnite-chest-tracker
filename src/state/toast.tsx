import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createId } from '../lib/id'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
  action?: { label: string; run: () => void }
}

interface ToastApi {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone, action?: Toast['action']) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback<ToastApi['push']>(
    (message, tone = 'info', action) => {
      const id = createId()
      setToasts((list) => [...list.slice(-3), { id, message, tone, action }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), action ? 7000 : 4000),
      )
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
