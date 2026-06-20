import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useToast } from '../components/ToastContext';
import { fetchPoll, createPoll, updatePoll, PollInput, PollOption } from '../services/polls';
import { slugify } from '@headtilts/shared';
import styles from './PollEditor.module.css';

export default function PollEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [voteMode, setVoteMode] = useState('single');
  const [resultVisibility, setResultVisibility] = useState('after_vote');
  const [voterRestriction, setVoterRestriction] = useState('anonymous');
  const [allowVoteChange, setAllowVoteChange] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [options, setOptions] = useState<PollOption[]>([
    { text: '', order: 0 },
    { text: '', order: 1 },
  ]);

  useEffect(() => {
    if (!isEdit) return;
    fetchPoll(Number(id))
      .then((poll) => {
        setTitle(poll.title);
        setQuestion(poll.question);
        setSlug(poll.slug);
        setSlugManual(true);
        setDescription(poll.description || '');
        setStatus(poll.status);
        setVoteMode(poll.voteMode);
        setResultVisibility(poll.resultVisibility);
        setVoterRestriction(poll.voterRestriction);
        setAllowVoteChange(poll.allowVoteChange);
        setStartsAt(poll.startsAt ? new Date(poll.startsAt).toISOString().slice(0, 16) : '');
        setEndsAt(poll.endsAt ? new Date(poll.endsAt).toISOString().slice(0, 16) : '');
        setFeaturedImage(poll.featuredImage || '');
        setOptions(poll.options.map((o) => ({ id: o.id, text: o.text, order: o.order })));
      })
      .catch(() => { toast.error('Failed to load poll'); navigate('/admin/polls'); });
  }, [id]);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function addOption() {
    setOptions((prev) => [...prev, { text: '', order: prev.length }]);
  }

  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, order: idx })));
  }

  function updateOption(i: number, text: string) {
    setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, text } : o));
  }

  function moveOption(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    setOptions(next.map((o, idx) => ({ ...o, order: idx })));
  }

  async function handleSave(asDraft = false) {
    const targetStatus = asDraft ? 'draft' : status;
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!question.trim()) { toast.error('Question is required'); return; }
    const validOpts = options.filter((o) => o.text.trim());
    if (validOpts.length < 2) { toast.error('At least 2 options are required'); return; }

    const input: PollInput = {
      title: title.trim(),
      question: question.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || undefined,
      status: targetStatus,
      voteMode,
      resultVisibility,
      voterRestriction,
      allowVoteChange,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      featuredImage: featuredImage || null,
      options: validOpts,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updatePoll(Number(id), input);
        toast.success('Poll updated');
      } else {
        await createPoll(input);
        toast.success('Poll created');
        navigate('/admin/polls');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>{isEdit ? 'Edit Poll' : 'Add New Poll'}</h2>
        <button className={styles.backButton} onClick={() => navigate('/admin/polls')}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back to Polls
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.contentColumn}>
          <input
            type="text"
            className={styles.titleInput}
            placeholder="Poll title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
          />

          <div className={styles.permalinkRow}>
            <span className={styles.permalinkLabel}>Permalink:</span>
            <span className={styles.permalinkBase}>/polls/</span>
            <input
              type="text"
              className={styles.permalinkInput}
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
              placeholder={slugify(title) || 'poll-slug'}
            />
          </div>

          <div className={styles.panel}>
            <h3>Question</h3>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you want to ask?"
              rows={3}
            />
            <div className={styles.formGroup} style={{ marginTop: '0.875rem' }}>
              <label>Description <span className={styles.optional}>(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context shown below the question"
                rows={2}
              />
            </div>
          </div>

          <div className={styles.panel}>
            <h3>Answer options</h3>
            <div className={styles.optionList}>
              {options.map((opt, i) => (
                <div key={i} className={styles.optionRow}>
                  <div className={styles.optionHandle}>
                    <button onClick={() => moveOption(i, -1)} disabled={i === 0} className={styles.moveBtn}>▲</button>
                    <button onClick={() => moveOption(i, 1)} disabled={i === options.length - 1} className={styles.moveBtn}>▼</button>
                  </div>
                  <input
                    className={styles.optionInput}
                    value={opt.text}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  <button className={styles.removeOptBtn} onClick={() => removeOption(i)} disabled={options.length <= 2}>
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
            </div>
            <button className={styles.addOptBtn} onClick={addOption}>
              <FontAwesomeIcon icon={faPlus} /> Add option
            </button>
          </div>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.panel}>
            <h3>Publish</h3>
            <div className={styles.formGroup}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="open">Open (accepting votes)</option>
                <option value="closed">Closed</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Opens at <span className={styles.optional}>(optional)</span></label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label>Closes at <span className={styles.optional}>(optional)</span></label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <div className={styles.publishActions}>
              <button className={styles.draftButton} onClick={() => handleSave(true)} disabled={saving}>
                Save Draft
              </button>
              <button className={styles.primaryButton} onClick={() => handleSave(false)} disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Update' : 'Publish'}
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <h3>Voting rules</h3>
            <div className={styles.formGroup}>
              <label>Vote mode</label>
              <select value={voteMode} onChange={(e) => setVoteMode(e.target.value)}>
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Voter restriction</label>
              <select value={voterRestriction} onChange={(e) => setVoterRestriction(e.target.value)}>
                <option value="anonymous">Anonymous (cookie)</option>
                <option value="ip_limited">IP-limited</option>
                <option value="authenticated">Authenticated users only</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>Results visibility</label>
              <select value={resultVisibility} onChange={(e) => setResultVisibility(e.target.value)}>
                <option value="after_vote">After voting</option>
                <option value="before_vote">Before voting</option>
                <option value="after_close">After poll closes</option>
                <option value="always">Always</option>
              </select>
            </div>
            <label className={styles.toggle}>
              <input type="checkbox" checked={allowVoteChange} onChange={(e) => setAllowVoteChange(e.target.checked)} />
              <span>Allow voters to change their vote</span>
            </label>
          </div>

          <div className={styles.panel}>
            <h3>Featured image</h3>
            <MediaPickerInput value={featuredImage} onChange={setFeaturedImage} />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
