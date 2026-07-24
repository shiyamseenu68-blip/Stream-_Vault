import { createRoot } from 'react-dom/client';

import App from './App';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// In production, API calls go to the same domain (serverless functions)
// In dev, Vite proxy handles /api → localhost:5000
declare const __API_BASE_URL__: string | undefined;
const apiBaseUrl = typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : '';
// Only set base URL if it's explicitly provided (for external API deployments)
// For Vercel serverless functions, we use relative URLs
if (apiBaseUrl && apiBaseUrl !== 'undefined') {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById('root')!).render(<App />);
