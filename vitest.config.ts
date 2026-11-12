import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts on purpose: importing `vitest/config`
// there pulls in Vitest's own bundled copy of Vite, whose plugin types then
// clash with the project's Vite 6 during `tsc -b`.
export default defineConfig({
  test: {
    // The suites cover pure logic — time zones, the schedule state machine,
    // reminders and schema migrations — so no DOM is needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // A fixed zone proves the Prague conversions do not depend on the
    // machine's own clock settings.
    env: { TZ: 'UTC' },
  },
})
