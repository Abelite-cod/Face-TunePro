import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'



export default defineConfig({

  base: "./",
  
  plugins: [
    react(),
  ],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      host: "localhost"
    },
    allowedHosts: true
  }
})