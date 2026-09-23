import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from '@tanstack/react-router'
import { SCORES } from '../data/scores'
import { Library } from './Library'
import { Settings } from './Settings'
import { Training } from './Training'

/**
 * The route tree, in code: three screens, no file-based plugin, no generated file. The root draws
 * the matched screen and nothing around it — the telemetry badge and the notice sit above the
 * router, in App. An address no route knows goes to the library, the way an unknown piece does.
 */
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <Navigate to="/" />,
})

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Library })

const trainingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/score/$id',
  // The piece is looked up before the screen renders: an id the library does not have is a link
  // from an older version or a typo, and the library is where to land.
  loader: ({ params }) => {
    const score = SCORES.find((s) => s.id === params.id)
    if (!score) throw redirect({ to: '/' })
    return score
  },
  component: Training,
})

const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: Settings })

/**
 * Built by App, not at import time: App strips a `?tester=` key from the address first, and the
 * router's history must read the address after that, so no route ever sees the key in its search.
 */
export function createAppRouter() {
  return createRouter({ routeTree: rootRoute.addChildren([libraryRoute, trainingRoute, settingsRoute]) })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
