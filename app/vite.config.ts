import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the static demo under /hamseda/. Local dev and desktop use "/".
const base = process.env.STATIC_DEMO_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // the bridge only accepts this exact address (see bridge/src/server.mjs)
  },
});
