import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // base: '/<repo>/', // uncomment if deploying under a subpath (e.g., GitHub Pages)
});
