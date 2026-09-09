import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Armory } from './pages/Armory';
import { Presets } from './pages/Presets';
import { Looks } from './pages/Looks';
import { Build } from './pages/Build';
import { Fonts } from './pages/Fonts';
import { Setup } from './pages/Setup';
import { Diagnostics } from './pages/Diagnostics';
import { Settings } from './pages/Settings';

// Memory history mimics the Electron renderer: no URL bar, no deep links.
export function App() {
  return (
    <MemoryRouter initialEntries={['/armory']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/armory" element={<Armory />} />
          <Route path="/presets" element={<Presets />} />
          <Route path="/looks" element={<Looks />} />
          <Route path="/build" element={<Build />} />
          <Route path="/fonts" element={<Fonts />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/diag" element={<Diagnostics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/armory" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
