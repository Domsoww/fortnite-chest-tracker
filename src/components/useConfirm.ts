import { useCallback, useState } from 'react'
import type { ConfirmOptions } from './ConfirmDialog'

/** Promise-based confirmation, so call sites read like a normal guard. */
export function useConfirm() {
  const [state, setState] = useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ options, resolve })
      }),
    [],
  )

  const settle = useCallback(
    (value: boolean) => {
      setState((current) => {
        current?.resolve(value)
        return null
      })
    },
    [],
  )

  return {
    confirm,
    dialogProps: {
      open: state !== null,
      options: state?.options ?? null,
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
    },
  }
}
