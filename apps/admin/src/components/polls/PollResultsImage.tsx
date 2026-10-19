import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faDownload, faShareNodes, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Button, uiStyles } from '../ui';
import { useToast } from '../ToastContext';
import { fetchPollResultsImage, Poll, PollImageFormat } from '../../services/polls';
import styles from './PollResultsImage.module.css';

const FORMATS: { id: PollImageFormat; label: string; size: string; hint: string }[] = [
  { id: 'square', label: 'Square', size: '1080 × 1080', hint: 'Instagram and Facebook feeds' },
  { id: 'story', label: 'Story', size: '1080 × 1920', hint: 'Instagram and WhatsApp status' },
  { id: 'wide', label: 'Landscape', size: '1200 × 630', hint: 'X, Facebook and LinkedIn posts' },
];

/** Preview and download a finished poll's results as an image for social media. */
export function PollResultsImage({ poll, onClose }: { poll: Pick<Poll, 'id' | 'slug' | 'title'>; onClose: () => void }) {
  const toast = useToast();
  const [format, setFormat] = useState<PollImageFormat>('square');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let url = '';
    setImage(null);
    setError('');
    fetchPollResultsImage(poll.id, format)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(async (err) => {
        // Errors arrive as a Blob because of responseType: 'blob'.
        const data = err?.response?.data;
        const message = data instanceof Blob ? JSON.parse(await data.text().catch(() => '{}'))?.error?.message : undefined;
        if (!cancelled) setError(message || 'Couldn’t create the image');
      });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [poll.id, format]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filename = `${poll.slug}-results-${format}.png`;
  const file = image ? new File([image.blob], filename, { type: 'image/png' }) : null;
  // Copying images needs a secure (https) page; sharing files needs a phone/tablet browser that supports it.
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write && window.isSecureContext;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  async function copy() {
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image.blob })]);
      toast.success('Image copied — paste it into your post');
    } catch {
      toast.error('Couldn’t copy the image; download it instead');
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: poll.title });
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') toast.error('Couldn’t open the share sheet');
    }
  }

  return createPortal(
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="poll-image-title">
        <header className={styles.head}>
          <div>
            <h2 id="poll-image-title">Results image</h2>
            <p>{poll.title}</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>

        <div className={styles.formats} role="radiogroup" aria-label="Image size">
          {FORMATS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`${styles.format} ${format === f.id ? styles.formatOn : ''}`} onClick={() => setFormat(f.id)}>
              <span className={`${styles.shape} ${styles[`shape_${f.id}`]}`} aria-hidden="true" />
              <span className={styles.formatText}>
                <strong>{f.label}</strong>
                <small>{f.hint}</small>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.preview}>
          {image && <img src={image.url} alt={`Results of “${poll.title}”`} className={styles[`img_${format}`]} />}
          {!image && !error && <div className={`${styles.placeholder} ${styles[`img_${format}`]}`} aria-label="Creating image" />}
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.foot}>
          <span className={styles.size}>{FORMATS.find((f) => f.id === format)!.size} px · PNG</span>
          {canShare && <Button icon={faShareNodes} onClick={share} disabled={!image}>Share</Button>}
          {canCopy && <Button icon={faCopy} onClick={copy} disabled={!image}>Copy image</Button>}
          {image ? (
            <a className={`${uiStyles.btn} ${uiStyles.btn_primary}`} href={image.url} download={filename}>
              <FontAwesomeIcon icon={faDownload} className={uiStyles.btnIcon} />Download
            </a>
          ) : (
            <Button variant="primary" icon={faDownload} disabled>Download</Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
