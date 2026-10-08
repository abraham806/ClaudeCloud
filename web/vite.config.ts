import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// VITE_DEMO=1 : version de démonstration autonome (GitHub Pages), l'API tourne dans le navigateur.
// VITE_BASE : sous-dossier de publication (ex. /ClaudeCloud/ sur GitHub Pages).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { chunkSizeWarningLimit: 2500 },
  server: {
    fs: { allow: ['..'] },
    // En développement, l'API tourne sur le port 4000 (dossier server/).
    proxy: { '/api': 'http://localhost:4000' },
  },
})
