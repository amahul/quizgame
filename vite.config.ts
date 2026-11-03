/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base: the built site works under any path, including
// https://<user>.github.io/<repo>/, without hardcoding the repo name.
// This is safe because routing is hash-based (#/host, #/play).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
