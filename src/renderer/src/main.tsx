import { createRoot } from 'react-dom/client'
import './features/editor/monaco/setup'
import App from './app/App'
import './app/styles.css'

createRoot(document.getElementById('root')!).render(<App />)
