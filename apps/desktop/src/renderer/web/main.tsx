// The web entry: the stand-in for the preload API goes in before any page module reads it, then the app's faces and
// styles, then the workshop. Bundled by site/workshop.mjs into the website's /workshop/.

import './webApi';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/barlow-condensed/600-italic.css';
import '@fontsource/shippori-mincho/latin-700.css';
import '@fontsource/josefin-sans/latin-600.css';
import '../src/styles.css';
import '../src/themes.css';
import { applyTheme } from '../src/theme';
import { ErrorBoundary } from '../src/ErrorBoundary';
import { WebApp } from './WebApp';

applyTheme(window.hiltwright.theme.initial);
document.documentElement.dataset.platform = 'web';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary what="the workshop"><WebApp /></ErrorBoundary>
  </React.StrictMode>,
);
