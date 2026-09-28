import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useVault, VaultProvider } from './store/VaultContext';
import { requestPersistentStorage } from './pwa';
import { Gate } from './pages/Gate';
import { Dashboard } from './pages/Dashboard';
import { PeopleList } from './pages/PeopleList';
import { PersonForm } from './pages/PersonForm';
import { PersonProfile } from './pages/PersonProfile';
import { LogInteraction } from './pages/LogInteraction';
import { Circles } from './pages/Circles';
import { Ask } from './pages/Ask';
import { Reflect } from './pages/Reflect';
import { Settings } from './pages/Settings';
import { Inbox } from './pages/Inbox';

interface NavItem {
  to: string;
  label: string;
  short: string;
  glyph: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', short: 'Overview', glyph: '◐', end: true },
  { to: '/people', label: 'People', short: 'People', glyph: '☺' },
  { to: '/log', label: 'Log interaction', short: 'Log', glyph: '+' },
  { to: '/inbox', label: 'Captured texts', short: 'Inbox', glyph: '✉' },
  { to: '/circles', label: 'Circles', short: 'Circles', glyph: '◎' },
  { to: '/ask', label: 'Reflect with AI', short: 'Ask', glyph: '❝' },
  { to: '/reflect', label: 'Mirror & values', short: 'Mirror', glyph: '◇' },
  { to: '/settings', label: 'Privacy & settings', short: 'Settings', glyph: '⚙' },
];

/** Phone tab bar: the four most-used destinations; the rest live under "More". */
const TABS = ['/', '/people', '/log', '/inbox'];

/**
 * Locks after inactivity. Phones suspend timers in the background, so time
 * away is also checked when the app becomes visible again.
 */
function useAutoLock(minutes: number, lock: () => void) {
  useEffect(() => {
    if (!minutes) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    let timer = window.setTimeout(lock, limit);
    const reset = () => {
      last = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, limit);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - last >= limit) lock();
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [minutes, lock]);
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="nav-badge" aria-label={`${count} to review`}>
      {count}
    </span>
  );
}

function Shell() {
  const { vault, lock } = useVault();
  useAutoLock(vault.settings.autoLockMinutes, lock);
  const { pathname, hash } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const pending = vault.capture?.pending.length ?? 0;

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  // New page, top of page — unless the route targets an in-page anchor.
  useEffect(() => {
    setMoreOpen(false);
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  const link = (n: NavItem, className: string, short = false) => (
    <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `${className} ${isActive ? 'active' : ''}`}>
      <span className="nav-glyph" aria-hidden>
        {n.glyph}
      </span>
      <span>{short ? n.short : n.label}</span>
      {n.to === '/inbox' && <Badge count={pending} />}
    </NavLink>
  );

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">Kith</div>
        <div className="brand-sub">What is a friend?</div>
        {NAV.map((n) => link(n, 'nav-link'))}
        <div className="sidebar-foot">
          <span>Private to this device. Encrypted at rest.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={lock}>
            Lock now
          </button>
        </div>
      </nav>

      <header className="mobile-top">
        <span className="brand">Kith</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={lock}>
          Lock
        </button>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/people" element={<PeopleList />} />
          <Route path="/people/new" element={<PersonForm />} />
          <Route path="/people/:id" element={<PersonProfile />} />
          <Route path="/people/:id/edit" element={<PersonForm />} />
          <Route path="/log" element={<LogInteraction />} />
          <Route path="/log/:id" element={<LogInteraction />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/circles" element={<Circles />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/reflect" element={<Reflect />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {moreOpen && (
        <div className="more-sheet" role="dialog" aria-label="More">
          <button type="button" className="more-backdrop" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="more-panel">
            {NAV.filter((n) => !TABS.includes(n.to)).map((n) => link(n, 'nav-link'))}
            <button type="button" className="btn btn-ghost" onClick={lock}>
              Lock now
            </button>
          </div>
        </div>
      )}

      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => TABS.includes(n.to)).map((n) => link(n, 'tab', true))}
        <button type="button" className={`tab ${moreOpen ? 'active' : ''}`} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
          <span className="nav-glyph" aria-hidden>
            ⋯
          </span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

function Root() {
  const { status } = useVault();
  if (status === 'loading') return null;
  if (status !== 'unlocked') return <Gate />;
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}

export function App() {
  return (
    <VaultProvider>
      <Root />
    </VaultProvider>
  );
}
