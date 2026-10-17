import { DragEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowLeft, faRotateLeft, faRotateRight, faDesktop, faTabletScreenButton, faMobileScreenButton, faWandMagicSparkles,
  faClockRotateLeft, faArrowUpRightFromSquare, faPlus, faGripVertical, faEye, faEyeSlash, faXmark, faCopy, faArrowUp,
  faArrowDown, faTrashCan, faNewspaper, faImage, faTableCellsLarge, faTableColumns, faListOl, faLayerGroup, faBarsStaggered,
  faStarHalfStroke, faCirclePlay, faMicrophone, faCalendarDays, faSquarePollVertical, faCakeCandles, faBullhorn, faParagraph,
  faPuzzlePiece, faGripLines, faCircleCheck, faMinus,
} from '@fortawesome/free-solid-svg-icons';
import {
  ARTICLE_TYPE_OPTIONS, FRONT_PAGE_TEMPLATES, FrontPageLayout, FrontPageSection, newSection, newSectionId, PERMISSIONS,
  SECTION_DEFS, SECTION_TYPES, SectionField, SectionGroup, SectionType, StorySource, summarizeSection,
} from '@headtilts/shared';
import { MediaPickerInput } from '../components/MediaPickerInput';
import { useToast } from '../components/ToastContext';
import { RowMenu, Switch, absoluteTime, relativeTime } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { fetchCategories } from '../services/categories';
import { fetchPolls } from '../services/polls';
import {
  FrontPageEditorState, discardFrontPageDraft, fetchFrontPage, fetchFrontPageVersion, publishFrontPage, resolveFrontPage, saveFrontPageDraft,
} from '../services/frontPage';
import styles from './FrontPageEditor.module.css';

