import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/600.css';
import './styles/theme.css';
import './styles/layout.css';
import { SettingsProvider } from './settings';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
