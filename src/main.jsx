import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './index.css'
import App from './App.jsx'
import { applyTheme } from './utils/theme'

// Tema, ilk çizimden önce uygulanır (açılışta beyaz parlama olmasın)
applyTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Uygulamanın bağlantısız açılabilmesi için (sadece yayındaki sürümde; StackBlitz önizlemesinde çalışmaz)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* desteklenmiyorsa uygulama normal çalışır */ });
  });
}
