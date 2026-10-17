import { useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { youtubeId } from '@headtilts/shared';
import styles from './editorExtras.module.css';

/** Featured YouTube video: paste any YouTube link, see the thumbnail straight away. */
export function VideoField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  const vid = value ? youtubeId(value) : null;
  return (
    <div className={styles.video}>
      <label htmlFor={id} className={styles.fieldLabel}>YouTube link</label>
      <input
        id={id}
        type="url"
        className={styles.input}
        placeholder="https://youtu.be/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {value && !vid && <span className={styles.videoError}>That isn’t a YouTube video link.</span>}
      {vid && (
        <>
          <a className={styles.videoThumb} href={`https://www.youtube.com/watch?v=${vid}`} target="_blank" rel="noopener noreferrer" title="Open on YouTube">
            <img src={`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`} alt="" />
            <span className={styles.videoPlay}><FontAwesomeIcon icon={faPlay} /></span>
          </a>
          <button type="button" className={styles.linkButton} onClick={() => onChange('')} disabled={disabled}>Remove video</button>
        </>
      )}
      <span className={styles.help}>Shown at the top of the post with a click-to-play player. YouTube only loads when a reader presses play.</span>
    </div>
  );
}
