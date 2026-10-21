// Простой синтезатор на Web Audio API: музыка + эффекты
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicPlaying = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem("isocity_mute", this.muted ? "1" : "0"); } catch(e){}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  _beep(freq, dur, type = "square", vol = 0.15, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  uiClick() { this._beep(660, 0.05, "square", 0.08); }
  buildOk() {
    this._beep(523, 0.08, "square", 0.12);
    setTimeout(() => this._beep(784, 0.12, "square", 0.12), 60);
  }
  buildErr() { this._beep(180, 0.15, "sawtooth", 0.14, 120); }
  road() { this._noise(0.08, 0.12); this._beep(300, 0.05, "triangle", 0.06); }
  bulldoze() { this._noise(0.18, 0.15); this._beep(140, 0.12, "sawtooth", 0.1, 80); }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._beep(f, 0.25, "square", 0.15), i * 140));
  }
  lose() {
    [400, 350, 300, 200].forEach((f, i) => setTimeout(() => this._beep(f, 0.3, "sawtooth", 0.14), i * 170));
  }

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicStep = 0;
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const bass = [130.81, 130.81, 174.61, 196.00];
    const stepDur = 0.32;

    const tick = () => {
      const t = this.ctx.currentTime;
      if (!this.muted && Math.random() < 0.65) {
        const n = scale[Math.floor(Math.random() * scale.length)];
        this._note(n, t, stepDur * 1.6, "triangle", 0.10);
      }
      if (!this.muted && this.musicStep % 4 === 0) {
        const b = bass[Math.floor(this.musicStep / 4) % bass.length];
        this._note(b, t, stepDur * 3.5, "sine", 0.12);
      }
      this.musicStep++;
    };

    this.musicTimer = setInterval(tick, stepDur * 1000);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  _note(freq, t, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}