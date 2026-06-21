import { FormEvent, useState } from 'react';
import { recordShareClick } from '../services/polls';
import './ShareRecipientBanner.css';

interface Props {
  token: string;
  onDone: () => void;
}

const GENDERS = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'];

export function ShareRecipientBanner({ token, onDone }: Props) {
  const [name,       setName]       = useState('');
  const [gender,     setGender]     = useState('');
  const [age,        setAge]        = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function send(skip = false) {
    setSubmitting(true);
    try {
      await recordShareClick(token, skip ? {} : {
        name:   name.trim()   || undefined,
        gender: gender        || undefined,
        age:    age ? Number(age) : undefined,
      });
    } catch { /* silent */ } finally {
      onDone();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(false);
  }

  return (
    <div className="srb-overlay">
      <div className="srb-modal" role="dialog" aria-modal="true" aria-label="Tell us about yourself">
        <div className="srb-icon-row">
          <span className="srb-icon">👋</span>
        </div>

        <h2 className="srb-heading">Someone shared this poll with you</h2>
        <p className="srb-sub">
          Tell us a little about yourself to help them understand who responded.
          All fields are completely optional.
        </p>

        <form className="srb-form" onSubmit={handleSubmit}>
          <div className="srb-fields">
            <div className="srb-field">
              <label htmlFor="srb-name">Name</label>
              <input
                id="srb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={submitting}
                autoComplete="given-name"
              />
            </div>
            <div className="srb-field">
              <label htmlFor="srb-gender">Gender</label>
              <select
                id="srb-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={submitting}
              >
                <option value="">Select…</option>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="srb-field">
              <label htmlFor="srb-age">Age</label>
              <input
                id="srb-age"
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 28"
                disabled={submitting}
              />
            </div>
          </div>

          <p className="srb-privacy">
            🔒 This data is collected for analytics only and is completely optional. We do not share it with third parties.
          </p>

          <div className="srb-actions">
            <button
              type="button"
              className="srb-btn-skip"
              onClick={() => send(true)}
              disabled={submitting}
            >
              Skip
            </button>
            <button
              type="submit"
              className="srb-btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Submit & continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
