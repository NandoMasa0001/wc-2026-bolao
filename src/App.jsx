import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useData } from './context/DataContext.jsx';

import ColourBand from './components/ColourBand.jsx';
import Tabs from './components/Tabs.jsx';
import { IconBall, IconCheck, IconTrophy, IconCog, IconBook } from './components/icons.jsx';

import LoginPage from './pages/LoginPage.jsx';
import MatchesPage from './pages/MatchesPage.jsx';
import StandingsPage from './pages/StandingsPage.jsx';
import PredictionsPage from './pages/PredictionsPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import RegulamentoPage from './pages/RegulamentoPage.jsx';
import ConsensoPage from './pages/ConsensoPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

import './App.css';

function ProtectedRoute({ children }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function AppShell({ children }) {
  const { session, signOut } = useAuth();
  const { me } = useData();

  const baseTabs = [
    { to: '/matches',      label: 'Jogos',         icon: IconBall },
    { to: '/predictions',  label: 'Palpites',      icon: IconCheck },
    { to: '/leaderboard',  label: 'Classificação', icon: IconTrophy },
    { to: '/regulamento',  label: 'Regras',        icon: IconBook }
  ];
  if (me?.isAdmin) baseTabs.push({ to: '/admin', label: 'Admin', icon: IconCog });

  return (
    <div className="app-shell">
      <ColourBand />
      <header className="app-header">
        <div>
          <h1 className="app-header__title">Bolão Copa 2026</h1>
          <div className="app-header__sub">Liga de palpites</div>
        </div>
        {session && (
          <button type="button" className="app-header__signout" onClick={signOut}>
            Sair
          </button>
        )}
      </header>
      <main className="app-main">{children}</main>
      <Tabs items={baseTabs} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/matches"
        element={
          <ProtectedRoute>
            <AppShell><MatchesPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/standings"
        element={
          <ProtectedRoute>
            <AppShell><StandingsPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/predictions"
        element={
          <ProtectedRoute>
            <AppShell><PredictionsPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <AppShell><LeaderboardPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/regulamento"
        element={
          <ProtectedRoute>
            <AppShell><RegulamentoPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/consenso"
        element={
          <ProtectedRoute>
            <AppShell><ConsensoPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AppShell><AdminPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/matches" replace />} />
    </Routes>
  );
}
