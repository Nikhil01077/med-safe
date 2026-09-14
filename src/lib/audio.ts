let audioCtx: AudioContext | null = null;
let alarmInterval: number | null = null;
let isPlaying = false;

export function initAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBeep(ctx: AudioContext, freq: number, duration: number, startTime: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0.3, startTime + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function startAlarm() {
  if (isPlaying) return;
  const ctx = initAudioContext();
  if (!ctx) return;
  isPlaying = true;

  const playCycle = () => {
    if (!isPlaying || !audioCtx) return;
    const now = audioCtx.currentTime;
    // Dual-tone beep: 880Hz then 660Hz
    playBeep(audioCtx, 880, 0.15, now);
    playBeep(audioCtx, 660, 0.15, now + 0.2);
  };

  playCycle();
  alarmInterval = window.setInterval(playCycle, 800);
}

export function stopAlarm() {
  isPlaying = false;
  if (alarmInterval !== null) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}

export function isAlarmPlaying() {
  return isPlaying;
}

export function playShortBeep() {
  const ctx = initAudioContext();
  if (!ctx) return;
  playBeep(ctx, 1000, 0.1, ctx.currentTime);
}
