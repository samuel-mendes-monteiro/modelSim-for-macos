import { createRoot } from 'react-dom/client'
import './lib/monacoSetup'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
