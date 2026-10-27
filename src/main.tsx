import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts. Each @font-face carries a unicode-range, so the browser
// only downloads the Latin files the page actually uses; all use font-display: swap.
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-400-italic.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './i18n';
import { App } from './ui/App';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
