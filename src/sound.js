// Resumes the AudioContext (needed on a user gesture in most browsers).
export function resumeAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window._gojoHum) window._gojoHum = { ctx: null, osc: null, gain: null, type: null };
    if (!window._gojoHum.ctx) {
      window._gojoHum.ctx = new AudioCtx();
    }
    if (window._gojoHum.ctx.state === 'suspended') {
      window._gojoHum.ctx.resume().catch(() => {});
    }
  } catch (e) {}
}

// Simple Web Audio API bass-drop / charging sounds to avoid shipping audio files.
export function playBassDrop() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Sub-bass drop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.9);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.3);

    // High-end impact
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1200, now);
    osc2.frequency.exponentialRampToValueAtTime(80, now + 0.5);
    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.7);

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.4;
    noise.connect(nGain).connect(ctx.destination);
    noise.start(now);
  } catch (e) {
    /* ignore audio errors */
  }
}

export function playChargingHum(type = 'blue') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!window._gojoHum) window._gojoHum = { ctx: null, osc: null, gain: null, type: null };
    const h = window._gojoHum;
    if (!h.ctx) h.ctx = new AudioCtx();
    const freq = type === 'blue' ? 180 : type === 'red' ? 220 : 200;
    if (h.osc && h.type === type) return;
    if (h.osc) {
      try { h.osc.stop(); } catch {}
      h.osc.disconnect();
    }
    if (h.gain) h.gain.disconnect();
    h.osc = h.ctx.createOscillator();
    h.gain = h.ctx.createGain();
    h.osc.type = 'triangle';
    h.osc.frequency.setValueAtTime(freq, h.ctx.currentTime);
    h.gain.gain.setValueAtTime(0.0001, h.ctx.currentTime);
    h.gain.gain.exponentialRampToValueAtTime(0.08, h.ctx.currentTime + 0.2);
    h.osc.connect(h.gain).connect(h.ctx.destination);
    h.osc.start();
    h.type = type;
  } catch (e) {}
}

export function stopHum() {
  try {
    const h = window._gojoHum;
    if (h && h.osc) {
      h.gain.gain.exponentialRampToValueAtTime(0.0001, h.ctx.currentTime + 0.1);
      setTimeout(() => {
        try { h.osc.stop(); } catch {}
      }, 150);
      h.osc = null;
      h.type = null;
    }
  } catch (e) {}
}
