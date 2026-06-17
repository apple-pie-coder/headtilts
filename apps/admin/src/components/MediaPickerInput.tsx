import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { MediaLibraryModal } from './MediaLibraryModal';
import { resolveMediaUrl } from '../services/media';
import styles from './MediaPickerInput.module.css';

interface MediaPickerInputProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

export function MediaPickerInput({ value, onChange, disabled, placeholder = 'Paste URL or choose from library…', label }: MediaPickerInputProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className={styles.root}>
      {label && <span className={styles.label}>{label}</span>}

      {value && (
        <div className={styles.preview}>
          <img src={resolveMediaUrl(value)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      )}

      <div className={styles.row}>
        <input
          type="text"
          className={styles.urlInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          className={styles.chooseBtn}
          onClick={() => setModalOpen(true)}
          disabled={disabled}
          title="Choose from media library"
        >
          Choose
        </button>
        {value && (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange('')}
            disabled={disabled}
            title="Remove"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
      </div>

      {modalOpen && (
        <MediaLibraryModal
          onSelect={(media) => {
            onChange(media.url);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
