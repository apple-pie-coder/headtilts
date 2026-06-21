import { FormEvent, useRef, useState } from 'react';
import { createShare } from '../services/polls';
import './SharePollModal.css';

interface Props {
  slug: string;
  title: string;
  onClose: () => void;
}

const CHANNELS = [
  { id: 'link',      label: 'Copy Link',    icon: '🔗' },
  { id: 'twitter',   label: 'Twitter / X',  icon: '𝕏'  },
  { id: 'whatsapp',  label: 'WhatsApp',     icon: '💬' },
  { id: 'linkedin',  label: 'LinkedIn',     icon: 'in' },
  { id: 'email',     label: 'Email',        icon: '✉️' },
  { id: 'facebook',  label: 'Facebook',     icon: 'f'  },
];

function getVoterId(): string {
  const key = 'headtilts_voter_id';
  return localStorage.getItem(key) ?? '';
}

function buildPollUrl(slug: string, token: string): string {
  return `${window.location.origin}/polls/${slug}?ref=${token}`;
}

export function SharePollModal({ slug, title, onClose }: Props) {
  const [recipientName,  setRecipientName]  = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note,           setNote]           = useState('');
  const [copied,         setCopied]         = useState(false);
  const [busy,           setBusy]           = useState(false);
  const [error,          setError]          = useState('');
  const copyRef = useRef<string>('');

  async function getToken(channel: string): Promise<string> {
    setBusy(true);
    setError('');
    try {
      const { token } = await createShare(slug, {
        channel,
        sharerIdentifier: getVoterId() || undefined,
        recipientEmail:   recipientEmail.trim() || undefined,
        recipientName:    recipientName.trim() || undefined,
        note:             note.trim() || undefined,
      });
      return token;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      const token = await getToken('link');
      const url = buildPollUrl(slug, token);
      copyRef.current = url;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  async function handleSocial(channel: string) {
    try {
      const token = await getToken(channel);
      const url = buildPollUrl(slug, token);
      const encodedUrl = encodeURIComponent(url);
      const encodedTitle = encodeURIComponent(`Vote: ${title}`);

      let shareUrl = '';
      if (channel === 'twitter')  shareUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
      if (channel === 'whatsapp') shareUrl = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;
      if (channel === 'linkedin') shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      if (channel === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      if (channel === 'email')    shareUrl = `mailto:${recipientEmail}?subject=${encodedTitle}&body=${encodeURIComponent(`${note ? note + '\n\n' : ''}Vote here: ${url}`)}`;

      if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
    } catch {}
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    handleCopy();
  }

  return (
    <div className="spm-overlay">
      <div className="spm-modal" role="dialog" aria-modal="true" aria-label="Share poll">
        <div className="spm-header">
          <h2 className="spm-title">Share this poll</h2>
          <button className="spm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="spm-poll-name">"{title}"</p>

        <form className="spm-form" onSubmit={handleSubmit}>
          <div className="spm-row">
            <div className="spm-field">
              <label>Recipient name <span className="spm-opt">(optional)</span></label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Alex"
                disabled={busy}
              />
            </div>
            <div className="spm-field">
              <label>Recipient email <span className="spm-opt">(optional)</span></label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="alex@example.com"
                disabled={busy}
              />
            </div>
          </div>
          <div className="spm-field">
            <label>Message <span className="spm-opt">(optional)</span></label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What would you like to add?"
              disabled={busy}
            />
          </div>
        </form>

        {error && <p className="spm-error">{error}</p>}

        <div className="spm-channels">
          {CHANNELS.map((ch) => (
            <button
              key={ch.id}
              className={`spm-channel-btn${ch.id === 'link' && copied ? ' spm-channel-btn--copied' : ''}`}
              disabled={busy}
              onClick={() => ch.id === 'link' ? handleCopy() : handleSocial(ch.id)}
            >
              <span className="spm-channel-icon">{ch.icon}</span>
              <span className="spm-channel-label">
                {ch.id === 'link' ? (copied ? 'Copied!' : 'Copy Link') : ch.label}
              </span>
            </button>
          ))}
        </div>

        <p className="spm-note">Each link is unique and tracked so you can see who clicked it.</p>
      </div>
    </div>
  );
}
