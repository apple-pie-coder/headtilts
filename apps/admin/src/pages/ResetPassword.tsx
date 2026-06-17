import { useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/auth';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFeather, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import styles from './Login.module.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);

    try {
      await resetPassword(token, password);
      navigate('/admin/login', { replace: true });
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Reset failed. The link may have expired.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}><FontAwesomeIcon icon={faFeather} /></span>
          <h1>Headtilts</h1>
          <h2>Choose a new password</h2>
        </div>

        {!token ? (
          <>
            <p className={styles.infoText}>
              This reset link is missing its token. Request a new one below.
            </p>
            <Link to="/admin/forgot-password" className={styles.backLink}>Request a new link</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>


            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>

            <Link to="/admin/login" className={styles.backLink}><FontAwesomeIcon icon={faArrowLeft} /> Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}
