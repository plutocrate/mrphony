import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace 'blacklinux' with your actual GitHub repo name
// e.g. repo is github.com/yourname/police-terrain → base: '/police-terrain/'
export default defineConfig({
  plugins: [react()],
  base: '/blacklinux/',
  server: { port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true },
})
