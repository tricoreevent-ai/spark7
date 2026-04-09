import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AppDialogProvider } from './components/AppDialogProvider'
import { AppErrorBoundary } from './components/AppErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <AppDialogProvider>
        <App />
      </AppDialogProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
