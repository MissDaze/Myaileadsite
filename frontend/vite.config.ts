import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backendUrl,
    },
  },
  preview: {
    port: parseInt(process.env.PORT || '4173', 10),
    host: '0.0.0.0',
    proxy: {
      '/api': backendUrl,
    },
  },
})
