// Join and leave sounds for voice channels. They are synthesised here with the Web Audio
// API, so no audio file is needed and no other app's sound is copied.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // no audio output available: stay silent
  }
}

/** One soft, bell-like note with a quick attack and a short decay. */
function note(c: AudioContext, freq: number, start: number, gain: number) {
  const out = c.createGain();
  out.connect(c.destination);
  const t = c.currentTime + start;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

  const body = c.createOscillator();
  body.type = 'sine';
  body.frequency.value = freq;
  body.connect(out);

  // A quiet overtone gives the note its bright, bell-like sound.
  const shine = c.createOscillator();
  shine.type = 'sine';
  shine.frequency.value = freq * 2;
  const shineGain = c.createGain();
  shineGain.gain.value = 0.25;
  shine.connect(shineGain).connect(out);

  body.start(t);
  shine.start(t);
  body.stop(t + 0.25);
  shine.stop(t + 0.25);
}

function play(notes: number[], gain: number) {
  const c = audio();
  if (!c) return;
  notes.forEach((freq, i) => note(c, freq, i * 0.09, gain));
}

// E5 then A5 rises when joining; the same two notes falling is the leave sound.
export function playJoin() {
  play([659.25, 880], 0.16);
}

export function playLeave() {
  play([880, 659.25], 0.16);
}
