import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The same frontend serves both the web build and the Tauri desktop shell.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base so the production build works from a subdirectory
  // (e.g. GitHub Pages) and from Tauri's asset protocol.
  base: './',
  // Tauri expects a fixed dev port and its own error output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Both Edge WebView2 (Windows) and modern browsers handle this level.
    target: 'es2022',
    // The charting library is loaded on demand by the Statistics page, so the
    // only chunk above the default warning threshold is that lazy one.
    chunkSizeWarningLimit: 700,
  },
})
