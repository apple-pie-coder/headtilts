import { useEffect, useRef, useState } from 'react';
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

type Step = 'credentials' | 'totp' | 'backup';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [logo, setLogo] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [title, setTitle] = useState('');

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const toast = useToast();
  const { login, completeMfaLogin, completeMfaBackupLogin } = useAuth();
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

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result?.mfaRequired) {
        setMfaToken(result.mfaToken);
        setStep('totp');
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
      } else {
        navigate('/admin');
      }
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Login failed',
      );
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.every((d) => d !== '')) {
      submitTotp(next.join(''));
    }
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setOtp(pasted.split(''));
      submitTotp(pasted);
    }
  }

  async function submitTotp(code: string) {
    setLoading(true);
    try {
      await completeMfaLogin(mfaToken, code);
      navigate('/admin');
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Invalid code',
      );
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  async function handleBackupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await completeMfaBackupLogin(mfaToken, backupCode.trim());
      navigate('/admin');
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Invalid backup code',
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) return null;
  if (needsSetup) return <Navigate to="/admin/setup" replace />;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          {activeLogo ? (
            <img className={styles.logoImg} src={resolveMediaUrl(activeLogo)} alt={title || 'Logo'} />
          ) : (
            <span className={styles.logoIcon}><FontAwesomeIcon icon={faFeather} /></span>
          )}
          <h2>
            {step === 'credentials' && 'Sign in to your account'}
            {step === 'totp' && 'Two-factor authentication'}
            {step === 'backup' && 'Use a backup code'}
          </h2>
        </div>

        {step === 'credentials' && (
          <form onSubmit={handleCredentials}>
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
        )}

        {step === 'totp' && (
          <div>
            <p className={styles.mfaHint}>
              Open your authenticator app and enter the 6-digit code for this account.
            </p>
            <div className={styles.otpRow} onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  className={styles.otpBox}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              ))}
            </div>
            <button
              type="button"
              className={styles.button}
              disabled={loading || otp.some((d) => !d)}
              onClick={() => submitTotp(otp.join(''))}
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" className={styles.backupLink} onClick={() => setStep('backup')}>
              Use a backup code instead
            </button>
            <button type="button" className={styles.backupLink} onClick={() => setStep('credentials')}>
              ← Back to login
            </button>
          </div>
        )}

        {step === 'backup' && (
          <form onSubmit={handleBackupSubmit}>
            <p className={styles.mfaHint}>
              Enter one of the backup codes you saved when you set up two-factor authentication.
            </p>
            <input
              className={styles.backupInput}
              type="text"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="XXXXXXXXXX"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !backupCode.trim()} className={styles.button}>
              {loading ? 'Verifying…' : 'Use backup code'}
            </button>
            <button type="button" className={styles.backupLink} onClick={() => setStep('totp')}>
              ← Use authenticator app instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
