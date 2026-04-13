import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Jormungandr/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 3000,
  },
})
