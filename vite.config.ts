import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the production build also works from a subdirectory
  // (e.g. GitHub Pages) without extra configuration.
  base: './',
  build: {
    // The charting library is loaded on demand by the Statistics page, so the
    // only chunk above the default warning threshold is that lazy one.
    chunkSizeWarningLimit: 700,
  },
})
