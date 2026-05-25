import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import ColourBand from '../components/ColourBand.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMock } from '../supabase.js';
import './LoginPage.css';

export default function LoginPage() {
  const { session, checkPassword, signIn } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('password'); // 'password' | 'name'
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Navigate to="/matches" replace />;
  }

  const submitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const ok = await checkPassword(password);
      if (!ok) {
        setError('Senha incorreta.');
        return;
      }
      setStep('name');
    } catch (err) {
      setError(err.message || 'Não foi possível verificar a senha.');
    } finally {
      setBusy(false);
    }
  };

  const submitName = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Coloca seu nome.');
      return;
    }
    setBusy(true);
    try {
      const next = await signIn({ name: trimmed, isAdmin: makeAdmin });
      if (next) navigate('/matches');
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <ColourBand />
      <div className="login__wrap">
        <div className="login__brand">
          <h1 className="login__title">Bolão Copa 2026</h1>
          <p className="login__tag">Cravar placar. Ganhar bragging rights.</p>
        </div>

        <Card className="login__card">
          {step === 'password' ? (
            <form onSubmit={submitPassword} className="login__form">
              <label className="login__label" htmlFor="login-password">
                Senha do bolão
              </label>
              <input
                id="login-password"
                className="login__input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha compartilhada"
                autoFocus
              />
              {error && <p className="login__error" role="alert">{error}</p>}
              <Button type="submit" variant="primary" fullWidth loading={busy}>Continuar</Button>
              {useMock && (
                <p className="login__hint muted">
                  Modo demo — use <code>test</code>.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={submitName} className="login__form">
              <label className="login__label" htmlFor="login-name">
                Seu nome
              </label>
              <input
                id="login-name"
                className="login__input"
                type="text"
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Luli"
                autoFocus
                maxLength={24}
              />
              {useMock && (
                <label className="login__checkbox">
                  <input
                    type="checkbox"
                    checked={makeAdmin}
                    onChange={(e) => setMakeAdmin(e.target.checked)}
                  />
                  <span>Entrar como admin (pra testar a aba Admin)</span>
                </label>
              )}
              {error && <p className="login__error" role="alert">{error}</p>}
              <Button type="submit" variant="primary" fullWidth loading={busy}>Entrar no bolão</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
