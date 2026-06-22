import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { slugify } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { MediaPickerInput } from '../components/MediaPickerInput';
import {
  fetchEvent, createEvent, updateEvent,
  EventInput, TicketTier, Speaker, AgendaItem, CustomField,
} from '../services/events';
import styles from './EventEditor.module.css';

type Tab = 'details' | 'date-location' | 'registration' | 'tickets' | 'speakers' | 'agenda' | 'custom-fields';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details',      label: 'Details'        },
  { id: 'date-location', label: 'Date & Location' },
  { id: 'registration', label: 'Registration'    },
  { id: 'tickets',      label: 'Tickets'         },
  { id: 'speakers',     label: 'Speakers'        },
  { id: 'agenda',       label: 'Agenda'          },
  { id: 'custom-fields', label: 'Custom Fields'  },
];

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
  'Australia/Sydney',
];

function toLocalDt(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

function fromLocalDt(val: string): string {
  if (!val) return '';
  return new Date(val).toISOString();
}

export default function EventEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('details');
  const [saving, setSaving] = useState(false);
  const [slugManual, setSlugManual] = useState(false);

  // — Details
  const [title, setTitle]               = useState('');
  const [slug, setSlug]                 = useState('');
  const [excerpt, setExcerpt]           = useState('');
  const [description, setDescription]   = useState('');
  const [status, setStatus]             = useState('draft');
  const [isFeatured, setIsFeatured]     = useState(false);
  const [featuredImage, setFeaturedImage] = useState<string | null>(null);
  const [bannerImage, setBannerImage]   = useState<string | null>(null);
  const [metaTitle, setMetaTitle]       = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [ogImage, setOgImage]           = useState<string | null>(null);

  // — Date & Location
  const [startAt, setStartAt]           = useState('');
  const [endAt, setEndAt]               = useState('');
  const [timezone, setTimezone]         = useState('Asia/Kolkata');
  const [type, setType]                 = useState('in_person');
  const [venueName, setVenueName]       = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueCity, setVenueCity]       = useState('');
  const [venueState, setVenueState]     = useState('');
  const [venueCountry, setVenueCountry] = useState('India');
  const [venueMapEmbed, setVenueMapEmbed] = useState('');
  const [onlineUrl, setOnlineUrl]       = useState('');
  const [streamUrl, setStreamUrl]       = useState('');
  const [streamPlatform, setStreamPlatform] = useState('');

  // — Recurring
  const [isRecurring, setIsRecurring]   = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState('');

  // — Registration
  const [isRegistrationRequired, setIsRegistrationRequired] = useState(true);
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [showAttendeesCount, setShowAttendeesCount] = useState(true);
  const [showAttendeesNames, setShowAttendeesNames] = useState(false);

  // — Tickets
  const [ticketTiers, setTicketTiers]   = useState<TicketTier[]>([]);

  // — Speakers
  const [speakers, setSpeakers]         = useState<Speaker[]>([]);

  // — Agenda
  const [agendaItems, setAgendaItems]   = useState<AgendaItem[]>([]);

  // — Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const quillModules = useCallback(() => ({
    toolbar: [
      [{ header: [2, 3, 4, false] }],
      ['bold', 'italic', 'underline', 'blockquote'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean'],
    ],
  }), []);

  useEffect(() => {
    if (!isNew) load();
  }, [id]);

  async function load() {
    try {
      const ev = await fetchEvent(Number(id));
      setTitle(ev.title);
      setSlug(ev.slug);
      setExcerpt(ev.excerpt ?? '');
      setDescription(ev.description ?? '');
      setStatus(ev.status);
      setIsFeatured(ev.isFeatured);
      setFeaturedImage(ev.featuredImage);
      setBannerImage(ev.bannerImage);
      setMetaTitle(ev.metaTitle ?? '');
      setMetaDescription(ev.metaDescription ?? '');
      setOgImage(ev.ogImage ?? null);

      setStartAt(toLocalDt(ev.startAt));
      setEndAt(toLocalDt(ev.endAt));
      setTimezone(ev.timezone);
      setType(ev.type);
      setVenueName(ev.venueName ?? '');
      setVenueAddress(ev.venueAddress ?? '');
      setVenueCity(ev.venueCity ?? '');
      setVenueState(ev.venueState ?? '');
      setVenueCountry(ev.venueCountry ?? '');
      setVenueMapEmbed(ev.venueMapEmbed ?? '');
      setOnlineUrl(ev.onlineUrl ?? '');
      setStreamUrl(ev.streamUrl ?? '');
      setStreamPlatform(ev.streamPlatform ?? '');

      setIsRecurring(ev.isRecurring);
      setRecurrenceType(ev.recurrenceType ?? 'weekly');
      setRecurrenceInterval(ev.recurrenceInterval ?? 1);
      setRecurrenceDays(ev.recurrenceDays ?? '');
      setRecurrenceEndsAt(toLocalDt(ev.recurrenceEndsAt));

      setIsRegistrationRequired(ev.isRegistrationRequired);
      setRegistrationDeadline(toLocalDt(ev.registrationDeadline));
      setMaxAttendees(ev.maxAttendees ? String(ev.maxAttendees) : '');
      setRequireApproval(ev.requireApproval);
      setShowAttendeesCount(ev.showAttendeesCount);
      setShowAttendeesNames(ev.showAttendeesNames);

      setTicketTiers(ev.ticketTiers);
      setSpeakers(ev.speakers);
      setAgendaItems(ev.agendaItems);
      setCustomFields(ev.customFields);

      setSlugManual(true);
    } catch {
      toast.error('Failed to load event');
      navigate('/admin/events');
    }
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function buildInput(): EventInput {
    return {
      title, slug, excerpt: excerpt || undefined,
      description: description || undefined,
      startAt: fromLocalDt(startAt),
      endAt: fromLocalDt(endAt),
      timezone, type, status,
      featuredImage, bannerImage,
      venueName: venueName || undefined,
      venueAddress: venueAddress || undefined,
      venueCity: venueCity || undefined,
      venueState: venueState || undefined,
      venueCountry: venueCountry || undefined,
      venueMapEmbed: venueMapEmbed || undefined,
      onlineUrl: onlineUrl || undefined,
      streamUrl: streamUrl || undefined,
      streamPlatform: streamPlatform || undefined,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      isRegistrationRequired,
      registrationDeadline: registrationDeadline ? fromLocalDt(registrationDeadline) : null,
      requireApproval, showAttendeesCount, showAttendeesNames, isFeatured,
      isRecurring,
      ...(isRecurring ? {
        recurrenceType,
        recurrenceInterval: Number(recurrenceInterval),
        recurrenceDays: recurrenceDays || undefined,
        recurrenceEndsAt: recurrenceEndsAt ? fromLocalDt(recurrenceEndsAt) : null,
      } : {}),
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      ogImage: ogImage ?? undefined,
      ticketTiers, speakers, agendaItems, customFields,
    };
  }

  async function handleSave() {
    if (!title.trim()) { toast.error('Title is required'); setTab('details'); return; }
    if (!startAt || !endAt) { toast.error('Start and end date are required'); setTab('date-location'); return; }
    setSaving(true);
    try {
      if (isNew) {
        const ev = await createEvent(buildInput());
        toast.success('Event created');
        navigate(`/admin/events/${ev.id}/edit`);
      } else {
        await updateEvent(Number(id), buildInput());
        toast.success('Event saved');
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  // Ticket tier helpers
  function addTier() {
    setTicketTiers([...ticketTiers, {
      name: 'General', price: 0, currency: 'INR', quantity: null, soldCount: 0,
      isVisible: true, perOrderMin: 1, perOrderMax: 10, position: ticketTiers.length,
    }]);
  }
  function removeTier(i: number) { setTicketTiers(ticketTiers.filter((_, idx) => idx !== i)); }
  function updateTier(i: number, patch: Partial<TicketTier>) {
    setTicketTiers(ticketTiers.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }

  // Speaker helpers
  function addSpeaker() {
    setSpeakers([...speakers, { name: '', position: speakers.length }]);
  }
  function removeSpeaker(i: number) { setSpeakers(speakers.filter((_, idx) => idx !== i)); }
  function updateSpeaker(i: number, patch: Partial<Speaker>) {
    setSpeakers(speakers.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  // Agenda helpers
  function addAgendaItem() {
    setAgendaItems([...agendaItems, {
      title: '', type: 'session',
      startsAt: startAt ? fromLocalDt(startAt) : new Date().toISOString(),
      endsAt: startAt ? fromLocalDt(startAt) : new Date().toISOString(),
      position: agendaItems.length,
    }]);
  }
  function removeAgendaItem(i: number) { setAgendaItems(agendaItems.filter((_, idx) => idx !== i)); }
  function updateAgendaItem(i: number, patch: Partial<AgendaItem>) {
    setAgendaItems(agendaItems.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }

  // Custom field helpers
  function addCustomField() {
    setCustomFields([...customFields, { label: '', fieldType: 'text', required: false, position: customFields.length }]);
  }
  function removeCustomField(i: number) { setCustomFields(customFields.filter((_, idx) => idx !== i)); }
  function updateCustomField(i: number, patch: Partial<CustomField>) {
    setCustomFields(customFields.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }

  const showVenue  = type === 'in_person' || type === 'hybrid';
  const showOnline = type === 'online'    || type === 'hybrid';

  return (
    <AdminLayout>
      <div>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.backButton} onClick={() => navigate('/admin/events')}>
              <FontAwesomeIcon icon={faArrowLeft} /> Events
            </button>
            <h1 className={styles.title}>{isNew ? 'New Event' : 'Edit Event'}</h1>
          </div>
          <div className={styles.publishActions}>
            <button className={styles.draftButton} disabled={saving} onClick={() => { setStatus('draft'); setTimeout(handleSave, 0); }}>
              Save Draft
            </button>
            <button className={styles.primaryButton} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : isNew ? 'Create Event' : 'Update Event'}
            </button>
          </div>
        </div>

        <nav className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab}${tab === t.id ? ` ${styles.tabActive}` : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Details tab ── */}
        {tab === 'details' && (
          <>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Basic Info</h2>
              <div className={styles.field}>
                <label className={styles.label}>Title *</label>
                <input className={styles.input} value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Event title" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Slug</label>
                <div className={styles.slugRow}>
                  <input className={styles.input} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }} />
                  <button className={styles.slugBtn} onClick={() => { setSlug(slugify(title)); setSlugManual(true); }}>Auto</button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Excerpt</label>
                <textarea className={styles.textarea} rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short description shown in listings" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Description</label>
                <div className={styles.editorWrapper}>
                  <ReactQuill
                    theme="snow"
                    value={description}
                    onChange={setDescription}
                    modules={quillModules()}
                  />
                </div>
              </div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Status</label>
                  <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="postponed">Postponed</option>
                  </select>
                </div>
                <div className={styles.field} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '1.125rem' }}>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                    <span className={styles.checkLabel}>Featured event</span>
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Media</h2>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Featured Image (thumbnail)</label>
                  <MediaPickerInput value={featuredImage ?? ''} onChange={(v) => setFeaturedImage(v || null)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Banner Image (hero)</label>
                  <MediaPickerInput value={bannerImage ?? ''} onChange={(v) => setBannerImage(v || null)} />
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>SEO</h2>
              <div className={styles.field}>
                <label className={styles.label}>Meta Title</label>
                <input className={styles.input} value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Meta Description</label>
                <textarea className={styles.textarea} rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>OG Image</label>
                <MediaPickerInput value={ogImage ?? ''} onChange={(v) => setOgImage(v || null)} />
              </div>
            </div>
          </>
        )}

        {/* ── Date & Location tab ── */}
        {tab === 'date-location' && (
          <>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Date & Time</h2>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Start *</label>
                  <input className={styles.input} type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>End *</label>
                  <input className={styles.input} type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Timezone</label>
                <select className={styles.select} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Event Type</h2>
              <div className={styles.field}>
                <label className={styles.label}>Type</label>
                <select className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="in_person">In Person</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid (In-Person + Online)</option>
                </select>
              </div>

              {showVenue && (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Venue Name</label>
                    <input className={styles.input} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="e.g. The Grand Hall" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Address</label>
                    <input className={styles.input} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
                  </div>
                  <div className={styles.row3}>
                    <div className={styles.field}>
                      <label className={styles.label}>City</label>
                      <input className={styles.input} value={venueCity} onChange={(e) => setVenueCity(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>State</label>
                      <input className={styles.input} value={venueState} onChange={(e) => setVenueState(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Country</label>
                      <input className={styles.input} value={venueCountry} onChange={(e) => setVenueCountry(e.target.value)} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Map Embed HTML</label>
                    <textarea className={styles.textarea} rows={3} value={venueMapEmbed} onChange={(e) => setVenueMapEmbed(e.target.value)} placeholder="<iframe src=...></iframe>" />
                  </div>
                </>
              )}

              {showOnline && (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Meeting / Join URL <span className={styles.hint} style={{ display: 'inline', marginLeft: '0.25rem' }}>(revealed to registered attendees only)</span></label>
                    <input className={styles.input} value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://meet.google.com/..." />
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Public Livestream URL</label>
                      <input className={styles.input} value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="YouTube / Twitch URL or embed code" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Platform</label>
                      <select className={styles.select} value={streamPlatform} onChange={(e) => setStreamPlatform(e.target.value)}>
                        <option value="">None</option>
                        <option value="youtube">YouTube</option>
                        <option value="twitch">Twitch</option>
                        <option value="custom">Custom embed</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Recurring Event</h2>
              <div className={styles.field}>
                <label className={styles.checkbox}>
                  <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                  <span className={styles.checkLabel}>This is a recurring event</span>
                </label>
                {!isNew && isRecurring && (
                  <span className={styles.hint}>Changing recurrence on an existing event does not regenerate occurrences. Delete and recreate to regenerate.</span>
                )}
              </div>
              {isRecurring && (
                <div className={styles.row3}>
                  <div className={styles.field}>
                    <label className={styles.label}>Repeats</label>
                    <select className={styles.select} value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value)}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Every (interval)</label>
                    <input className={styles.input} type="number" min={1} max={52} value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(Number(e.target.value))} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Ends on</label>
                    <input className={styles.input} type="datetime-local" value={recurrenceEndsAt} onChange={(e) => setRecurrenceEndsAt(e.target.value)} />
                  </div>
                </div>
              )}
              {isRecurring && recurrenceType === 'weekly' && (
                <div className={styles.field}>
                  <label className={styles.label}>Days (optional, JSON array of day numbers 0=Sun … 6=Sat)</label>
                  <input className={styles.input} value={recurrenceDays} onChange={(e) => setRecurrenceDays(e.target.value)} placeholder='e.g. [1,3,5] for Mon, Wed, Fri' />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Registration tab ── */}
        {tab === 'registration' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Registration Settings</h2>
            <div className={styles.field}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={isRegistrationRequired} onChange={(e) => setIsRegistrationRequired(e.target.checked)} />
                <span className={styles.checkLabel}>Registration required to attend</span>
              </label>
            </div>
            {isRegistrationRequired && (
              <>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Registration Deadline</label>
                    <input className={styles.input} type="datetime-local" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Max Attendees</label>
                    <input className={styles.input} type="number" min={1} value={maxAttendees} onChange={(e) => setMaxAttendees(e.target.value)} placeholder="Leave blank for unlimited" />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
                    <span className={styles.checkLabel}>Require admin approval before confirming</span>
                  </label>
                </div>
                <div className={styles.field}>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={showAttendeesCount} onChange={(e) => setShowAttendeesCount(e.target.checked)} />
                    <span className={styles.checkLabel}>Show attendee count publicly</span>
                  </label>
                </div>
                <div className={styles.field}>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={showAttendeesNames} onChange={(e) => setShowAttendeesNames(e.target.checked)} />
                    <span className={styles.checkLabel}>Show attendee names publicly (up to 50)</span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tickets tab ── */}
        {tab === 'tickets' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Ticket Tiers</h2>
            <p style={{ margin: '0 0 1rem', color: 'var(--t3)', fontSize: '0.875rem' }}>
              Add multiple tiers (e.g. Free, General, VIP). Price 0 = free ticket.
            </p>
            <div className={styles.itemList}>
              {ticketTiers.map((tier, i) => (
                <div key={i} className={styles.itemCard}>
                  <div className={styles.itemCardHeader}>
                    <span className={styles.itemCardTitle}>Tier {i + 1}</span>
                    <button className={styles.removeBtn} onClick={() => removeTier(i)}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Name</label>
                      <input className={styles.input} value={tier.name} onChange={(e) => updateTier(i, { name: e.target.value })} placeholder="e.g. General, VIP" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Price (₹ paise — enter 0 for free)</label>
                      <div className={styles.priceField}>
                        <span className={styles.pricePrefix}>₹</span>
                        <input className={styles.input} type="number" min={0} value={Math.round(tier.price / 100)} onChange={(e) => updateTier(i, { price: Number(e.target.value) * 100 })} placeholder="0" />
                        <span className={styles.pricePrefix} style={{ fontSize: '0.8rem' }}>INR</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Description</label>
                    <input className={styles.input} value={tier.description ?? ''} onChange={(e) => updateTier(i, { description: e.target.value })} placeholder="What's included" />
                  </div>
                  <div className={styles.row3}>
                    <div className={styles.field}>
                      <label className={styles.label}>Quantity (blank = unlimited)</label>
                      <input className={styles.input} type="number" min={1} value={tier.quantity ?? ''} onChange={(e) => updateTier(i, { quantity: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Min per order</label>
                      <input className={styles.input} type="number" min={1} value={tier.perOrderMin} onChange={(e) => updateTier(i, { perOrderMin: Number(e.target.value) })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Max per order</label>
                      <input className={styles.input} type="number" min={1} value={tier.perOrderMax} onChange={(e) => updateTier(i, { perOrderMax: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Available From</label>
                      <input className={styles.input} type="datetime-local" value={toLocalDt(tier.availableFrom)} onChange={(e) => updateTier(i, { availableFrom: e.target.value ? fromLocalDt(e.target.value) : null })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Available Until</label>
                      <input className={styles.input} type="datetime-local" value={toLocalDt(tier.availableUntil)} onChange={(e) => updateTier(i, { availableUntil: e.target.value ? fromLocalDt(e.target.value) : null })} />
                    </div>
                  </div>
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={tier.isVisible} onChange={(e) => updateTier(i, { isVisible: e.target.checked })} />
                    <span className={styles.checkLabel}>Visible to public</span>
                  </label>
                </div>
              ))}
            </div>
            <button className={styles.addItemBtn} onClick={addTier}><FontAwesomeIcon icon={faPlus} /> Add Tier</button>
          </div>
        )}

        {/* ── Speakers tab ── */}
        {tab === 'speakers' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Speakers & Presenters</h2>
            <div className={styles.itemList}>
              {speakers.map((sp, i) => (
                <div key={i} className={styles.itemCard}>
                  <div className={styles.itemCardHeader}>
                    <span className={styles.itemCardTitle}>{sp.name || `Speaker ${i + 1}`}</span>
                    <button className={styles.removeBtn} onClick={() => removeSpeaker(i)}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Name</label>
                      <input className={styles.input} value={sp.name} onChange={(e) => updateSpeaker(i, { name: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Photo</label>
                      <MediaPickerInput value={sp.photo ?? ''} onChange={(v) => updateSpeaker(i, { photo: v || undefined })} />
                    </div>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Designation</label>
                      <input className={styles.input} value={sp.designation ?? ''} onChange={(e) => updateSpeaker(i, { designation: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Company</label>
                      <input className={styles.input} value={sp.company ?? ''} onChange={(e) => updateSpeaker(i, { company: e.target.value })} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Bio</label>
                    <textarea className={styles.textarea} rows={2} value={sp.bio ?? ''} onChange={(e) => updateSpeaker(i, { bio: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <button className={styles.addItemBtn} onClick={addSpeaker}><FontAwesomeIcon icon={faPlus} /> Add Speaker</button>
          </div>
        )}

        {/* ── Agenda tab ── */}
        {tab === 'agenda' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Agenda / Schedule</h2>
            <div className={styles.itemList}>
              {agendaItems.map((item, i) => (
                <div key={i} className={styles.itemCard}>
                  <div className={styles.itemCardHeader}>
                    <span className={styles.itemCardTitle}>{item.title || `Session ${i + 1}`}</span>
                    <button className={styles.removeBtn} onClick={() => removeAgendaItem(i)}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Title</label>
                      <input className={styles.input} value={item.title} onChange={(e) => updateAgendaItem(i, { title: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Type</label>
                      <select className={styles.select} value={item.type} onChange={(e) => updateAgendaItem(i, { type: e.target.value })}>
                        <option value="session">Session</option>
                        <option value="keynote">Keynote</option>
                        <option value="break">Break</option>
                        <option value="networking">Networking</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Starts At</label>
                      <input className={styles.input} type="datetime-local" value={toLocalDt(item.startsAt)} onChange={(e) => updateAgendaItem(i, { startsAt: fromLocalDt(e.target.value) })} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Ends At</label>
                      <input className={styles.input} type="datetime-local" value={toLocalDt(item.endsAt)} onChange={(e) => updateAgendaItem(i, { endsAt: fromLocalDt(e.target.value) })} />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Description</label>
                    <input className={styles.input} value={item.description ?? ''} onChange={(e) => updateAgendaItem(i, { description: e.target.value })} />
                  </div>
                  {speakers.length > 0 && (
                    <div className={styles.field}>
                      <label className={styles.label}>Speaker</label>
                      <select className={styles.select} value={item.speakerId ?? ''} onChange={(e) => updateAgendaItem(i, { speakerId: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">— None —</option>
                        {speakers.map((sp, si) => (
                          <option key={si} value={sp.id ?? si}>{sp.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className={styles.addItemBtn} onClick={addAgendaItem}><FontAwesomeIcon icon={faPlus} /> Add Session</button>
          </div>
        )}

        {/* ── Custom Fields tab ── */}
        {tab === 'custom-fields' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Registration Questions</h2>
            <p style={{ margin: '0 0 1rem', color: 'var(--t3)', fontSize: '0.875rem' }}>
              Extra questions shown on the registration form.
            </p>
            <div className={styles.itemList}>
              {customFields.map((field, i) => (
                <div key={i} className={styles.itemCard}>
                  <div className={styles.itemCardHeader}>
                    <span className={styles.itemCardTitle}>{field.label || `Field ${i + 1}`}</span>
                    <button className={styles.removeBtn} onClick={() => removeCustomField(i)}><FontAwesomeIcon icon={faTrash} /></button>
                  </div>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label}>Label</label>
                      <input className={styles.input} value={field.label} onChange={(e) => updateCustomField(i, { label: e.target.value })} placeholder="e.g. Dietary preference" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Type</label>
                      <select className={styles.select} value={field.fieldType} onChange={(e) => updateCustomField(i, { fieldType: e.target.value })}>
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="select">Dropdown</option>
                        <option value="checkbox">Checkbox</option>
                      </select>
                    </div>
                  </div>
                  {field.fieldType === 'select' && (
                    <div className={styles.field}>
                      <label className={styles.label}>Options (one per line)</label>
                      <textarea
                        className={styles.textarea}
                        rows={3}
                        value={(field.options ?? []).join('\n')}
                        onChange={(e) => updateCustomField(i, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
                        placeholder={'Option 1\nOption 2\nOption 3'}
                      />
                    </div>
                  )}
                  <label className={styles.checkbox}>
                    <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(i, { required: e.target.checked })} />
                    <span className={styles.checkLabel}>Required field</span>
                  </label>
                </div>
              ))}
            </div>
            <button className={styles.addItemBtn} onClick={addCustomField}><FontAwesomeIcon icon={faPlus} /> Add Question</button>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
