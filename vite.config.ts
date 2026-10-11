import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_BASE lets a host serve the app from a sub-path (GitHub Pages project
// site: /crowdless-app/). Unset = '/', which is what dev and Vercel use.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
})
