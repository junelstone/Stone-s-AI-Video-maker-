// Tiny generative soundtrack made with the Web Audio API.
// It plays quietly through the speakers and is mixed into the recorded video.

const SONGS = {
  cinematic: { bpm: 70, prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], wave: 'sawtooth', cutoff: 900, arp: false, kick: false },
  anime: { bpm: 128, prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], wave: 'square', cutoff: 2200, arp: true, kick: true },
  '3d': { bpm: 110, prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], wave: 'sawtooth', cutoff: 1600, arp: true, kick: true },
  explainer: { bpm: 100, prog: [[60, 64, 67], [65, 69, 72], [55, 59, 62], [60, 64, 67]], wave: 'triangle', cutoff: 3000, arp: true, kick: false },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Soundtrack {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.dest = this.ctx.createMediaStreamDestination();
    this.monitor = this.ctx.createGain();
    this.monitor.gain.value = 0.6;
    this.master.connect(this.dest);
    this.master.connect(this.monitor);
    this.monitor.connect(this.ctx.destination);
    this.nodes = [];
  }

  get track() {
    return this.dest.stream.getAudioTracks()[0];
  }

  async start(style, duration, { volume = 0.5 } = {}) {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const song = SONGS[style] || SONGS.cinematic;
    const c = this.ctx;
    const t0 = c.currentTime + 0.05;
    const beat = 60 / song.bpm;
    const bar = beat * 4;
    this.master.gain.cancelScheduledValues(t0);
    this.master.gain.setValueAtTime(0, t0);
    this.master.gain.linearRampToValueAtTime(volume, t0 + 0.8);
    this.master.gain.setValueAtTime(volume, Math.max(t0 + 0.9, t0 + duration - 1.2));
    this.master.gain.linearRampToValueAtTime(0, t0 + duration);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = song.cutoff;
    filter.Q.value = 0.7;
    filter.connect(this.master);
    this.nodes.push(filter);

    const bars = Math.ceil(duration / bar) + 1;
    for (let b = 0; b < bars; b++) {
      const chord = song.prog[b % song.prog.length];
      const start = t0 + b * bar;
      // Pad
      for (const note of chord) this.note(mtof(note), start, bar * 1.02, song.wave, 0.05, filter, 0.4);
      // Bass
      this.note(mtof(chord[0] - 12), start, bar * 0.95, 'sine', 0.16, this.master, 0.02);
      // Arpeggio
      if (song.arp) {
        for (let i = 0; i < 8; i++) {
          const n = chord[i % 3] + (i >= 4 ? 12 : 0);
          this.note(mtof(n), start + i * beat * 0.5, beat * 0.45, 'triangle', 0.045, this.master, 0.005);
        }
      }
      if (song.kick) for (let i = 0; i < 4; i++) this.kick(start + i * beat);
    }
  }

  note(freq, start, dur, type, gain, out, attack) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (type === 'sawtooth' || type === 'square') o.detune.value = (Math.random() - 0.5) * 12;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.setTargetAtTime(0, start + dur * 0.7, dur * 0.15);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.5);
    this.nodes.push(o);
  }

  kick(start) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, start);
    o.frequency.exponentialRampToValueAtTime(40, start + 0.15);
    g.gain.setValueAtTime(0.35, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + 0.25);
    this.nodes.push(o);
  }

  stop() {
    for (const n of this.nodes) {
      try { n.stop ? n.stop() : null; } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.nodes = [];
    this.ctx.close().catch(() => {});
  }
}
