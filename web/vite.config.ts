import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, l'API tourne sur le port 4000 (dossier server/).
    proxy: { '/api': 'http://localhost:4000' },
  },
})
