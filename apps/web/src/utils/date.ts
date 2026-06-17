const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_FULL    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatWithPHP(format: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h12 = date.getHours() % 12 || 12;
  const tokens: Record<string, string> = {
    Y: String(date.getFullYear()),  y: String(date.getFullYear()).slice(-2),
    m: pad(date.getMonth() + 1),   n: String(date.getMonth() + 1),
    F: MONTHS_FULL[date.getMonth()], M: MONTHS_SHORT[date.getMonth()],
    d: pad(date.getDate()),         j: String(date.getDate()),
    l: DAYS_FULL[date.getDay()],    D: DAYS_SHORT[date.getDay()],
    H: pad(date.getHours()),        G: String(date.getHours()),
    h: pad(h12),                    g: String(h12),
    i: pad(date.getMinutes()),      s: pad(date.getSeconds()),
    a: date.getHours() < 12 ? 'am' : 'pm',
    A: date.getHours() < 12 ? 'AM' : 'PM',
  };
  return format.replace(
    /\\(.)|(Y|y|m|n|F|M|d|j|l|D|H|G|h|g|i|s|a|A)/g,
    (_w, escaped?: string, token?: string) => {
      if (escaped !== undefined) return escaped;
      if (token !== undefined) return tokens[token] ?? _w;
      return _w;
    },
  );
}

export function formatDate(
  isoString: string | null | undefined,
  dateFormat = 'F j, Y',
  timezone?: string,
): string {
  if (!isoString) return '';
  try {
    let date: Date;
    if (timezone && timezone !== 'UTC') {
      // Convert to target timezone using Intl then parse
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(new Date(isoString));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
      date = new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    } else {
      date = new Date(isoString);
    }
    return formatWithPHP(dateFormat, date);
  } catch {
    return isoString;
  }
}

export function formatTime(
  isoString: string | null | undefined,
  timeFormat = 'g:i a',
  timezone?: string,
): string {
  return formatDate(isoString, timeFormat, timezone);
}

/** Relative "time ago" label, e.g. "just now", "3 hours ago", "2 days ago". */
export function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 45) return 'just now';

  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];

  let value = seconds;
  let unit = 'second';
  for (let i = 0; i < units.length; i++) {
    unit = units[i][1];
    if (value < units[i][0]) break;
    value = Math.floor(value / units[i][0]);
  }

  const rounded = Math.max(1, Math.floor(value));
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`;
}
