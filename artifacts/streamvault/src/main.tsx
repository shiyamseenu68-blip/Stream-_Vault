import { createRoot } from 'react-dom/client';

import App from './App';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// In production, point API calls to the external API server
// In dev, Vite proxy handles /api → localhost:5000
declare const __API_BASE_URL__: string | undefined;
const apiBaseUrl = typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : '';
if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById('root')!).render(<App />);
