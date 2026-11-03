import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { applyTheme } from './theme.js';
import { blockRightClick } from './rightClick.js';

// Before the first paint, so the page never flashes the other theme.
applyTheme();
blockRightClick();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
