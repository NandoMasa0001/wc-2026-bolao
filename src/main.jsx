import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './styles/tokens.css';
import './styles/global.css';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
import { ToastProvider } from './components/Toast.jsx';

// Per-league branding: same code, different favicon + title based on the
// hostname the app is served from. Lets us deploy from one repo to many
// Cloudflare projects (bolaotrupe, bolaofamilia, ...) without forking code.
const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
if (hostname.includes('bolaofamilia') || hostname.includes('bolao-familia')) {
  document.title = 'Bolão Família 2026';
  for (const sel of ["link[rel='icon']", "link[rel='apple-touch-icon']"]) {
    const link = document.querySelector(sel);
    if (link) link.href = '/favicon-familia.svg';
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
