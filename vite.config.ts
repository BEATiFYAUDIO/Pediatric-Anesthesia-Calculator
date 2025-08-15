import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/Pediatric-Anesthesia-Calculator/' : '/', // dev = '/', build = GH Pages path
}))
