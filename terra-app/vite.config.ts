import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Treat .geojson files as JSON modules
const geojsonPlugin: Plugin = {
  name: 'geojson',
  transform(code, id) {
    if (id.endsWith('.geojson')) {
      return { code: `export default ${code}`, map: null };
    }
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), geojsonPlugin],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
