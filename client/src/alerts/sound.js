// Alert sounds made with the Web Audio API, so no audio files are needed.
// Browsers only allow audio after the user has interacted with the page,
// so the audio context is unlocked on the first click or key press.

let ctx = null;

function context() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

const unlock = () => { context()?.resume().catch(() => {}); };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

function tone(ac, freq, start, duration, volume) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// Normal: a soft two-note chime. Urgent: a sharper three-beep alarm.
export function playAlert(priority = 'normal') {
  const ac = context();
  if (!ac || ac.state === 'suspended') return;
  const t = ac.currentTime;
  if (priority === 'urgent') {
    [0, 0.22, 0.44].forEach((d) => tone(ac, 988, t + d, 0.16, 0.25));
  } else {
    tone(ac, 784, t, 0.35, 0.18);
    tone(ac, 1175, t + 0.16, 0.5, 0.15);
  }
}
