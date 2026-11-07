import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { AppProviders } from './app/AppProviders'
import './app.css'
import { OfflineSync } from './components/organisms/OfflineSync'
import { PwaSupport } from './components/organisms/PwaSupport'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <PwaSupport />
      <OfflineSync />
      <App />
    </AppProviders>
  </React.StrictMode>,
)
