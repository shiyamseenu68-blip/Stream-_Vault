import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// API requests are proxied through Vite to localhost:5000
// No need to setBaseUrl since Vite proxy handles it

createRoot(document.getElementById('root')!).render(<App />);
