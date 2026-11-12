import { useCallback, useEffect, useState } from 'react'

export const routes = ['dashboard', 'treasure', 'history', 'statistics', 'settings'] as const
export type Route = (typeof routes)[number]

function readHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  return (routes as readonly string[]).includes(raw) ? (raw as Route) : 'dashboard'
}

/** Hash routing keeps the production build working from any path, including
 *  file:// and static hosts, without a server rewrite rule. */
export function useHashRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(readHash)

  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    if (readHash() === next) {
      setRoute(next)
      return
    }
    window.location.hash = `/${next}`
  }, [])

  // A fresh page should start at the top, not at the previous page's offset.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [route])

  useEffect(() => {
    document.title =
      route === 'dashboard'
        ? 'Chest Tracker — Dashboard'
        : route === 'treasure'
          ? 'Chest Tracker — Treasure Hours'
          : `Chest Tracker — ${route[0].toUpperCase()}${route.slice(1)}`
  }, [route])

  return [route, navigate]
}
