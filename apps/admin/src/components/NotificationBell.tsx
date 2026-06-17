import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCheckDouble, faListCheck, faXmark, faEnvelope, faEnvelopeOpen } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '../context/NotificationContext';
import { AppNotification } from '../services/notifications';
import styles from './NotificationBell.module.css';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const { items, unreadCount, hasMore, loading, loadMore, markRead, markUnread, markManyRead, markManyUnread, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Leave select mode (and clear the selection) whenever the panel closes.
  useEffect(() => {
    if (!open) {
      setSelectMode(false);
      setSelected(new Set());
    }
  }, [open]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleItemClick(n: AppNotification) {
    if (selectMode) {
      toggleSelect(n.id);
      return;
    }
    markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  function handleToggleRead(e: React.MouseEvent, n: AppNotification) {
    e.stopPropagation();
    if (n.readAt) markUnread(n.id);
    else markRead(n.id);
  }

  function applyBulk(read: boolean) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (read) markManyRead(ids);
    else markManyUnread(ids);
    setSelected(new Set());
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.bellBtn}
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
      >
        <FontAwesomeIcon icon={faBell} />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            <div className={styles.headerActions}>
              {!selectMode && unreadCount > 0 && (
                <button className={styles.markAll} onClick={markAllRead}>
                  <FontAwesomeIcon icon={faCheckDouble} /> Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  className={styles.iconBtn}
                  onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
                  title={selectMode ? 'Cancel selection' : 'Select notifications'}
                  aria-label={selectMode ? 'Cancel selection' : 'Select notifications'}
                  aria-pressed={selectMode}
                >
                  <FontAwesomeIcon icon={selectMode ? faXmark : faListCheck} />
                </button>
              )}
            </div>
          </div>

          {selectMode && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selected.size} selected</span>
              <button className={styles.bulkBtn} onClick={() => applyBulk(true)} disabled={selected.size === 0}>
                <FontAwesomeIcon icon={faEnvelopeOpen} /> Mark read
              </button>
              <button className={styles.bulkBtn} onClick={() => applyBulk(false)} disabled={selected.size === 0}>
                <FontAwesomeIcon icon={faEnvelope} /> Mark unread
              </button>
            </div>
          )}

          <div className={styles.list}>
            {items.length === 0 ? (
              <div className={styles.empty}>{loading ? 'Loading…' : 'No notifications yet'}</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.item} ${n.readAt ? '' : styles.unread} ${selectMode ? styles.selectable : ''}`}
                  onClick={() => handleItemClick(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleItemClick(n); }}
                >
                  {selectMode ? (
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select notification: ${n.title}`}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.dotBtn}
                      onClick={(e) => handleToggleRead(e, n)}
                      title={n.readAt ? 'Mark as unread' : 'Mark as read'}
                      aria-label={n.readAt ? 'Mark as unread' : 'Mark as read'}
                    >
                      <span className={styles.dot} aria-hidden />
                    </button>
                  )}
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    {n.body && <span className={styles.itemText}>{n.body}</span>}
                    <span className={styles.itemTime}>{timeAgo(n.createdAt)}</span>
                  </span>
                </div>
              ))
            )}
          </div>

          {hasMore && (
            <button className={styles.loadMore} onClick={loadMore} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
