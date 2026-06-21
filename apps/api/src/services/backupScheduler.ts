import { createBackup } from './backup.service';
import { getBackupSettings } from './backup.settings';

// Tracks the date string of the last scheduled run (YYYY-MM-DD) so we
// don't double-fire if the interval drifts and hits the same minute twice.
let lastRunDate = '';

export function startBackupScheduler(): NodeJS.Timeout {
  // Check every minute. If we're past the scheduled time for today and
  // haven't run yet, fire immediately (handles API restarts after scheduled time).
  return setInterval(async () => {
    try {
      const settings = await getBackupSettings();
      if (settings.schedule === 'disabled') return;

      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
      if (lastRunDate === todayKey) return;

      if (settings.schedule === 'weekly' && now.getDay() !== settings.scheduleDay) return;

      const [h, m] = settings.scheduleTime.split(':').map(Number);
      const pastScheduledTime = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
      if (!pastScheduledTime) return;

      lastRunDate = todayKey;
      await createBackup('scheduled');
    } catch (err) {
      console.error('[backup-scheduler] Failed to start scheduled backup:', err);
    }
  }, 60_000);
}
