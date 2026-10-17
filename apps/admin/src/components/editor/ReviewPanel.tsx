import { KeyboardEvent, useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompactDisc, faXmark, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { STREAMING_SERVICES, detectStreamingService, ratingWord, toEmbed } from '@headtilts/shared';
import type { StreamingService } from '@headtilts/shared';
import { MediaPickerInput } from '../MediaPickerInput';
import { resolveMediaUrl } from '../../services/media';
import type { Review, ReviewSubject, ReviewTrack } from '../../types';
import { STREAMING_ICONS } from './streamingIcons';
import styles from './editorExtras.module.css';

export const EMPTY_REVIEW: Review = {
  subjectType: 'album', subjectTitle: '', artist: '', releaseDate: null, label: null, genre: null,
  coverImage: null, rating: null, verdict: null, highlights: null, tracklist: null, streaming: null,
};

const SUBJECTS: { value: ReviewSubject; label: string }[] = [
  { value: 'album', label: 'Album' },
  { value: 'ep', label: 'EP' },
  { value: 'single', label: 'Single / track' },
];

const tracksToText = (t: ReviewTrack[] | null) => (t ?? []).map((x) => (x.duration ? `${x.title} — ${x.duration}` : x.title)).join('\n');

/** "1. Title — 4:05", "Title (4:05)", "Title - 4:05" → { title, duration } */
function parseTracks(text: string): ReviewTrack[] {
  return text.split('\n').map((line) => {
    const clean = line.replace(/^\s*\d+[.)]\s*/, '').trim();
    const m = clean.match(/^(.*?)\s*(?:[—–-]\s*|\()(\d{1,2}:\d{2})\)?\s*$/);
    return m ? { title: m[1].trim(), duration: m[2] } : { title: clean, duration: null };
  }).filter((t) => t.title);
}

