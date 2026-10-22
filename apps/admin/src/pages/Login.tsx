import { useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { WebAuthnAbortService } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth';
import { fetchSetupStatus } from '../services/auth';
import { fetchPublicSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import { completeEnrollment, startEnrollment } from '../services/mfa';
import {
  browserSupportsWebAuthnAutofill, enrollPasskeyAtLogin, passkeyError, passkeysSupported, SessionResult,
  signInWithPasskey, verifyWithPasskey,
} from '../services/passkeys';
import { MfaMethod } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFeather, faFingerprint, faMobileScreen } from '@fortawesome/free-solid-svg-icons';
import styles from './Login.module.css';

type Step = 'credentials' | 'totp' | 'passkey' | 'backup' | 'enroll' | 'enrollTotp' | 'backupCodes';

const EMPTY_OTP = ['', '', '', '', '', ''];

function errMsg(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [methods, setMethods] = useState<MfaMethod[]>([]);
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [backupCode, setBackupCode] = useState('');
  const [enrollQr, setEnrollQr] = useState('');
  const [enrollSecret, setEnrollSecret] = useState('');
  // A session held back until the new backup codes have been seen.
  const [pending, setPending] = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [logo, setLogo] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [title, setTitle] = useState('');
  const [autofillRun, setAutofillRun] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const toast = useToast();
  const { login, completeMfaLogin, completeMfaBackupLogin, startSession } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const canPasskey = passkeysSupported();

  useEffect(() => {
    fetchSetupStatus()
      .then((status) => setNeedsSetup(status.needsSetup))
      .catch(() => setNeedsSetup(false))
      .finally(() => setCheckingSetup(false));
    fetchPublicSettings()
      .then((s) => { setLogo(s.site_logo || ''); setLogoDark(s.site_logo_dark || ''); setTitle(s.site_title || ''); })
      .catch(() => {});
  }, []);

  // Passkey autofill: the browser lists this site's passkeys under the
  // username field, and picking one signs straight in.
  useEffect(() => {
    if (step !== 'credentials' || checkingSetup || needsSetup) return;
    let active = true;
    browserSupportsWebAuthnAutofill().then((supported) => {
      if (!supported || !active) return;
      signInWithPasskey(true)
        .then((session) => { if (active) finishSession(session); })
        .catch((err) => {
          const message = active ? passkeyError(err, 'Passkey sign-in failed') : null;
          if (message) toast.error(message);
        });
    }).catch(() => {});
    return () => {
      active = false;
      WebAuthnAbortService.cancelCeremony();
    };
  }, [step, checkingSetup, needsSetup, autofillRun]);

  const activeLogo = (theme === 'dark' && logoDark) ? logoDark : logo;

  function finishSession(session: SessionResult) {
    if (session.backupCodes?.length) {
      setPending(session);
      setStep('backupCodes');
      return;
    }
    startSession(session);
    navigate('/admin');
  }

  function focusOtp() {
    setOtp(EMPTY_OTP);
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  }

  function goTo(next: Step) {
    setStep(next);
    if (next === 'totp' || next === 'enrollTotp') focusOtp();
  }

  function secondStep(available: MfaMethod[]): Step {
    if (available.includes('totp')) return 'totp';
    if (available.includes('passkey') && canPasskey) return 'passkey';
    if (available.includes('backup')) return 'backup';
    return available.includes('passkey') ? 'passkey' : 'totp';
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result?.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMethods(result.methods);
        goTo(result.setupRequired ? 'enroll' : secondStep(result.methods));
      } else {
        navigate('/admin');
      }
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeySignIn() {
    setLoading(true);
    try {
      finishSession(await signInWithPasskey());
    } catch (err) {
      const message = passkeyError(err, 'Passkey sign-in failed');
      if (message) toast.error(message);
      setAutofillRun((n) => n + 1);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyStep() {
    setLoading(true);
    try {
      finishSession(await verifyWithPasskey(mfaToken));
    } catch (err) {
      const message = passkeyError(err, 'Passkey check failed');
      if (message) toast.error(message);
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
      submitOtp(next.join(''));
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
      submitOtp(pasted);
    }
  }

  async function submitOtp(code: string) {
    setLoading(true);
    try {
      if (step === 'enrollTotp') {
        finishSession(await completeEnrollment(mfaToken, code));
      } else {
        await completeMfaLogin(mfaToken, code);
        navigate('/admin');
      }
    } catch (err: unknown) {
      toast.error(errMsg(err, 'Invalid code'));
      focusOtp();
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
      toast.error(errMsg(err, 'Invalid backup code'));
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrollApp() {
    setLoading(true);
    try {
      const data = await startEnrollment(mfaToken);
      setEnrollQr(data.qrCodeDataUrl);
      setEnrollSecret(data.secret);
      goTo('enrollTotp');
    } catch (err) {
      toast.error(errMsg(err, 'Could not start setup'));
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrollPasskey() {
    setLoading(true);
    try {
      finishSession(await enrollPasskeyAtLogin(mfaToken));
    } catch (err) {
      const message = passkeyError(err, 'Could not add the passkey');
      if (message) toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setMfaToken('');
    setBackupCode('');
    setStep('credentials');
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(pending?.backupCodes?.join('\n') ?? '')
      .then(() => toast.success('Backup codes copied'), () => toast.error('Could not copy'));
  }

  if (checkingSetup) return null;
  if (needsSetup) return <Navigate to="/admin/setup" replace />;

  const otpBoxes = (
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
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );

  const otherWays = (
    <>
      {step !== 'passkey' && methods.includes('passkey') && canPasskey && (
        <button type="button" className={styles.backupLink} onClick={() => goTo('passkey')}>
          Use a passkey instead
        </button>
      )}
      {step !== 'totp' && methods.includes('totp') && (
        <button type="button" className={styles.backupLink} onClick={() => goTo('totp')}>
          Use your authenticator app instead
        </button>
      )}
      {step !== 'backup' && methods.includes('backup') && (
        <button type="button" className={styles.backupLink} onClick={() => goTo('backup')}>
          Use a backup code instead
        </button>
      )}
      <button type="button" className={styles.backupLink} onClick={backToLogin}>
        ← Back to login
      </button>
    </>
  );

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
            {(step === 'totp' || step === 'passkey') && 'Two-factor authentication'}
            {step === 'backup' && 'Use a backup code'}
            {(step === 'enroll' || step === 'enrollTotp') && 'Set up two-step sign-in'}
            {step === 'backupCodes' && 'Save your backup codes'}
          </h2>
        </div>

        {step === 'credentials' && (
          <>
            <form onSubmit={handleCredentials}>
              <div className={styles.formGroup}>
                <label htmlFor="login-identifier">Email or username</label>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or username"
                  autoComplete="username webauthn"
                  required
                  disabled={loading}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            {canPasskey && (
              <>
                <div className={styles.divider}><span>or</span></div>
                <button type="button" className={styles.secondaryButton} onClick={handlePasskeySignIn} disabled={loading}>
                  <FontAwesomeIcon icon={faFingerprint} /> Sign in with a passkey
                </button>
              </>
            )}
          </>
        )}

        {step === 'totp' && (
          <div>
            <p className={styles.mfaHint}>
              Open your authenticator app and enter the 6-digit code for this account.
            </p>
            {otpBoxes}
            <button
              type="button"
              className={styles.button}
              disabled={loading || otp.some((d) => !d)}
              onClick={() => submitOtp(otp.join(''))}
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            {otherWays}
          </div>
        )}

        {step === 'passkey' && (
          <div>
            <p className={styles.mfaHint}>
              {canPasskey
                ? 'Confirm it’s you with one of your passkeys — your fingerprint, face, screen lock or security key.'
                : 'This browser can’t use passkeys. Use another way to sign in, or switch browsers.'}
            </p>
            {canPasskey && (
              <button type="button" className={styles.button} disabled={loading} onClick={handlePasskeyStep}>
                <FontAwesomeIcon icon={faFingerprint} /> {loading ? 'Waiting for passkey…' : 'Use passkey'}
              </button>
            )}
            {otherWays}
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
              aria-label="Backup code"
            />
            <button type="submit" disabled={loading || !backupCode.trim()} className={styles.button}>
              {loading ? 'Verifying…' : 'Use backup code'}
            </button>
            {otherWays}
          </form>
        )}

        {step === 'enroll' && (
          <div>
            <p className={styles.mfaHint}>
              Your role requires a second step when you sign in. Choose how you’ll confirm it’s you.
            </p>
            <div className={styles.choices}>
              {canPasskey && (
                <button type="button" className={styles.choice} onClick={handleEnrollPasskey} disabled={loading}>
                  <FontAwesomeIcon icon={faFingerprint} className={styles.choiceIcon} />
                  <span>
                    <strong>Add a passkey</strong>
                    <small>Use your fingerprint, face, screen lock or a security key.</small>
                  </span>
                </button>
              )}
              <button type="button" className={styles.choice} onClick={handleEnrollApp} disabled={loading}>
                <FontAwesomeIcon icon={faMobileScreen} className={styles.choiceIcon} />
                <span>
                  <strong>Use an authenticator app</strong>
                  <small>Enter a 6-digit code from an app such as Google Authenticator or 1Password.</small>
                </span>
              </button>
            </div>
            <button type="button" className={styles.backupLink} onClick={backToLogin}>
              ← Back to login
            </button>
          </div>
        )}

        {step === 'enrollTotp' && (
          <div>
            <p className={styles.mfaHint}>
              Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
            </p>
            <div className={styles.qr}>
              <img src={enrollQr} alt="QR code for your authenticator app" />
              <span className={styles.secret}>{enrollSecret}</span>
            </div>
            {otpBoxes}
            <button
              type="button"
              className={styles.button}
              disabled={loading || otp.some((d) => !d)}
              onClick={() => submitOtp(otp.join(''))}
            >
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
            <button type="button" className={styles.backupLink} onClick={() => setStep('enroll')}>
              ← Choose another way
            </button>
          </div>
        )}

        {step === 'backupCodes' && pending?.backupCodes && (
          <div>
            <p className={styles.mfaHint}>
              If you ever lose your passkey or phone, each of these codes signs you in once. Store them somewhere safe — they won’t be shown again.
            </p>
            <div className={styles.codes}>
              {pending.backupCodes.map((code) => <span key={code}>{code}</span>)}
            </div>
            <button type="button" className={styles.secondaryButton} onClick={copyBackupCodes}>
              Copy codes
            </button>
            <button type="button" className={styles.button} onClick={() => finishSession({ ...pending, backupCodes: undefined })}>
              I’ve saved them — continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
