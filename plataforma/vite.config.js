import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Panel de plataforma (academias.eduguat.com).  En producción nginx sirve
// dist/ y hace proxy de /api al backend de EduGuat; en dev, igual vía Vite.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8080' } },
})
