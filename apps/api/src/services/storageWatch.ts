import fs from 'fs';
import { PERMISSIONS } from '@headtilts/shared';
import { prisma } from '../config/database';
import { uploadDir } from '../middleware/upload';
import { getPreferences, getUserIdsWithPermission, notifyStorageHigh } from './notifications.service';

/**
 * Watches the disk that holds uploads and backups. Each admin is alerted when
 * usage passes their own threshold (Settings → Notifications), at most once a
 * day while it stays high.
 */

const STATE_KEY = 'storage_alert_state';   // { [userId]: ISO time of last alert }
const DAY_MS = 86_400_000;

async function check() {
  const st = await fs.promises.statfs(uploadDir);
  const total = st.blocks * st.bsize;
  const used = total - st.bavail * st.bsize;    // as `df` counts it
  const percent = Math.round((used / total) * 100);

  const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
  const state: Record<string, string> = row ? JSON.parse(row.value || '{}') : {};
  const now = Date.now();

  const admins = await getUserIdsWithPermission(PERMISSIONS.SETTING_EDIT);
  const due: string[] = [];
  for (const id of admins) {
    const pref = (await getPreferences(id)).find((p) => p.type === 'media_storage_high');
    if (!pref?.enabled || pref.channel === 'none') continue;
    if (percent < (pref.threshold ?? 80)) continue;
    if (state[id] && now - Date.parse(state[id]) < DAY_MS) continue;
    due.push(id);
  }
  if (!due.length) return;

  await notifyStorageHigh({
    percent,
    usedGb: Math.round(used / 1e9),
    totalGb: Math.round(total / 1e9),
    recipientIds: due,
  });
  for (const id of due) state[id] = new Date(now).toISOString();
  await prisma.setting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(state), type: 'json' },
    update: { value: JSON.stringify(state) },
  });
}

export function startStorageWatch(): NodeJS.Timeout {
  const run = () => check().catch((error) => console.error('Storage check failed:', error));
  setTimeout(run, 2 * 60 * 1000);           // shortly after start-up
  return setInterval(run, 60 * 60 * 1000);  // then hourly
}
