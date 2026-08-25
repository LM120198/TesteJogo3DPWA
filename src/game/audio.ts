/* VETOR-12 — Áudio 100% procedural via WebAudio.
 * Sem assets: tiros, impactos, confirmações e UI são sintetizados.
 */

export class AudioFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  /** Deve ser chamado a partir de um gesto do usuário. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp);
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  private get ok(): boolean {
    return !this.muted && !!this.ctx && !!this.master && !this.muted;
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = "lowpass", when = 0): void {
    if (!this.ok || !this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(
    freq0: number,
    freq1: number,
    dur: number,
    vol: number,
    type: OscillatorType = "sine",
    when = 0
  ): void {
    if (!this.ok || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private dist(vol: number, dist: number): number {
    return vol * Math.max(0, Math.min(1, 1 - dist / 48));
  }

  shotPistol(dist = 0): void {
    const v = this.dist(0.5, dist);
    this.noise(0.09, v, 2400, "bandpass");
    this.tone(320, 70, 0.1, v * 0.9, "square");
  }
  shotScatter(dist = 0): void {
    const v = this.dist(0.62, dist);
    this.noise(0.22, v, 1000);
    this.noise(0.1, v * 0.7, 3200, "bandpass");
    this.tone(180, 50, 0.16, v, "square");
  }
  shotRail(dist = 0): void {
    const v = this.dist(0.5, dist);
    this.tone(1600, 180, 0.28, v * 0.8, "sawtooth");
    this.noise(0.18, v * 0.7, 4200, "highpass");
  }
  impact(dist = 0): void {
    this.noise(0.05, this.dist(0.22, dist), 1600, "bandpass");
  }
  hitmarker(): void {
    this.tone(1900, 1400, 0.045, 0.3, "triangle");
  }
  kill(): void {
    this.tone(880, 880, 0.07, 0.32, "square");
    this.tone(1320, 1320, 0.12, 0.32, "square", 0.07);
  }
  multiKill(n: number): void {
    for (let i = 0; i < Math.min(n, 4); i++) this.tone(700 + i * 220, 700 + i * 220, 0.08, 0.28, "square", i * 0.07);
  }
  death(): void {
    this.tone(160, 36, 0.5, 0.5, "sine");
    this.noise(0.4, 0.4, 500);
  }
  shieldBreak(): void {
    this.noise(0.16, 0.4, 3600, "bandpass");
    this.tone(520, 140, 0.2, 0.3, "sawtooth");
  }
  pickup(): void {
    this.tone(620, 990, 0.1, 0.3, "sine");
    this.tone(990, 1480, 0.12, 0.26, "sine", 0.08);
  }
  respawn(): void {
    this.tone(300, 760, 0.18, 0.26, "sine");
  }
  beep(final = false): void {
    this.tone(final ? 1560 : 780, final ? 1560 : 780, final ? 0.24 : 0.09, 0.3, "square");
  }
  ui(): void {
    this.tone(520, 660, 0.06, 0.18, "triangle");
  }
  fanfare(win: boolean): void {
    const seq = win ? [523, 659, 784, 1046, 1318] : [392, 330, 262, 196];
    seq.forEach((f, i) => this.tone(f, f, 0.16, 0.28, win ? "square" : "sawtooth", i * 0.11));
  }
  streak(): void {
    this.tone(700, 1050, 0.09, 0.3, "square");
    this.tone(1050, 1400, 0.1, 0.3, "square", 0.08);
  }
}
