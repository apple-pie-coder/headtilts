/**
 * Keeps the last few browser errors so a feedback report can include them —
 * "it broke" is much easier to fix with the actual error attached.
 */
const MAX = 10;
const recent: string[] = [];

function record(message: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`.slice(0, 500);
  recent.push(line);
  if (recent.length > MAX) recent.shift();
}

const describe = (v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());

let installed = false;
export function installErrorLog() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => record(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
  window.addEventListener('unhandledrejection', (e) => record(`Unhandled promise: ${describe(e.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    record(args.map(describe).join(' '));
    original(...args);
  };
}

export const recentErrors = () => [...recent];
