import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft, faPlus, faTrash, faGripVertical, faArrowUpRightFromSquare, faFileCsv, faRotateLeft, faListUl, faImage,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useToast } from '../components/ToastContext';
import { TelegramPanel, TelegramChoice, fromTelegramChoice, toTelegramChoice } from '../components/TelegramPanel';
import { fetchPoll, createPoll, updatePoll, resetPollVotes, downloadPollCsv, pollHasEnded, PollInput, PollOption } from '../services/polls';
import { PollResultsImage } from '../components/polls/PollResultsImage';
import { useConfirm } from '../components/ConfirmDialog';
import { slugify } from '@headtilts/shared';
import styles from './PollEditor.module.css';

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', open: 'Open', closed: 'Closed', scheduled: 'Scheduled' };
const RESTRICTION_HELP: Record<string, string> = {
  anonymous: 'Anyone can vote once per browser. Easiest for readers.',
  ip_limited: 'Also caps votes from one network, to stop ballot stuffing.',
  authenticated: 'Only signed-in users can vote.',
};
const VISIBILITY_HELP: Record<string, string> = {
  after_vote: 'Readers see the results right after voting — the most engaging choice.',
  before_vote: 'Results are visible to everyone, even before they vote.',
  after_close: 'Results stay hidden until the poll closes — best for contests.',
  always: 'Results are always visible.',
};

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
  const [showSidebar, setShowSidebar] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [featuredImage, setFeaturedImage] = useState('');
  const [telegramPost, setTelegramPost] = useState<TelegramChoice>('default');
  const [savedAt, setSavedAt] = useState(0);
  const [options, setOptions] = useState<PollOption[]>([
    { text: '', order: 0 },
    { text: '', order: 1 },
  ]);
  const confirm = useConfirm();
  // Saved vote counts per option id (for the results panel and option rows).
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [previewPick, setPreviewPick] = useState<number[]>([]);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);

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
        setShowSidebar(poll.showSidebar ?? false);
        setTelegramPost(toTelegramChoice(poll.telegramPost));
        setStartsAt(poll.startsAt ? new Date(poll.startsAt).toISOString().slice(0, 16) : '');
        setEndsAt(poll.endsAt ? new Date(poll.endsAt).toISOString().slice(0, 16) : '');
        setFeaturedImage(poll.featuredImage || '');
        setOptions(poll.options.map((o) => ({ id: o.id, text: o.text, order: o.order })));
        setVotes(Object.fromEntries(poll.options.filter((o) => o.id != null).map((o) => [o.id as number, o._count?.votes ?? 0])));
        setTotalVotes(poll._count?.votes ?? 0);
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

  /** Drag a row onto another to reorder. */
  function dropOption(to: number) {
    if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; }
    const next = [...options];
    const [row] = next.splice(dragIdx, 1);
    next.splice(to, 0, row);
    setOptions(next.map((o, idx) => ({ ...o, order: idx })));
    setDragIdx(null);
  }

  /** Enter in the last answer adds another and moves to it. */
  function optionKeyDown(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i === options.length - 1) {
      addOption();
      setTimeout(() => optionRefs.current[i + 1]?.focus(), 0);
    } else {
      optionRefs.current[i + 1]?.focus();
    }
  }

  function addPasted() {
    const lines = pasteText.split('\n').map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) { setPasting(false); return; }
    setOptions((prev) => {
      const kept = prev.filter((o) => o.text.trim() || o.id);
      return [...kept, ...lines.map((text) => ({ text, order: 0 }))].map((o, idx) => ({ ...o, order: idx }));
    });
    setPasteText('');
    setPasting(false);
  }

  async function handleReset() {
    if (!(await confirm({ title: 'Reset all votes?', message: `This permanently deletes all ${totalVotes} votes on this poll.`, confirmLabel: 'Reset votes', danger: true }))) return;
    try {
      await resetPollVotes(Number(id));
      setVotes({});
      setTotalVotes(0);
      toast.success('Votes reset');
    } catch {
      toast.error('Couldn’t reset the votes');
    }
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
      showSidebar,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      featuredImage: featuredImage || null,
      telegramPost: fromTelegramChoice(telegramPost),
      options: validOpts,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updatePoll(Number(id), input);
        toast.success('Poll updated');
        setSavedAt(Date.now());
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
        <div className={styles.headTitle}>
          <h2 className={styles.title}>{isEdit ? 'Edit poll' : 'New poll'}</h2>
          <span className={`${styles.statusPill} ${styles[`status_${status}`] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>
          {isEdit && <span className={styles.voteCount}>{totalVotes.toLocaleString()} vote{totalVotes === 1 ? '' : 's'}</span>}
        </div>
        <div className={styles.headActions}>
          {isEdit && status !== 'draft' && slug && (
            <a className={styles.backButton} href={`/polls/${slug}`} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> View on site
            </a>
          )}
          <button className={styles.backButton} onClick={() => navigate('/admin/polls')}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back to polls
          </button>
        </div>
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
            <h3>Answers <span className={styles.panelHint}>Drag to reorder · Enter adds another</span></h3>
            <div className={styles.optionList}>
              {options.map((opt, i) => (
                <div
                  key={opt.id ?? `new-${i}`}
                  className={`${styles.optionRow} ${dragIdx === i ? styles.optionDragging : ''}`}
                  onDragOver={(e) => { if (dragIdx !== null) e.preventDefault(); }}
                  onDrop={() => dropOption(i)}
                >
                  <span
                    className={styles.optionGrip}
                    draggable
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragIdx(null)}
                    title="Drag to reorder"
                    aria-hidden="true"
                  >
                    <FontAwesomeIcon icon={faGripVertical} />
                  </span>
                  <span className={styles.optionLetter} aria-hidden="true">{String.fromCharCode(65 + (i % 26))}</span>
                  <input
                    ref={(el) => { optionRefs.current[i] = el; }}
                    className={styles.optionInput}
                    value={opt.text}
                    onChange={(e) => updateOption(i, e.target.value)}
                    onKeyDown={(e) => optionKeyDown(e, i)}
                    placeholder={`Answer ${i + 1}`}
                    aria-label={`Answer ${i + 1}`}
                  />
                  {isEdit && opt.id != null && <span className={styles.optionVotes} title="Votes so far">{(votes[opt.id] ?? 0).toLocaleString()}</span>}
                  <span className={styles.optionMove}>
                    <button onClick={() => moveOption(i, -1)} disabled={i === 0} className={styles.moveBtn} aria-label={`Move answer ${i + 1} up`}>▲</button>
                    <button onClick={() => moveOption(i, 1)} disabled={i === options.length - 1} className={styles.moveBtn} aria-label={`Move answer ${i + 1} down`}>▼</button>
                  </span>
                  <button className={styles.removeOptBtn} onClick={() => removeOption(i)} disabled={options.length <= 2} aria-label={`Remove answer ${i + 1}`}>
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              ))}
            </div>
            {pasting ? (
              <div className={styles.pasteBox}>
                <textarea autoFocus rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'One answer per line, e.g.\nThrash\nDeath metal\nDoom'} />
                <div className={styles.pasteActions}>
                  <button className={styles.draftButton} onClick={() => { setPasting(false); setPasteText(''); }}>Cancel</button>
                  <button className={styles.primaryButton} onClick={addPasted} disabled={!pasteText.trim()}>Add answers</button>
                </div>
              </div>
            ) : (
              <div className={styles.addRow}>
                <button className={styles.addOptBtn} onClick={addOption}>
                  <FontAwesomeIcon icon={faPlus} /> Add answer
                </button>
                <button className={styles.addOptBtn} onClick={() => setPasting(true)}>
                  <FontAwesomeIcon icon={faListUl} /> Paste a list
                </button>
              </div>
            )}
          </div>

          {isEdit && (
            <div className={styles.panel}>
              <h3>Results <span className={styles.panelHint}>{totalVotes.toLocaleString()} vote{totalVotes === 1 ? '' : 's'}</span></h3>
              {totalVotes === 0 ? (
                <p className={styles.hint}>No votes yet. Results appear here as soon as people start voting.</p>
              ) : (
                <ol className={styles.resultList}>
                  {(() => {
                    const max = Math.max(...options.map((o) => (o.id != null ? votes[o.id] ?? 0 : 0)));
                    return options.filter((o) => o.id != null).map((o) => {
                      const v = votes[o.id as number] ?? 0;
                      const pct = totalVotes ? Math.round((v / totalVotes) * 100) : 0;
                      return (
                        <li key={o.id} className={`${styles.resultRow} ${v === max && max > 0 ? styles.resultLead : ''}`}>
                          <span className={styles.resultBar} style={{ width: `${pct}%` }} />
                          <span className={styles.resultText}>{o.text}</span>
                          <span className={styles.resultNum}><strong>{pct}%</strong> {v.toLocaleString()}</span>
                        </li>
                      );
                    });
                  })()}
                </ol>
              )}
              <div className={styles.resultActions}>
                <button type="button" className={styles.draftButton} onClick={() => downloadPollCsv(Number(id), slug).catch(() => toast.error('Export failed'))}><FontAwesomeIcon icon={faFileCsv} /> Export CSV</button>
                {pollHasEnded({ status, endsAt: endsAt ? new Date(endsAt).toISOString() : null }) && (
                  <button type="button" className={styles.draftButton} onClick={() => setShowImage(true)}><FontAwesomeIcon icon={faImage} /> Results image</button>
                )}
                {totalVotes > 0 && <button className={styles.dangerLink} onClick={handleReset}><FontAwesomeIcon icon={faRotateLeft} /> Reset votes</button>}
              </div>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={`${styles.panel} ${styles.previewPanel}`}>
            <h3>Preview <span className={styles.panelHint}>as readers see it</span></h3>
            <div className={styles.preview}>
              <span className={styles.previewPill}>{status === 'closed' ? 'Final results' : 'Open poll'}</span>
              <p className={styles.previewQ}>{question.trim() || 'Your question appears here'}</p>
              {description.trim() && <p className={styles.previewDesc}>{description}</p>}
              <p className={styles.previewHint}>{voteMode === 'multiple' ? 'Pick all that apply' : 'Pick one'}</p>
              <div className={styles.previewChoices}>
                {options.filter((o) => o.text.trim()).map((o, i) => {
                  const on = previewPick.includes(i);
                  return (
                    <button key={i} type="button" className={`${styles.previewChoice} ${on ? styles.previewOn : ''}`}
                      onClick={() => setPreviewPick((p) => (voteMode === 'multiple' ? (on ? p.filter((x) => x !== i) : [...p, i]) : [i]))}>
                      <span className={styles.previewMark}>{voteMode === 'multiple' ? (on ? '✓' : '') : String.fromCharCode(65 + i)}</span>
                      {o.text}
                    </button>
                  );
                })}
                {options.filter((o) => o.text.trim()).length < 2 && <p className={styles.hint}>Add at least two answers.</p>}
              </div>
              <span className={styles.previewVote}>Vote</span>
            </div>
          </div>

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
            <div className={styles.formGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={showSidebar}
                  onChange={(e) => setShowSidebar(e.target.checked)}
                  disabled={saving}
                />
                {' '}Show sidebar
              </label>
              <p className={styles.hint}>Display sidebar widgets next to this poll.</p>
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
            <h3>Telegram</h3>
            <TelegramPanel
              kind="poll"
              id={isEdit ? Number(id) : undefined}
              value={telegramPost}
              onChange={setTelegramPost}
              refreshKey={savedAt}
              disabled={saving}
            />
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
              <p className={styles.hint}>{RESTRICTION_HELP[voterRestriction]}</p>
            </div>
            <div className={styles.formGroup}>
              <label>Results visibility</label>
              <select value={resultVisibility} onChange={(e) => setResultVisibility(e.target.value)}>
                <option value="after_vote">After voting</option>
                <option value="before_vote">Before voting</option>
                <option value="after_close">After poll closes</option>
                <option value="always">Always</option>
              </select>
              <p className={styles.hint}>{VISIBILITY_HELP[resultVisibility]}</p>
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
      {showImage && isEdit && <PollResultsImage poll={{ id: Number(id), slug, title }} onClose={() => setShowImage(false)} />}
    </AdminLayout>
  );
}
