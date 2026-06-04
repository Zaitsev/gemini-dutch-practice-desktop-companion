import React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App'
import { AppStateProvider } from './provider'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <AppStateProvider>
            <App />
        </AppStateProvider>
    </React.StrictMode>
)