export function ReviewPanel({ value, onChange, featuredImage, disabled }: {
  value: Review;
  onChange: (next: Review) => void;
  featuredImage: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const [trackText, setTrackText] = useState(() => tracksToText(value.tracklist));
  const [highlight, setHighlight] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const set = <K extends keyof Review>(key: K, v: Review[K]) => onChange({ ...value, [key]: v });
  const cover = value.coverImage || featuredImage;
  const streaming = value.streaming ?? {};
  const subjectNoun = value.subjectType === 'single' ? 'Track' : value.subjectType === 'ep' ? 'EP' : 'Album';

  function addHighlight() {
    const h = highlight.trim();
    if (!h) return;
    const list = value.highlights ?? [];
    if (!list.includes(h)) set('highlights', [...list, h]);
    setHighlight('');
  }

  function addLink(raw: string) {
    const url = raw.trim();
    if (!url) return;
    const service = detectStreamingService(url);
    if (!service) {
      setPasteError('Not a link we recognise. Try Spotify, Apple Music, YouTube, Bandcamp, SoundCloud, Deezer, TIDAL or Amazon Music.');
      return;
    }
    set('streaming', { ...streaming, [service]: url });
    setPaste('');
    setPasteError(null);
  }

  function removeLink(key: string) {
    const next = { ...streaming };
    delete next[key];
    set('streaming', Object.keys(next).length ? next : null);
  }

  const onPasteKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addLink(paste); }
  };

  return (
    <section className={styles.reviewPanel} aria-label="Review details">
      <div className={styles.reviewHead}>
        <h3 className={styles.reviewTitle}><FontAwesomeIcon icon={faCompactDisc} /> Review details</h3>
        <div className={styles.subjectSwitch} role="radiogroup" aria-label="What are you reviewing?">
          {SUBJECTS.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={value.subjectType === s.value}
              className={`${styles.chipToggle} ${value.subjectType === s.value ? styles.chipToggleOn : ''}`}
              onClick={() => set('subjectType', s.value)} disabled={disabled}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className={styles.reviewTop}>
        <div>
          <div className={styles.cover}>
            {cover ? <img src={resolveMediaUrl(cover)} alt="" /> : <span>No cover yet</span>}
          </div>
          <div className={styles.coverActions}>
            {!value.coverImage && featuredImage && <span className={styles.help}>Using the featured image</span>}
          </div>
        </div>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor={`${uid}-artist`}>Artist</label>
            <input id={`${uid}-artist`} className={styles.input} value={value.artist} onChange={(e) => set('artist', e.target.value)}
              placeholder="e.g. Gojira" disabled={disabled} autoComplete="off" />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${uid}-title`}>{subjectNoun} title</label>
            <input id={`${uid}-title`} className={styles.input} value={value.subjectTitle} onChange={(e) => set('subjectTitle', e.target.value)}
              placeholder={value.subjectType === 'single' ? 'e.g. Amazonia' : 'e.g. Fortitude'} disabled={disabled} autoComplete="off" />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${uid}-date`}>Release date <span className={styles.optional}>(optional)</span></label>
            <input id={`${uid}-date`} type="date" className={styles.input} value={value.releaseDate?.slice(0, 10) ?? ''}
              onChange={(e) => set('releaseDate', e.target.value || null)} disabled={disabled} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${uid}-label`}>Label <span className={styles.optional}>(optional)</span></label>
            <input id={`${uid}-label`} className={styles.input} value={value.label ?? ''} onChange={(e) => set('label', e.target.value || null)}
              placeholder="e.g. Roadrunner" disabled={disabled} />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${uid}-genre`}>Genre <span className={styles.optional}>(optional)</span></label>
            <input id={`${uid}-genre`} className={styles.input} value={value.genre ?? ''} onChange={(e) => set('genre', e.target.value || null)}
              placeholder="e.g. Progressive death metal" disabled={disabled} />
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Cover art <span className={styles.optional}>(defaults to featured image)</span></span>
            <MediaPickerInput value={value.coverImage ?? ''} onChange={(url) => set('coverImage', url || null)} disabled={disabled} />
          </div>
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${uid}-rating`}>Rating</label>
        <div className={styles.rating}>
          <span className={`${styles.ratingValue} ${value.rating == null ? styles.ratingEmpty : ''}`}>
            {value.rating != null ? value.rating.toFixed(1).replace(/\.0$/, '') : '–'}<small>/10</small>
          </span>
          <div className={styles.ratingMeta}>
            <span className={styles.ratingWord}>{value.rating != null ? ratingWord(value.rating) : 'Not rated yet — drag to score'}</span>
            {value.rating != null && <button type="button" className={styles.linkButton} onClick={() => set('rating', null)} disabled={disabled}>Clear</button>}
          </div>
          <input id={`${uid}-rating`} type="range" min={0} max={10} step={0.5} className={styles.range}
            value={value.rating ?? 5} onChange={(e) => set('rating', Number(e.target.value))}
            aria-valuetext={value.rating != null ? `${value.rating} out of 10, ${ratingWord(value.rating)}` : 'Not rated'} disabled={disabled} />
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldTop}>
          <label htmlFor={`${uid}-verdict`}>Verdict</label>
          <span className={styles.meterText}>{(value.verdict ?? '').length}/300</span>
        </div>
        <input id={`${uid}-verdict`} className={styles.input} maxLength={300} value={value.verdict ?? ''}
          onChange={(e) => set('verdict', e.target.value || null)}
          placeholder="One sentence that sums the record up" disabled={disabled} />
        <span className={styles.help}>Shown in the review card at the top of the post and in listings.</span>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${uid}-hl`}>Standout tracks <span className={styles.optional}>(press Enter to add)</span></label>
        {(value.highlights?.length ?? 0) > 0 && (
          <div className={styles.chips}>
            {value.highlights!.map((h) => (
              <span key={h} className={styles.chip}>{h}
                <button type="button" aria-label={`Remove ${h}`} disabled={disabled}
                  onClick={() => set('highlights', value.highlights!.filter((x) => x !== h).length ? value.highlights!.filter((x) => x !== h) : null)}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </span>
            ))}
          </div>
        )}
        <input id={`${uid}-hl`} className={styles.input} value={highlight} onChange={(e) => setHighlight(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addHighlight(); } }}
          onBlur={addHighlight} placeholder="Track name" disabled={disabled} />
      </div>

      {value.subjectType !== 'single' && (
        <div className={styles.field}>
          <label htmlFor={`${uid}-tracks`}>Tracklist <span className={styles.optional}>(optional, one per line)</span></label>
          <textarea id={`${uid}-tracks`} className={styles.textarea} rows={4} value={trackText} disabled={disabled}
            placeholder={'Born for One Thing — 4:20\nAmazonia — 5:02'}
            onChange={(e) => { setTrackText(e.target.value); set('tracklist', parseTracks(e.target.value).length ? parseTracks(e.target.value) : null); }} />
          <span className={styles.help}>Add a length after a dash or in brackets — it’s optional.</span>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor={`${uid}-paste`}>Listen links</label>
        {Object.keys(streaming).length > 0 && (
          <div className={styles.streamList}>
            {STREAMING_SERVICES.filter((s) => streaming[s.key]).map((s) => (
              <div key={s.key} className={styles.streamRow}>
                <span className={styles.streamIcon} style={{ background: s.color }} aria-hidden="true"><FontAwesomeIcon icon={STREAMING_ICONS[s.key]} /></span>
                <span className={styles.streamName}>{s.label}</span>
                <a className={styles.streamUrl} href={streaming[s.key]} target="_blank" rel="noopener noreferrer" title={streaming[s.key]}>{streaming[s.key]}</a>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {toEmbed(streaming[s.key]!) && <span className={styles.streamPlayable} title="Readers can play this on the page">Player</span>}
                  <button type="button" className={styles.iconButton} aria-label={`Remove ${s.label} link`} onClick={() => removeLink(s.key)} disabled={disabled}>
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className={styles.pasteRow}>
          <input id={`${uid}-paste`} className={styles.input} type="url" value={paste} disabled={disabled}
            placeholder="Paste a Spotify, Apple Music, Bandcamp… link"
            onChange={(e) => { setPaste(e.target.value); setPasteError(null); }}
            onPaste={(e) => { const t = e.clipboardData.getData('text'); if (detectStreamingService(t)) { e.preventDefault(); addLink(t); } }}
            onKeyDown={onPasteKey} />
          <button type="button" className={styles.chipToggle} onClick={() => addLink(paste)} disabled={disabled || !paste.trim()}>Add</button>
        </div>
        {pasteError
          ? <span className={styles.pasteError} role="alert">{pasteError}</span>
          : (
            <span className={styles.serviceHints} aria-hidden="true">
              {(['spotify', 'appleMusic', 'youtube', 'bandcamp', 'soundcloud', 'deezer', 'tidal', 'amazonMusic'] as StreamingService[]).map((k) => (
                <FontAwesomeIcon key={k} icon={STREAMING_ICONS[k]} title={STREAMING_SERVICES.find((s) => s.key === k)?.label} />
              ))}
            </span>
          )}
        <span className={styles.help}>The service is detected automatically. The first link that supports it becomes the on-page player.</span>
      </div>
    </section>
  );
}
