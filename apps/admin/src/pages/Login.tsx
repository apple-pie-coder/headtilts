import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchSetupStatus } from '../services/auth';
import { fetchPublicSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFeather } from '@fortawesome/free-solid-svg-icons';
import styles from './Login.module.css';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [logo, setLogo] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [title, setTitle] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => setNeedsSetup(status.needsSetup))
      .catch(() => setNeedsSetup(false))
      .finally(() => setCheckingSetup(false));
    fetchPublicSettings()
      .then((s) => { setLogo(s.site_logo || ''); setLogoDark(s.site_logo_dark || ''); setTitle(s.site_title || ''); })
      .catch(() => {});
  }, []);

  const activeLogo = (theme === 'dark' && logoDark) ? logoDark : logo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await login(identifier, password);
      navigate('/admin');
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Login failed',
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return null;
  }

  if (needsSetup) {
    return <Navigate to="/admin/setup" replace />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          {activeLogo ? (
            <img className={styles.logoImg} src={resolveMediaUrl(activeLogo)} alt={title || 'Logo'} />
          ) : (
            <span className={styles.logoIcon}><FontAwesomeIcon icon={faFeather} /></span>
          )}
          <h2>Sign in to your account</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Email or username</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com or username"
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>


          <button type="submit" disabled={loading} className={styles.button}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className={styles.forgotRow}>
            <Link to="/admin/forgot-password">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
