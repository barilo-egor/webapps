import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

createRoot(document.getElementById('root')).render(<App />);
