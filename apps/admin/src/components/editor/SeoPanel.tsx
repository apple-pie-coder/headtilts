import { ReactNode, useId, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck, faCircleExclamation, faTriangleExclamation, faWandMagicSparkles, faCode, faCircleMinus,
} from '@fortawesome/free-solid-svg-icons';
import { MediaPickerInput } from '../MediaPickerInput';
import { resolveMediaUrl } from '../../services/media';
import type { ArticleType, QnaSession, Review } from '../../types';
import type { SeoSuggestions } from '../../utils/seoSuggest';
import {
  CheckGroup, CheckStatus, CheckTarget, META_DESCRIPTION_RANGE, SEO_TITLE_RANGE, SeoCheck, SeoResult,
  schemaTypeFor, scoreLabel,
} from '../../utils/seoAnalysis';
import styles from './editorExtras.module.css';

export interface SeoFields {
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

interface Props {
  result: SeoResult;
  fields: SeoFields;
  onField: <K extends keyof SeoFields>(key: K, value: SeoFields[K]) => void;
  /** Jump to an editor field outside this panel (content, slug, featured image…). */
  onFix: (target: CheckTarget) => void;
  title: string;
  slug: string;
  pathPrefix: string;
  siteTitle: string;
  siteOrigin: string;
  favicon?: string | null;
  featuredImage: string;
  contentHtml: string;
  excerpt: string;
  articleType: ArticleType;
  review: Review | null;
  qna: QnaSession | null;
  videoUrl: string;
  hasCategory: boolean;
  /** Derived from the title, text and type details. */
  suggestions: SeoSuggestions;
  /** Fill every empty SEO field (and the excerpt) from the suggestions. */
  onAutoFill: () => void;
  onAddTags: (tags: string[]) => void;
  disabled?: boolean;
}

const STATUS_ICON: Record<CheckStatus, typeof faCircleCheck> = {
  good: faCircleCheck, improve: faTriangleExclamation, problem: faCircleExclamation,
};
const GROUP_LABEL: Record<CheckGroup, string> = {
  basics: 'Search result', content: 'Content', readability: 'Readability', type: 'Post type',
};
const FIX_LABEL: Partial<Record<CheckTarget, string>> = {
  keyword: 'Set keyword', seoTitle: 'Edit title', metaDescription: 'Edit description', slug: 'Edit URL',
  content: 'Go to text', featuredImage: 'Add image', review: 'Review details', qna: 'Q&A details', categories: 'Pick category',
};

function ScoreRing({ score }: { score: number }) {
  const { tone } = scoreLabel(score);
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={`${styles.ring} ${styles[`ring_${tone}`]}`} role="img" aria-label={`SEO score ${score} out of 100`}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className={styles.ringTrack} />
        <circle cx="32" cy="32" r={r} className={styles.ringFill} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className={styles.ringValue}>{score}</span>
    </div>
  );
}

function LengthMeter({ length, range }: { length: number; range: readonly [number, number] }) {
  const [min, max] = range;
  const tone = length === 0 ? 'problem' : length >= min && length <= max ? 'good' : 'improve';
  const pct = Math.min(100, (length / (max * 1.15)) * 100);
  return (
    <div className={`${styles.meter} ${styles[`meter_${tone}`]}`}>
      <div className={styles.meterTrack}><div className={styles.meterFill} style={{ width: `${pct}%` }} /></div>
      <span className={styles.meterText}>{length} / {min}–{max}</span>
    </div>
  );
}

