import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  base: process.env.NODE_ENV === 'production' ? '/zamude-jpp/' : '/',
  server: { port: 9126, host: true },
})
