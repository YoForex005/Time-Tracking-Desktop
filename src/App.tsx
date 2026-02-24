import { useState } from 'react';
import './index.css';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';

interface User { id: string; name: string; email: string; }

function App() {
  const savedUser = localStorage.getItem('wf_user');
  const savedToken = localStorage.getItem('wf_token');

  const [user, setUser] = useState<User | null>(savedUser ? JSON.parse(savedUser) : null);
  const [_token, setToken] = useState<string | null>(savedToken);
  const [activeView, setActiveView] = useState('tracker');

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

  if (!user || !savedToken) {
    return (
      <>
        <Titlebar userName="Guest" />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <Titlebar userName={user.name} />
      <div className="layout">
        <Sidebar
          user={user}
          activeView={activeView}
          onViewChange={setActiveView}
          onLogout={handleLogout}
        />
        <Dashboard view={activeView} />
      </div>
    </>
  );
}

export default App;
