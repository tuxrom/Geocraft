import type { Settings } from './settings';
import type { BlockDef } from '../data/blocks';

type Surf = 'stone' | 'dirt' | 'wood' | 'sand' | 'glass' | 'leaf';

export function surfaceOf(b: BlockDef): Surf {
  if (b.name.includes('glass')) return 'glass';
  if (b.name === 'sand' || b.name === 'gravel' || b.name === 'snow') return 'sand';
  if (b.name === 'leaves') return 'leaf';
  if (b.tool === 'axe') return 'wood';
  if (b.tool === 'pick') return 'stone';
  return 'dirt';
}

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxG!: GainNode;
  private musG!: GainNode;
  private noiseBuf!: AudioBuffer;
  private delay!: DelayNode;
  private nextNote = 0;
  private motif: number[] = [];
  private lastStep = 0;

  constructor(private s: Settings) {}

  /** À appeler après un geste de l'utilisateur. */
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.connect(ctx.destination);
      this.sfxG = ctx.createGain(); this.sfxG.connect(this.master);
      this.musG = ctx.createGain(); this.musG.connect(this.master);
      this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.42;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay);
      this.delay.connect(this.musG);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
    } catch { this.ctx = null; }
  }

  apply() {
    if (!this.ctx) return;
    this.master.gain.value = this.s.master;
    this.sfxG.gain.value = this.s.sfx;
    this.musG.gain.value = this.s.music * 0.5;
  }

  private tone(f0: number, dur: number, type: OscillatorType, vol: number, f1 = f0, delay = 0, dest?: AudioNode, attack = 0.005) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.sfxG);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', f1 = freq, delay = 0, q = 1) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxG);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  sfx(name: string, vol = 1, surf: Surf = 'stone') {
    if (!this.ctx || vol <= 0.01) return;
    const v = vol;
    switch (name) {
      case 'step': {
        const now = this.ctx.currentTime;
        if (now - this.lastStep < 0.08) return;
        this.lastStep = now;
        if (surf === 'stone') this.noise(0.07, 1800 + Math.random() * 500, 0.16 * v, 'bandpass');
        else if (surf === 'wood') { this.tone(160 + Math.random() * 30, 0.08, 'triangle', 0.12 * v); this.noise(0.05, 900, 0.07 * v); }
        else if (surf === 'sand') this.noise(0.1, 3500, 0.08 * v, 'highpass');
        else if (surf === 'leaf') this.noise(0.08, 2200, 0.06 * v, 'bandpass');
        else this.noise(0.08, 450 + Math.random() * 150, 0.2 * v);
        break;
      }
      case 'break':
        if (surf === 'glass') { for (let i = 0; i < 5; i++) this.tone(1800 + Math.random() * 2500, 0.12, 'triangle', 0.07 * v, undefined, i * 0.025); }
        else if (surf === 'wood') { this.noise(0.18, 700, 0.3 * v); this.tone(130, 0.16, 'square', 0.1 * v, 80); }
        else if (surf === 'stone') { this.noise(0.22, 1500, 0.3 * v, 'bandpass'); this.tone(90, 0.18, 'square', 0.1 * v, 50); }
        else if (surf === 'sand') this.noise(0.25, 3000, 0.2 * v, 'highpass');
        else if (surf === 'leaf') this.noise(0.15, 2500, 0.15 * v, 'bandpass');
        else this.noise(0.2, 500, 0.35 * v);
        break;
      case 'mine': this.noise(0.05, surf === 'stone' ? 1800 : 600, 0.1 * v, 'bandpass'); break;
      case 'place': this.noise(0.08, 700, 0.18 * v); this.tone(220, 0.07, 'triangle', 0.1 * v, 150); break;
      case 'hit': this.noise(0.1, 1200, 0.25 * v, 'bandpass'); this.tone(200, 0.12, 'square', 0.1 * v, 90); break;
      case 'hurt': this.tone(240, 0.28, 'sawtooth', 0.2 * v, 90); this.noise(0.12, 800, 0.2 * v); break;
      case 'pickup': this.tone(500, 0.1, 'sine', 0.12 * v, 1100); break;
      case 'jump': this.noise(0.06, 1200, 0.04 * v, 'bandpass'); break;
      case 'swing': this.noise(0.14, 600, 0.12 * v, 'bandpass', 3000); break;
      case 'shoot': this.tone(900, 0.16, 'square', 0.09 * v, 200); break;
      case 'boom': this.noise(0.5, 500, 0.5 * v); this.tone(90, 0.4, 'sine', 0.35 * v, 35); break;
      case 'splash': this.noise(0.3, 1400, 0.25 * v, 'bandpass', 500); break;
      case 'ui': this.tone(780, 0.05, 'square', 0.05 * v, 900); break;
      case 'die': this.tone(420, 0.35, 'triangle', 0.18 * v, 70); this.noise(0.15, 1000, 0.1 * v); break;
      case 'roar': this.tone(70, 1, 'sawtooth', 0.28 * v, 38); this.tone(105, 1, 'square', 0.1 * v, 55); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12 * v, f, i * 0.07)); break;
      case 'buy': this.tone(988, 0.08, 'square', 0.08 * v); this.tone(1319, 0.2, 'square', 0.08 * v, 1319, 0.08); break;
      case 'bell': this.tone(880, 0.6, 'sine', 0.2 * v); this.tone(1320, 0.5, 'sine', 0.08 * v); break;
      case 'split': this.tone(600, 0.1, 'square', 0.1 * v, 300); this.tone(450, 0.1, 'square', 0.1 * v, 900, 0.05); break;
      case 'vec': this.tone(300, 0.3, 'sawtooth', 0.07 * v, 700); break;
      case 'door': this.noise(0.1, 400, 0.2 * v); this.tone(120, 0.12, 'triangle', 0.12 * v, 90); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.15 * v, f, i * 0.12)); break;
    }
  }

  /** Musique d'ambiance générative (gamme pentatonique). */
  update(t: number, night: boolean, playing: boolean) {
    if (!this.ctx || !playing || this.s.music <= 0.01) return;
    const now = this.ctx.currentTime;
    if (now < this.nextNote) return;
    const penta = night ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    const base = night ? 196 : 262;
    if (!this.motif.length || Math.random() < 0.3) {
      this.motif = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => penta[Math.floor(Math.random() * penta.length)] + (Math.random() < 0.3 ? 12 : 0));
    }
    let at = 0;
    for (const n of this.motif) {
      const f = base * Math.pow(2, n / 12);
      this.tone(f, 2.2, 'triangle', 0.16, f, at, this.delay, 0.08);
      this.tone(f * 2, 1.4, 'sine', 0.05, f * 2, at, this.delay, 0.1);
      at += 0.45 + Math.random() * 0.3;
    }
    if (Math.random() < 0.5) this.tone(base / 2, 4, 'sine', 0.09, base / 2, 0, this.delay, 0.5);
    this.nextNote = now + 9 + Math.random() * 14;
    void t;
  }
}
