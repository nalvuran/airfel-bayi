import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Derleme zamanı: telefondaki uygulamanın hangi sürümde olduğunu Ekip sayfasında göstermek için
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
})