/** Bold the keyword's words in the snippet, as Google does. Text only — no HTML injection. */
function highlight(text: string, keyword: string): ReactNode {
  const terms = keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function SeoPanel(p: Props) {
  const uid = useId();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showGood, setShowGood] = useState(false);
  const { score, checks, stats, readability, effectiveTitle, effectiveDescription } = p.result;
  const { label } = scoreLabel(score);
  const counts = { problem: 0, improve: 0, good: 0 } as Record<CheckStatus, number>;
  checks.forEach((c) => counts[c.status]++);

  const host = p.siteOrigin.replace(/^https?:\/\//, '');
  const sg = p.suggestions;
  const keywordSuggestions = sg.keywordOptions.filter((s) => s.toLowerCase() !== p.fields.focusKeyword.trim().toLowerCase());
  // What "Fill from content" would change right now (empty fields only).
  const fillable = [
    !p.fields.focusKeyword.trim() && sg.focusKeyword && 'focus keyword',
    !p.fields.metaTitle.trim() && sg.metaTitle && 'SEO title',
    !p.fields.metaDescription.trim() && sg.metaDescription && 'description',
    !p.excerpt.trim() && sg.excerpt && 'excerpt',
  ].filter(Boolean) as string[];

  function fix(target: CheckTarget) {
    const local: Partial<Record<CheckTarget, string>> = { keyword: `${uid}-kw`, seoTitle: `${uid}-title`, metaDescription: `${uid}-desc` };
    const el = local[target] ? document.getElementById(local[target]!) : null;
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLInputElement).focus(); }
    else p.onFix(target);
  }

  const ordered: CheckGroup[] = ['basics', 'content', 'readability', 'type'];
  const visible = (c: SeoCheck) => showGood || c.status !== 'good';

  // What the public page will emit.
  const schema = schemaTypeFor(p.articleType);
  const r = p.review;
  const qAnswered = p.qna?.items.filter((i) => i.question.trim() && i.answer.trim()).length ?? 0;
  const props: { name: string; ok: boolean }[] = p.articleType === 'qna'
    ? [
        { name: 'headline', ok: !!p.title },
        { name: 'about', ok: !!p.qna?.subject },
        { name: `hasPart · ${qAnswered} Question${qAnswered === 1 ? '' : 's'}`, ok: qAnswered > 0 },
        { name: 'image', ok: !!p.featuredImage },
        { name: 'author', ok: true },
        { name: 'datePublished', ok: true },
        { name: 'description', ok: !!effectiveDescription },
      ]
    : p.articleType === 'review'
    ? [
        { name: 'itemReviewed', ok: !!(r?.artist && r?.subjectTitle) },
        { name: 'reviewRating', ok: r?.rating != null },
        { name: 'author', ok: true },
        { name: 'datePublished', ok: true },
        { name: 'image', ok: !!(r?.coverImage || p.featuredImage) },
        { name: 'description', ok: !!(r?.verdict || effectiveDescription) },
        { name: 'byArtist', ok: !!r?.artist },
        { name: 'datePublished (release)', ok: !!r?.releaseDate },
      ]
    : [
        { name: 'headline', ok: !!p.title && (p.articleType !== 'news' || p.title.length <= 110) },
        { name: 'image', ok: !!p.featuredImage },
        { name: 'author', ok: true },
        { name: 'datePublished', ok: true },
        { name: 'dateModified', ok: true },
        { name: 'publisher', ok: true },
        { name: 'description', ok: !!effectiveDescription },
        { name: 'articleSection', ok: p.hasCategory },
      ];

  return (
    <section className={styles.seo} aria-label="SEO">
      <div className={styles.seoHead}>
        <ScoreRing score={score} />
        <div className={styles.seoHeadText}>
          <h3>SEO: {label}</h3>
          <p>{counts.problem ? `Fix the ${counts.problem} problem${counts.problem === 1 ? '' : 's'} first — they cost the most.` : counts.improve ? 'A few tweaks will lift this further.' : 'Everything checks out.'}</p>
        </div>
        <div className={styles.seoCounts}>
          {counts.problem > 0 && <span className={`${styles.count} ${styles.count_problem}`}><FontAwesomeIcon icon={faCircleExclamation} /> {counts.problem} problem{counts.problem === 1 ? '' : 's'}</span>}
          {counts.improve > 0 && <span className={`${styles.count} ${styles.count_improve}`}><FontAwesomeIcon icon={faTriangleExclamation} /> {counts.improve} to improve</span>}
          <span className={`${styles.count} ${styles.count_good}`}><FontAwesomeIcon icon={faCircleCheck} /> {counts.good} good</span>
        </div>
      </div>

      {fillable.length > 0 && (
        <div className={styles.autofill}>
          <FontAwesomeIcon icon={faWandMagicSparkles} className={styles.autofillIcon} />
          <div className={styles.autofillText}>
            <strong>Fill SEO from your content</strong>
            <span>Adds a {fillable.join(', ').replace(/, ([^,]*)$/, ' and $1')} worked out from the title and text. You can edit everything afterwards.</span>
          </div>
          <button type="button" className={styles.fixPrimary} onClick={p.onAutoFill} disabled={p.disabled}>Fill in</button>
        </div>
      )}

      <div className={styles.keywordRow}>
        <label htmlFor={`${uid}-kw`} className={styles.fieldLabel}>Focus keyword</label>
        <input id={`${uid}-kw`} className={styles.input} value={p.fields.focusKeyword} disabled={p.disabled}
          onChange={(e) => p.onField('focusKeyword', e.target.value)}
          placeholder={sg.focusKeyword ? `e.g. ${sg.focusKeyword}` : 'The phrase people would search for'} />
        {keywordSuggestions.length > 0 && (
          <div className={styles.suggestions}>
            <span className={styles.help}>Try:</span>
            {keywordSuggestions.map((s) => (
              <button key={s} type="button" className={styles.suggestion} onClick={() => p.onField('focusKeyword', s)} disabled={p.disabled}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.fieldTop}>
          <span className={styles.fieldLabel}>Google preview</span>
          <div className={styles.previewTabs} role="group" aria-label="Preview device">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button key={d} type="button" aria-pressed={device === d}
                className={`${styles.chipToggle} ${device === d ? styles.chipToggleOn : ''}`} onClick={() => setDevice(d)}>
                {d === 'desktop' ? 'Desktop' : 'Mobile'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.serp} style={device === 'mobile' ? { maxWidth: 380 } : undefined}>
          <div className={styles.serpSite}>
            <span className={styles.serpFavicon}>{p.favicon ? <img src={resolveMediaUrl(p.favicon)} alt="" /> : null}</span>
            <span>
              <div className={styles.serpName}>{p.siteTitle || host}</div>
              <div className={styles.serpUrl}>{[host, ...p.pathPrefix.split('/').filter(Boolean), p.slug || 'your-post'].join(' › ')}</div>
            </span>
          </div>
          <p className={styles.serpTitle} style={device === 'mobile' ? { whiteSpace: 'normal' } : undefined}>{clip(effectiveTitle || 'Add a title', device === 'mobile' ? 78 : 65)}</p>
          <p className={styles.serpDesc}>
            {effectiveDescription
              ? highlight(clip(effectiveDescription, 160), p.fields.focusKeyword)
              : <em>No description — Google will pick text from the page.</em>}
          </p>
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldTop}>
          <label htmlFor={`${uid}-title`}>SEO title</label>
          {!p.fields.metaTitle && <span className={styles.help}>Using “{clip(effectiveTitle, 40)}”</span>}
        </div>
        <input id={`${uid}-title`} className={styles.input} value={p.fields.metaTitle} disabled={p.disabled}
          onChange={(e) => p.onField('metaTitle', e.target.value)} placeholder={effectiveTitle} />
        <LengthMeter length={effectiveTitle.length} range={SEO_TITLE_RANGE} />
        {!p.fields.metaTitle && sg.metaTitle && sg.metaTitle !== effectiveTitle && (
          <div className={styles.suggestLine}>
            <span className={styles.help}>Suggested: “{sg.metaTitle}”</span>
            <button type="button" className={styles.linkButton} onClick={() => p.onField('metaTitle', sg.metaTitle!)} disabled={p.disabled}>Use</button>
          </div>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.fieldTop}>
          <label htmlFor={`${uid}-desc`}>Meta description</label>
          <button type="button" className={styles.linkButton} disabled={p.disabled || !sg.metaDescription}
            onClick={() => sg.metaDescription && p.onField('metaDescription', sg.metaDescription)}>
            <FontAwesomeIcon icon={faWandMagicSparkles} /> Draft from text
          </button>
        </div>
        <textarea id={`${uid}-desc`} className={styles.textarea} rows={3} value={p.fields.metaDescription} disabled={p.disabled}
          onChange={(e) => p.onField('metaDescription', e.target.value)}
          placeholder={p.excerpt ? `Falls back to the excerpt: “${clip(p.excerpt, 80)}”` : 'One or two sentences that make people want to click'} />
        <LengthMeter length={effectiveDescription.length} range={META_DESCRIPTION_RANGE} />
        {!p.fields.metaDescription && sg.metaDescription && (
          <div className={styles.suggestLine}>
            <span className={styles.help}>Suggested: “{sg.metaDescription}”</span>
            <button type="button" className={styles.linkButton} onClick={() => p.onField('metaDescription', sg.metaDescription!)} disabled={p.disabled}>Use</button>
          </div>
        )}
      </div>

      {sg.tags.length > 0 && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Suggested tags</span>
          <div className={styles.suggestions}>
            {sg.tags.map((t) => (
              <button key={t} type="button" className={styles.suggestion} onClick={() => p.onAddTags([t])} disabled={p.disabled}>+ {t}</button>
            ))}
            {sg.tags.length > 1 && <button type="button" className={styles.linkButton} onClick={() => p.onAddTags(sg.tags)} disabled={p.disabled}>Add all</button>}
          </div>
        </div>
      )}

      <div className={styles.checkGroups}>
        {ordered.map((g) => {
          const items = checks.filter((c) => c.group === g && visible(c))
            .sort((a, b) => ({ problem: 0, improve: 1, good: 2 }[a.status] - { problem: 0, improve: 1, good: 2 }[b.status]));
          if (!items.length) return null;
          return (
            <div key={g}>
              <h4 className={styles.groupTitle}>{GROUP_LABEL[g]}</h4>
              <ul className={styles.checkList}>
                {items.map((c) => (
                  <li key={c.id} className={`${styles.check} ${styles[`check_${c.status}`]}`}>
                    <FontAwesomeIcon icon={STATUS_ICON[c.status]} className={styles.checkIcon} aria-label={c.status === 'good' ? 'Good' : c.status === 'improve' ? 'Could improve' : 'Problem'} />
                    <div>
                      <div className={styles.checkTitle}>{c.title}</div>
                      {c.hint && c.status !== 'good' && <div className={styles.checkHint}>{c.hint}</div>}
                    </div>
                    {c.target && c.status !== 'good' && (
                      <button type="button" className={styles.fix} onClick={() => fix(c.target!)}>{FIX_LABEL[c.target] ?? 'Fix'}</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {counts.good > 0 && (
          <button type="button" className={`${styles.linkButton} ${styles.showGood}`} onClick={() => setShowGood((s) => !s)}>
            {showGood ? 'Hide passed checks' : `Show ${counts.good} passed check${counts.good === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}><dt>Words</dt><dd>{stats.words.toLocaleString()}</dd></div>
        <div className={styles.stat}><dt>Reading time</dt><dd>{stats.readingMinutes} min</dd></div>
        <div className={styles.stat}><dt>Readability</dt><dd>{readability ?? '—'}</dd></div>
        <div className={styles.stat}><dt>Avg. sentence</dt><dd>{stats.avgSentenceWords} words</dd></div>
        <div className={styles.stat}><dt>Keyword uses</dt><dd>{p.fields.focusKeyword ? stats.keywordCount : '—'}</dd></div>
        <div className={styles.stat}><dt>Links in / out</dt><dd>{stats.internalLinks} / {stats.externalLinks}</dd></div>
      </dl>

      <div className={styles.schema}>
        <div className={styles.schemaHead}>
          <FontAwesomeIcon icon={faCode} /> Structured data: <code>{schema}</code>
          {p.videoUrl && <code>VideoObject</code>}
          <code>BreadcrumbList</code>
        </div>
        <ul className={styles.schemaProps}>
          {props.map((x) => (
            <li key={x.name} className={x.ok ? styles.propOk : styles.propMissing}>
              <FontAwesomeIcon icon={x.ok ? faCircleCheck : faCircleMinus} />{x.name}
            </li>
          ))}
        </ul>
        {p.articleType === 'review' && (
          <p className={styles.schemaNote}>Google doesn’t show review stars for music, but the Review markup tells it exactly what was reviewed and the score.</p>
        )}
      </div>

      <details className={styles.advanced}>
        <summary>Social sharing & advanced</summary>
        <div className={styles.advancedBody}>
          <div className={styles.social} aria-label="Social card preview">
            <div className={styles.socialImage} style={{ backgroundImage: (p.fields.ogImage || p.featuredImage) ? `url("${resolveMediaUrl(p.fields.ogImage || p.featuredImage)}")` : undefined }} />
            <div className={styles.socialBody}>
              <div className={styles.socialHost}>{host}</div>
              <div className={styles.socialTitle}>{clip(p.fields.ogTitle || effectiveTitle, 90)}</div>
              <div className={styles.socialDesc}>{p.fields.ogDescription || effectiveDescription}</div>
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor={`${uid}-ogt`}>Social title <span className={styles.optional}>(defaults to SEO title)</span></label>
              <input id={`${uid}-ogt`} className={styles.input} value={p.fields.ogTitle} onChange={(e) => p.onField('ogTitle', e.target.value)} disabled={p.disabled} />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${uid}-ogd`}>Social description <span className={styles.optional}>(defaults to meta description)</span></label>
              <input id={`${uid}-ogd`} className={styles.input} value={p.fields.ogDescription} onChange={(e) => p.onField('ogDescription', e.target.value)} disabled={p.disabled} />
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Social image <span className={styles.optional}>(defaults to featured image)</span></span>
            <MediaPickerInput value={p.fields.ogImage} onChange={(v) => p.onField('ogImage', v)} disabled={p.disabled} />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor={`${uid}-can`}>Canonical URL</label>
              <input id={`${uid}-can`} className={styles.input} value={p.fields.canonicalUrl} onChange={(e) => p.onField('canonicalUrl', e.target.value)}
                placeholder="Only if this post is a copy of another page" disabled={p.disabled} />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${uid}-mk`}>Meta keywords <span className={styles.optional}>(ignored by Google)</span></label>
              <input id={`${uid}-mk`} className={styles.input} value={p.fields.metaKeywords} onChange={(e) => p.onField('metaKeywords', e.target.value)}
                placeholder="Comma-separated" disabled={p.disabled} />
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
