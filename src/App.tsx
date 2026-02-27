import { useState, useEffect } from 'react';
  import './index.css';
  import LoginPage from './pages/LoginPage';
  import Dashboard from './pages/Dashboard';
  import Titlebar from './components/Titlebar';
  import Sidebar from './components/Sidebar';

  interface User { id: string; name: string; email: string; }

  function getInitialTheme(): 'light' | 'dark' {
      const saved = localStorage.getItem('wf_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      // Respect OS preference on first launch
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getSavedUser(): User | null {
      const raw = localStorage.getItem('wf_user');
      if (!raw) return null;

      try {
          const parsed = JSON.parse(raw) as Partial<User>;
          if (
              typeof parsed.id === 'string' &&
              typeof parsed.name === 'string' &&
              typeof parsed.email === 'string'
          ) {
              return { id: parsed.id, name: parsed.name, email: parsed.email };
          }
          return null;
      } catch {
          return null;
      }
  }

  function App() {
      const savedToken = localStorage.getItem('wf_token');

      const [user, setUser] = useState<User | null>(getSavedUser());
      const [token, setToken] = useState<string | null>(savedToken);
      const [activeView, setView] = useState('tracker');
      const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
      const [shiftActive, setShiftActive] = useState(false); // true when working or on_break

      // Apply theme to <html data-theme="..."> whenever it changes
      useEffect(() => {
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('wf_theme', theme);
      }, [theme]);

      // Keep Electron tracker auth token in sync with login/logout state.
      useEffect(() => {
          const api = (window as unknown as {
              electronAPI?: {
                  setTrackerAuthToken?: (t: string) => void;
                  clearTrackerAuthToken?: () => void;
              };
          }).electronAPI;

          if (!api) return;

          if (token && api.setTrackerAuthToken) {
              api.setTrackerAuthToken(token);
              return;
          }

          if (!token && api.clearTrackerAuthToken) {
              api.clearTrackerAuthToken();
          }
      }, [token]);

      // Auto-logout on token expiry
      useEffect(() => {
          const onExpired = () => {
              setUser(null);
              setToken(null);
          };
          window.addEventListener('wf:session-expired', onExpired);
          return () => window.removeEventListener('wf:session-expired', onExpired);
      }, []);

      const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

      const handleLogin = (u: User, t: string) => {
          setUser(u);
          setToken(t);
      };

      const handleLogout = () => {
          localStorage.removeItem('wf_token');
          localStorage.removeItem('wf_user');
          setUser(null);
          setToken(null);
      };

      if (!user || !token) {
          return (
              <>
                  <Titlebar userName="Guest" theme={theme} onToggleTheme={toggleTheme} />
                  <LoginPage onLogin={handleLogin} />
              </>
          );
      }

      return (
          <>
              <Titlebar userName={user.name} theme={theme} onToggleTheme={toggleTheme} />
              <div className="layout">
                  <Sidebar
                      user={user}
                      activeView={activeView}
                      onViewChange={setView}
                      onLogout={handleLogout}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                      shiftActive={shiftActive}
                  />
                  <Dashboard view={activeView} onShiftStatusChange={setShiftActive} />
              </div>
          </>
      );
  }

  export default App;