import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = (import.meta.env.BASE_URL || '/');
    const swUrl = new URL('sw.js', window.location.origin + base).pathname;
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
