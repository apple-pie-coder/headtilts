import { FormEvent, useState } from 'react';
import { AxiosError } from 'axios';
import { Celebration } from '../types';
import { createCelebration, updateCelebration, CelebrationInput } from '../services/celebrations';
import { MediaPickerInput } from './MediaPickerInput';
import { useToast } from './ToastContext';
import styles from './CelebrationForm.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();

interface CelebrationFormProps {
  celebration: Celebration | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function CelebrationForm({ celebration, onSaved, onCancel }: CelebrationFormProps) {
  const isEditing = !!celebration;
  const toast = useToast();

  const [name, setName] = useState(celebration?.name || '');
  const [type, setType] = useState<'birthday' | 'remembrance'>(celebration?.type || 'birthday');
  const [month, setMonth] = useState(celebration?.month || now.getMonth() + 1);
  const [day, setDay] = useState(celebration?.day || now.getDate());
  const [year, setYear] = useState(celebration?.year ? String(celebration.year) : '');
  const [photo, setPhoto] = useState(celebration?.photo || '');
  const [message, setMessage] = useState(celebration?.message || '');
  const [isActive, setIsActive] = useState(celebration?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  // Days available for the selected month (29 allowed for Feb)
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const input: CelebrationInput = {
      name,
      type,
      month,
      day: Math.min(day, daysInMonth),
      year: year ? Number(year) : null,
      photo: photo || null,
      message: message || null,
      isActive,
    };

    try {
      if (isEditing && celebration) {
        await updateCelebration(celebration.id, input);
      } else {
        await createCelebration(input);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to save celebration'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3>{isEditing ? 'Edit Celebration' : 'Add Celebration'}</h3>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label>Artist / Band Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Freddie Mercury"
            required
            disabled={saving}
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label>Type</label>
          <div className={styles.typeToggle}>
            <button
              type="button"
              className={`${styles.typeButton} ${type === 'birthday' ? styles.typeButtonActive : ''}`}
              onClick={() => setType('birthday')}
              disabled={saving}
            >
              🎂 Birthday
            </button>
            <button
              type="button"
              className={`${styles.typeButton} ${type === 'remembrance' ? styles.typeButtonActive : ''}`}
              onClick={() => setType('remembrance')}
              disabled={saving}
            >
              🕯️ Remembrance
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.formGroup}>
            <label>Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={saving}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Day</label>
            <select value={Math.min(day, daysInMonth)} onChange={(e) => setDay(Number(e.target.value))} disabled={saving}>
              {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label>{type === 'birthday' ? 'Birth year' : 'Year of passing'} <span className={styles.optional}>(optional)</span></label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="e.g. 1946"
            min={1000}
            max={9999}
            disabled={saving}
          />
          <p className={styles.hint}>
            {type === 'birthday'
              ? 'Used to show their age (e.g. "would be 79").'
              : 'Used to show years since (e.g. "34 years on").'}
          </p>
        </div>

        <div className={styles.formGroup}>
          <label>Photo</label>
          <MediaPickerInput value={photo} onChange={setPhoto} disabled={saving} />
        </div>

        <div className={styles.formGroup}>
          <label>Message <span className={styles.optional}>(optional)</span></label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Custom wish or tribute. Leave blank for a default message."
            disabled={saving}
          />
        </div>

        <label className={styles.checkRow}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving} />
          <span>Active (show on the public site)</span>
        </label>

        <div className={styles.actions}>
          {isEditing && (
            <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Celebration'}
          </button>
        </div>
      </form>
    </div>
  );
}
