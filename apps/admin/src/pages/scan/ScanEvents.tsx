import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../../components/AdminLayout';
import { EmptyState, PageHeader } from '../../components/ui';
import { DoorEvent, fetchDoorEvents } from '../../services/checkIn';
import { purgeOldDoorData } from './doorStore';
import styles from './ScanEvents.module.css';

function when(e: DoorEvent) {
  const start = new Date(e.startAt);
  return start.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Pick the event to scan for: what's on now first. */
export default function ScanEventsPage() {
  const [events, setEvents] = useState<DoorEvent[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    purgeOldDoorData();
    fetchDoorEvents()
      .then(setEvents)
      .catch(() => setError('Couldn’t load events. Check the connection and reload.'));
  }, []);

  return (
    <AdminLayout>
      <PageHeader title="Scan tickets" subtitle="Check people in at the door with this phone’s camera." />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {events && events.length === 0 && (
        <EmptyState
          icon={faQrcode}
          title="No events to scan right now"
          description="The scanner opens 12 hours before an event starts and closes 12 hours after it ends."
        />
      )}
      {events && events.length > 0 && (
        <ul className={styles.list}>
          {events.map((e) => (
            <li key={e.id}>
              <Link to={`/admin/scan/${e.id}`} className={`${styles.item} ${e.open ? styles.itemOpen : ''}`}>
                <span className={styles.icon}><FontAwesomeIcon icon={faQrcode} /></span>
                <span className={styles.text}>
                  <strong>{e.title}</strong>
                  <span>{[when(e), e.venueName].filter(Boolean).join(' · ')}</span>
                </span>
                {e.open && <span className={styles.now}>Doors</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