const ICONS: Record<string, IconDefinition> = {
  newspaper: faNewspaper, image: faImage, 'table-cells-large': faTableCellsLarge, 'table-columns': faTableColumns,
  'list-ol': faListOl, 'layer-group': faLayerGroup, 'bars-staggered': faBarsStaggered, 'star-half-stroke': faStarHalfStroke,
  'circle-play': faCirclePlay, microphone: faMicrophone, 'calendar-days': faCalendarDays,
  'square-poll-vertical': faSquarePollVertical, 'cake-candles': faCakeCandles, bullhorn: faBullhorn, paragraph: faParagraph,
  'puzzle-piece': faPuzzlePiece, 'grip-lines': faGripLines,
};
const GROUPS: SectionGroup[] = ['Stories', 'Music & media', 'Community', 'Content'];
// Each preview renders at the real device width and is scaled down to fit the stage.
const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: faDesktop, width: 1280 },
  { id: 'tablet', label: 'Tablet', icon: faTabletScreenButton, width: 820 },
  { id: 'phone', label: 'Phone', icon: faMobileScreenButton, width: 390 },
] as const;
type Device = (typeof DEVICES)[number]['id'];
const SOURCE_KINDS: { value: StorySource['kind']; label: string }[] = [
  { value: 'latest', label: 'Latest stories' }, { value: 'featured', label: 'Featured stories' },
  { value: 'category', label: 'A category' }, { value: 'tag', label: 'A tag' },
  { value: 'type', label: 'A post type' }, { value: 'video', label: 'Stories with video' },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const errMsg = (e: unknown, f: string) => (e as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message || f;

export default function FrontPageEditorPage() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.WIDGET_EDIT);

  const [state, setState] = useState<FrontPageEditorState | null>(null);
  // Sections plus undo/redo stacks in one state, so every edit is one atomic update.
  const [hist, setHist] = useState<{ sections: FrontPageSection[]; past: FrontPageSection[][]; future: FrontPageSection[][] }>({ sections: [], past: [], future: [] });
  const { sections, past, future } = hist;
  const setSections = (next: FrontPageSection[]) => setHist({ sections: next, past: [], future: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [panel, setPanel] = useState<'sections' | 'add'>('sections');
  const [modal, setModal] = useState<'templates' | 'history' | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [publishing, setPublishing] = useState(false);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [polls, setPolls] = useState<{ slug: string; title: string; status: string }[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState({ w: 1000, h: 700 });
  const frameReady = useRef(false);
  const resolved = useRef<unknown[]>([]);

  // ── Load ──
  useEffect(() => {
    fetchFrontPage().then((s) => {
      setState(s);
      setSections((s.draft ?? s.published).layout.sections);
    }).catch((e) => toast.error(errMsg(e, 'Couldn’t load the front page')));
    fetchCategories(1, 100).then((r) => setCategories(r.items.map((c) => ({ slug: c.slug, name: c.name })))).catch(() => {});
    fetchPolls(1, 50).then((r) => setPolls(r.items.filter((p) => p.status !== 'draft').map((p) => ({ slug: p.slug, title: p.title, status: p.status })))).catch(() => {});
  }, [toast]);

  const layout: FrontPageLayout = useMemo(() => ({ version: 1, sections }), [sections]);
  const catNames = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c.name])), [categories]);
  const isLive = !!state && same(sections, state.published.layout.sections);
  const sel = sections.find((s) => s.id === selected) ?? null;

  // ── Edits (all go through here so undo works) ──
  const commit = useCallback((next: FrontPageSection[]) => {
    setHist((h) => (same(h.sections, next) ? h : { sections: next, past: [...h.past.slice(-49), h.sections], future: [] }));
    setSaveState('unsaved');
  }, []);
  const undo = useCallback(() => {
    setHist((h) => (h.past.length ? { sections: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.sections, ...h.future] } : h));
    setSaveState('unsaved');
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { sections: h.future[0], past: [...h.past, h.sections], future: h.future.slice(1) } : h));
    setSaveState('unsaved');
  }, []);

  const update = (id: string, props: Record<string, unknown>) =>
    commit(sections.map((s) => (s.id === id ? { ...s, props: { ...s.props, ...props } } : s)));
  const toggleHidden = (id: string) => commit(sections.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)));
  const remove = (id: string) => {
    const i = sections.findIndex((s) => s.id === id);
    commit(sections.filter((s) => s.id !== id));
    if (selected === id) setSelected(sections[i + 1]?.id ?? sections[i - 1]?.id ?? null);
    toast.success(`${SECTION_DEFS[sections[i].type].label} removed`, { action: { label: 'Undo', onClick: undo } });
  };
  const duplicate = (id: string) => {
    const i = sections.findIndex((s) => s.id === id);
    const s = sections[i];
    if (SECTION_DEFS[s.type].single) { toast.info('There can only be one latest feed.'); return; }
    const copy = { ...JSON.parse(JSON.stringify(s)), id: newSectionId() } as FrontPageSection;
    commit([...sections.slice(0, i + 1), copy, ...sections.slice(i + 1)]);
    setSelected(copy.id);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = (type: SectionType) => {
    if (SECTION_DEFS[type].single && sections.some((s) => s.type === type)) {
      const existing = sections.find((s) => s.type === type)!;
      setSelected(existing.id); setPanel('sections');
      toast.info('Your page already has a latest feed — selected it for you.');
      return;
    }
    const s = newSection(type);
    // New sections go after the selected one, else just above the latest feed (which belongs at the bottom).
    const selIdx = sections.findIndex((x) => x.id === selected);
    const feedIdx = sections.findIndex((x) => x.type === 'latest');
    const at = selIdx >= 0 ? selIdx + 1 : feedIdx >= 0 && type !== 'latest' ? feedIdx : sections.length;
    commit([...sections.slice(0, at), s, ...sections.slice(at)]);
    setSelected(s.id);
    setPanel('sections');
  };
  const applyTemplate = (id: string) => {
    const t = FRONT_PAGE_TEMPLATES.find((x) => x.id === id)!;
    commit(t.build());
    setSelected(null);
    setModal(null);
    toast.success(`“${t.name}” template applied`, { action: { label: 'Undo', onClick: undo } });
  };

  // ── Drag to reorder ──
  function onDrop(e: DragEvent, index: number) {
    e.preventDefault();
    const from = sections.findIndex((s) => s.id === dragId);
    setDragId(null); setDropAt(null);
    if (from < 0) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(index > from ? index - 1 : index, 0, item);
    commit(next);
  }

  // ── Autosave the draft ──
  useEffect(() => {
    if (!state || !canEdit || saveState !== 'unsaved') return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveFrontPageDraft(layout);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [layout, saveState, state, canEdit]);

  async function publish() {
    setPublishing(true);
    try {
      const r = await publishFrontPage(layout);
      setState((s) => (s ? {
        ...s, draft: null,
        published: { layout: r.layout, at: r.at, by: r.by, isDefault: false },
        history: [{ id: `v-new`, at: r.at, by: r.by, sections: r.layout.sections.length }, ...s.history],
      } : s));
      setSections(r.layout.sections);
      setSaveState('saved');
      toast.success('Front page published — it’s live now');
      fetchFrontPage().then(setState).catch(() => {});
    } catch (e) {
      toast.error(errMsg(e, 'Couldn’t publish'));
    } finally {
      setPublishing(false);
    }
  }

  async function revertToLive() {
    if (!state) return;
    try {
      await discardFrontPageDraft();
      setHist((h) => ({ sections: state.published.layout.sections, past: [...h.past.slice(-49), h.sections], future: [] }));
      setState({ ...state, draft: null });
      setSaveState('saved');
      setModal(null);
      toast.success('Back to the live version', { action: { label: 'Undo', onClick: undo } });
    } catch (e) {
      toast.error(errMsg(e, 'Couldn’t discard the draft'));
    }
  }

  async function loadVersion(id: string) {
    try {
      const v = await fetchFrontPageVersion(id);
      commit(v.layout.sections);
      setModal(null);
      toast.success(`Loaded the version from ${absoluteTime(v.at)} — publish to make it live`, { action: { label: 'Undo', onClick: undo } });
    } catch (e) {
      toast.error(errMsg(e, 'Couldn’t load that version'));
    }
  }

  // ── Live preview ──
  const send = useCallback((msg: unknown) => {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(async () => {
      try {
        resolved.current = await resolveFrontPage(layout);
        if (frameReady.current) send({ type: 'fp:render', sections: resolved.current, selected });
      } catch { /* keep the last preview */ }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, state]);
  useEffect(() => { if (frameReady.current) send({ type: 'fp:select', selected }); }, [selected, send]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === 'fp:ready') {
        frameReady.current = true;
        if (resolved.current.length || sections.length === 0) send({ type: 'fp:render', sections: resolved.current, selected });
      }
      if (e.data?.type === 'fp:select' && typeof e.data.id === 'string') { setSelected(e.data.id); setPanel('sections'); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [send, selected, sections.length]);

  // Track the stage size so the preview can be scaled to fit.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStage({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
      if (e.key === 'Escape' && !typing) { if (modal) setModal(null); else setSelected(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, modal]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Front page · Admin';
    return () => { document.title = prev; };
  }, []);

  if (!state) return <div className={styles.loading}>Loading the front page…</div>;

  const status = !canEdit ? 'View only'
    : saveState === 'saving' ? 'Saving draft…'
      : saveState === 'error' ? 'Draft not saved — check your connection'
        : isLive ? (state.published.isDefault ? 'Showing the default layout' : `Live · published ${relativeTime(state.published.at)}`)
          : saveState === 'unsaved' ? 'Unsaved changes' : 'Draft saved · not live yet';

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <Link to="/admin" className={styles.back} title="Back to the dashboard"><FontAwesomeIcon icon={faArrowLeft} /></Link>
        <div className={styles.titleBlock}>
          <h1>Front page</h1>
          <span className={`${styles.status} ${isLive ? styles.statusLive : saveState === 'error' ? styles.statusError : ''}`}>
            {isLive && <FontAwesomeIcon icon={faCircleCheck} />} {status}
          </span>
        </div>
        <div className={styles.toolGroup} role="group" aria-label="History">
          <button type="button" onClick={undo} disabled={!past.length || !canEdit} title="Undo (Ctrl+Z)" aria-label="Undo"><FontAwesomeIcon icon={faRotateLeft} /></button>
          <button type="button" onClick={redo} disabled={!future.length || !canEdit} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><FontAwesomeIcon icon={faRotateRight} /></button>
        </div>
        <div className={styles.toolGroup} role="group" aria-label="Preview size">
          {DEVICES.map((d) => (
            <button key={d.id} type="button" aria-pressed={device === d.id} onClick={() => setDevice(d.id)} title={`${d.label} preview`} aria-label={`${d.label} preview`}>
              <FontAwesomeIcon icon={d.icon} />
            </button>
          ))}
        </div>
        <div className={styles.spacer} />
        {canEdit && <button type="button" className={styles.ghostBtn} onClick={() => setModal('templates')}><FontAwesomeIcon icon={faWandMagicSparkles} /> Templates</button>}
        <button type="button" className={styles.ghostBtn} onClick={() => setModal('history')}><FontAwesomeIcon icon={faClockRotateLeft} /> History</button>
        <a href="/" target="_blank" rel="noopener noreferrer" className={styles.ghostBtn}><FontAwesomeIcon icon={faArrowUpRightFromSquare} /> View site</a>
        {canEdit && (
          <button type="button" className={styles.publishBtn} onClick={publish} disabled={publishing || (isLive && !state.published.isDefault)}>
            {publishing ? 'Publishing…' : isLive && !state.published.isDefault ? 'Published' : 'Publish'}
          </button>
        )}
      </header>

      <div className={styles.body}>
        {/* Left: sections */}
        <aside className={styles.left} aria-label="Sections">
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={panel === 'sections'} onClick={() => setPanel('sections')}>Sections <span>{sections.length}</span></button>
            {canEdit && <button type="button" role="tab" aria-selected={panel === 'add'} onClick={() => setPanel('add')}><FontAwesomeIcon icon={faPlus} /> Add</button>}
          </div>

          {panel === 'sections' ? (
            <div className={styles.leftScroll}>
              {sections.length === 0 && (
                <div className={styles.emptyList}>
                  <p>Your front page is empty.</p>
                  {canEdit && <><button type="button" onClick={() => setPanel('add')}>Add a section</button> or <button type="button" onClick={() => setModal('templates')}>start from a template</button></>}
                </div>
              )}
              <ol className={styles.sectionList} onDragOver={(e) => e.preventDefault()}>
                {sections.map((s, i) => {
                  const def = SECTION_DEFS[s.type];
                  return (
                    <li
                      key={s.id}
                      className={`${styles.sectionItem} ${selected === s.id ? styles.sectionOn : ''} ${s.hidden ? styles.sectionHidden : ''} ${dragId === s.id ? styles.dragging : ''} ${dropAt === i ? styles.dropBefore : ''}`}
                      draggable={canEdit}
                      onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
                      onDragEnd={() => { setDragId(null); setDropAt(null); }}
                      onDragOver={(e) => { if (!dragId) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
                      onDrop={(e) => onDrop(e, dropAt ?? i)}
                    >
                      {canEdit && <span className={styles.grip} aria-hidden="true"><FontAwesomeIcon icon={faGripVertical} /></span>}
                      <button type="button" className={styles.sectionMain} onClick={() => setSelected(s.id)} aria-current={selected === s.id ? 'true' : undefined}>
                        <span className={styles.sectionIcon}><FontAwesomeIcon icon={ICONS[def.icon] ?? faNewspaper} /></span>
                        <span className={styles.sectionText}>
                          <strong>{def.label}{s.hidden && <em> · hidden</em>}</strong>
                          <span>{summarizeSection(s, catNames)}</span>
                        </span>
                      </button>
                      {canEdit && (
                        <span className={styles.sectionActions}>
                          <button type="button" onClick={() => toggleHidden(s.id)} title={s.hidden ? 'Show on the page' : 'Hide from the page'} aria-label={s.hidden ? `Show ${def.label}` : `Hide ${def.label}`}>
                            <FontAwesomeIcon icon={s.hidden ? faEyeSlash : faEye} />
                          </button>
                          <RowMenu label={`More actions for ${def.label}`} items={[
                            { label: 'Move up', icon: faArrowUp, onClick: () => move(s.id, -1), hidden: i === 0 },
                            { label: 'Move down', icon: faArrowDown, onClick: () => move(s.id, 1), hidden: i === sections.length - 1 },
                            { label: 'Duplicate', icon: faCopy, onClick: () => duplicate(s.id), hidden: !!def.single },
                            { label: 'Delete', icon: faTrashCan, danger: true, onClick: () => remove(s.id) },
                          ]} />
                        </span>
                      )}
                    </li>
                  );
                })}
                {dropAt === sections.length && <li className={styles.dropEnd} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, sections.length)} />}
              </ol>
              {canEdit && sections.length > 0 && (
                <button type="button" className={styles.addBtn} onClick={() => setPanel('add')}><FontAwesomeIcon icon={faPlus} /> Add section</button>
              )}
              <p className={styles.tip}>Drag to reorder. Click a section here or in the preview to edit it. Stories never repeat down the page.</p>
            </div>
          ) : (
            <div className={styles.leftScroll}>
              <p className={styles.addHint}>{sel ? <>Adds below <strong>{SECTION_DEFS[sel.type].label}</strong>.</> : 'Adds above the latest feed.'}</p>
              {GROUPS.map((g) => (
                <div key={g} className={styles.libGroup}>
                  <h3>{g}</h3>
                  {SECTION_TYPES.filter((t) => SECTION_DEFS[t].group === g).map((t) => {
                    const def = SECTION_DEFS[t];
                    const taken = !!def.single && sections.some((s) => s.type === t);
                    return (
                      <button key={t} type="button" className={styles.libItem} onClick={() => add(t)} disabled={taken} title={taken ? 'Already on the page' : undefined}>
                        <span className={styles.sectionIcon}><FontAwesomeIcon icon={ICONS[def.icon] ?? faNewspaper} /></span>
                        <span className={styles.sectionText}><strong>{def.label}</strong><span>{taken ? 'Already on the page' : def.description}</span></span>
                        <FontAwesomeIcon icon={faPlus} className={styles.libPlus} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Centre: live preview */}
        <main className={styles.stage} ref={stageRef}>
          {(() => {
            const target = DEVICES.find((d) => d.id === device)!.width;
            const availW = Math.max(200, stage.w - 32);
            const availH = Math.max(200, stage.h - 36);
            const scale = Math.min(1, Math.max(0.2, availW / target));
            return (
              <>
                <div className={styles.frameWrap} style={{ width: target * scale, height: availH }}>
                  <iframe
                    ref={frameRef}
                    title="Front page preview"
                    src="/?fp-preview=1"
                    className={styles.frame}
                    style={{ width: target, height: availH / scale, transform: `scale(${scale})` }}
                  />
                </div>
                <span className={styles.scaleNote}>{target}px{scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ''}</span>
              </>
            );
          })()}
        </main>

        {/* Right: settings */}
        <aside className={styles.right} aria-label="Section settings">
          {!sel ? (
            <div className={styles.inspectorEmpty}>
              <FontAwesomeIcon icon={faTableCellsLarge} />
              <strong>Select a section</strong>
              <p>Click a section in the list or the preview to change what it shows.</p>
              {canEdit && <button type="button" className={styles.ghostBtn} onClick={() => setModal('templates')}><FontAwesomeIcon icon={faWandMagicSparkles} /> Browse templates</button>}
            </div>
          ) : (
            <Inspector
              key={sel.id}
              section={sel}
              disabled={!canEdit}
              categories={categories}
              polls={polls}
              onChange={(props) => update(sel.id, props)}
              onClose={() => setSelected(null)}
              onDelete={() => remove(sel.id)}
              onToggleHidden={() => toggleHidden(sel.id)}
            />
          )}
        </aside>
      </div>

      {modal === 'templates' && (
        <Modal title="Start from a template" onClose={() => setModal(null)}>
          <p className={styles.modalLead}>Pick a starting point — it replaces the sections in the editor (you can undo), and nothing goes live until you publish.</p>
          <div className={styles.templates}>
            {FRONT_PAGE_TEMPLATES.map((t) => (
              <button key={t.id} type="button" className={styles.template} onClick={() => applyTemplate(t.id)}>
                <span className={styles.sketch} aria-hidden="true">
                  {t.sketch.map((row, r) => (
                    <span key={r} className={styles.sketchRow} style={{ flexGrow: r === 0 ? 2 : 1 }}>
                      {row.map((w, c) => <span key={c} className={styles.sketchBox} style={{ flexGrow: w }} />)}
                    </span>
                  ))}
                </span>
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {modal === 'history' && (
        <Modal title="Published versions" onClose={() => setModal(null)}>
          {canEdit && !isLive && (
            <div className={styles.revert}>
              <span><strong>You have changes that aren’t live.</strong> Discard them to go back to the published front page.</span>
              <button type="button" className={styles.dangerBtn} onClick={revertToLive}>Discard changes</button>
            </div>
          )}
          {state.history.length === 0 ? (
            <p className={styles.modalLead}>Nothing published from the editor yet. Each time you publish, the version is kept here so you can go back to it.</p>
          ) : (
            <ul className={styles.history}>
              {state.history.map((h, i) => (
                <li key={h.id}>
                  <span>
                    <strong>{absoluteTime(h.at)}</strong>
                    <span>{h.by ? `by ${h.by} · ` : ''}{h.sections} sections{i === 0 ? ' · live now' : ''}</span>
                  </span>
                  {canEdit && i > 0 && <button type="button" className={styles.ghostBtn} onClick={() => loadVersion(h.id)}>Load into editor</button>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
}

function Inspector({ section, disabled, categories, polls, onChange, onClose, onDelete, onToggleHidden }: {
  section: FrontPageSection;
  disabled: boolean;
  categories: { slug: string; name: string }[];
  polls: { slug: string; title: string; status: string }[];
  onChange: (props: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const def = SECTION_DEFS[section.type];
  const p = section.props;
  return (
    <div className={styles.inspector}>
      <header className={styles.inspectorHead}>
        <span className={styles.sectionIcon}><FontAwesomeIcon icon={ICONS[def.icon] ?? faNewspaper} /></span>
        <span className={styles.sectionText}><strong>{def.label}</strong><span>{def.description}</span></span>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close settings"><FontAwesomeIcon icon={faXmark} /></button>
      </header>
      <div className={styles.fields}>
        {def.fields.length === 0 && <p className={styles.tip}>This section has no settings.</p>}
        {def.fields.map((f) => (
          <Field key={f.key} field={f} value={p[f.key]} disabled={disabled} categories={categories} polls={polls} onChange={(v) => onChange({ [f.key]: v })} />
        ))}
      </div>
      {!disabled && (
        <footer className={styles.inspectorFoot}>
          <button type="button" className={styles.ghostBtn} onClick={onToggleHidden}>
            <FontAwesomeIcon icon={section.hidden ? faEye : faEyeSlash} /> {section.hidden ? 'Show section' : 'Hide section'}
          </button>
          <button type="button" className={styles.dangerBtn} onClick={onDelete}><FontAwesomeIcon icon={faTrashCan} /> Delete</button>
        </footer>
      )}
    </div>
  );
}

function Field({ field: f, value, disabled, categories, polls, onChange }: {
  field: SectionField;
  value: unknown;
  disabled: boolean;
  categories: { slug: string; name: string }[];
  polls: { slug: string; title: string; status: string }[];
  onChange: (v: unknown) => void;
}) {
  const id = `fp-${f.key}`;
  const help = 'help' in f && f.help ? <p className={styles.help}>{f.help}</p> : null;
  switch (f.kind) {
    case 'toggle':
      return (
        <div className={styles.fieldRow}>
          <Switch checked={!!value} onChange={(v) => onChange(v)} label={f.label} disabled={disabled} />
          <span className={styles.fieldRowLabel}>{f.label}</span>
          {help}
        </div>
      );
    case 'text': case 'url':
      return (
        <div className={styles.field}>
          <label htmlFor={id}>{f.label}</label>
          <input id={id} type="text" value={String(value ?? '')} placeholder={f.placeholder} maxLength={f.max ?? 500} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
    case 'textarea':
      return (
        <div className={styles.field}>
          <label htmlFor={id}>{f.label}</label>
          <textarea id={id} rows={5} value={String(value ?? '')} maxLength={f.max ?? 2000} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {help}
        </div>
      );
    case 'image':
      return (
        <div className={styles.field}>
          <label>{f.label}</label>
          <MediaPickerInput value={String(value ?? '')} onChange={(v) => onChange(v)} disabled={disabled} />
          {help}
        </div>
      );
    case 'number': {
      const n = Number(value) || f.min;
      return (
        <div className={styles.field}>
          <label htmlFor={id}>{f.label}</label>
          <div className={styles.stepper}>
            <button type="button" onClick={() => onChange(Math.max(f.min, n - 1))} disabled={disabled || n <= f.min} aria-label={`Fewer ${f.label.toLowerCase()}`}><FontAwesomeIcon icon={faMinus} /></button>
            <input id={id} type="range" min={f.min} max={f.max} value={n} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
            <button type="button" onClick={() => onChange(Math.min(f.max, n + 1))} disabled={disabled || n >= f.max} aria-label={`More ${f.label.toLowerCase()}`}><FontAwesomeIcon icon={faPlus} /></button>
            <output htmlFor={id}>{n}</output>
          </div>
          {help}
        </div>
      );
    }
    case 'select':
      return (
        <div className={styles.field}>
          <span className={styles.label}>{f.label}</span>
          {f.options.length <= 4 ? (
            <div className={styles.segmented} role="radiogroup" aria-label={f.label}>
              {f.options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={String(value) === o.value} disabled={disabled} onClick={() => onChange(o.value)}>{o.label}</button>
              ))}
            </div>
          ) : (
            <select value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={f.label}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {help}
        </div>
      );
    case 'source': {
      const s = (value as StorySource) ?? { kind: 'latest' };
      return (
        <div className={styles.field}>
          <label htmlFor={id}>{f.label}</label>
          <select id={id} value={s.kind} disabled={disabled} onChange={(e) => {
            const kind = e.target.value as StorySource['kind'];
            onChange(kind === 'category' ? { kind, value: categories[0]?.slug ?? '' } : kind === 'type' ? { kind, value: 'review' } : kind === 'tag' ? { kind, value: '' } : { kind });
          }}>
            {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          {s.kind === 'category' && (
            <select value={s.value ?? ''} disabled={disabled} onChange={(e) => onChange({ kind: 'category', value: e.target.value })} aria-label="Category" className={styles.subField}>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          )}
          {s.kind === 'type' && (
            <select value={s.value ?? 'review'} disabled={disabled} onChange={(e) => onChange({ kind: 'type', value: e.target.value })} aria-label="Post type" className={styles.subField}>
              {ARTICLE_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
          {s.kind === 'tag' && (
            <input type="text" className={styles.subField} value={s.value ?? ''} placeholder="tag slug, e.g. zygnema" disabled={disabled}
              onChange={(e) => onChange({ kind: 'tag', value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} aria-label="Tag" />
          )}
          {help}
        </div>
      );
    }
    case 'categories': {
      const list = (value as string[]) ?? [];
      return (
        <div className={styles.field}>
          <span className={styles.label}>{f.label} <em>{list.length}/{f.max}</em></span>
          <div className={styles.checkList}>
            {categories.map((c) => {
              const on = list.includes(c.slug);
              return (
                <label key={c.slug} className={styles.check}>
                  <input type="checkbox" checked={on} disabled={disabled || (!on && list.length >= f.max)}
                    onChange={() => onChange(on ? list.filter((x) => x !== c.slug) : [...list, c.slug])} />
                  {c.name}
                </label>
              );
            })}
          </div>
          {help}
        </div>
      );
    }
    case 'poll':
      return (
        <div className={styles.field}>
          <label htmlFor={id}>{f.label}</label>
          <select id={id} value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            <option value="">Newest open poll</option>
            {polls.map((pl) => <option key={pl.slug} value={pl.slug}>{pl.title}{pl.status !== 'open' ? ` (${pl.status})` : ''}</option>)}
          </select>
          {help}
        </div>
      );
    default:
      return null;
  }
}
