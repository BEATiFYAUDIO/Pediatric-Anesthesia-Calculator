import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Pediatric-Anesthesia-Calculator/', // exactly your repo name
})
