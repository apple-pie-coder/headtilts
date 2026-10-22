import type { VerdictTone } from '@headtilts/shared';

// Sound and vibration for each scan, so door staff barely need to look.
// Browsers only allow sound after a tap, so the scanner's Start button calls unlockSound().

let audio: AudioContext | null = null;

export function unlockSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine') {
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = audio.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Green: one high beep. Amber: two mid beeps. Red: a low buzz. */
export function signal(kind: VerdictTone) {
  if (kind === 'green') {
    tone(1320, 0, 0.12);
    navigator.vibrate?.(60);
  } else if (kind === 'amber') {
    tone(660, 0, 0.12);
    tone(660, 0.18, 0.12);
    navigator.vibrate?.([80, 60, 80]);
  } else {
    tone(180, 0, 0.45, 'square');
    navigator.vibrate?.([250, 80, 250]);
  }
}
