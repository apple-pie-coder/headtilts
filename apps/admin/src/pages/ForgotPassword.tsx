import { useState } from 'react';
import { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/auth';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFeather, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import styles from './Login.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Request failed. Please try again.',
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
          <h2>Reset your password</h2>
        </div>

        {sent ? (
          <>
            <p className={styles.infoText}>
              If an account exists for <strong>{email}</strong>, a reset link has been sent.
              The link expires in 1 hour.
            </p>
            <Link to="/admin/login" className={styles.backLink}><FontAwesomeIcon icon={faArrowLeft} /> Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>


            <button type="submit" disabled={loading} className={styles.button}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link to="/admin/login" className={styles.backLink}><FontAwesomeIcon icon={faArrowLeft} /> Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  );
}
