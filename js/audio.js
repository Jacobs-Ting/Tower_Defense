/* =========================================================
 * 音效：全部以 Web Audio API 即時合成（無外部音檔、無授權問題）
 * 具同時發聲數上限與單一音效最短間隔，避免爆音與效能問題
 * ========================================================= */
(function (g) {
  const SD = g.SD;

  const Audio = {
    ctx: null, master: null, sfxBus: null, musicBus: null, noise: null,
    enabled: true, musicOn: true, volume: 0.6,
    voices: 0, MAX_VOICES: 26, last: {},
    minGap: { mg: 0.055, flak: 0.09, boom: 0.06, ricochet: 0.15, at: 0.05, mortar: 0.08, hqHit: 0.2, siren: 1.2, bomb: 0.1 },

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
      // 白噪音緩衝
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.musicOn) this.startMusic();
    },

    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
    setEnabled(on) { this.enabled = on; if (this.sfxBus) this.sfxBus.gain.value = on ? 1 : 0; if (this.musicBus) this.musicBus.gain.value = on && this.musicOn ? 0.32 : 0; },
    setMusic(on) { this.musicOn = on; if (!this.ctx) return; if (on) this.startMusic(); else this.stopMusic(); },

    _voice(dur) {
      if (this.voices >= this.MAX_VOICES) return false;
      this.voices++; setTimeout(() => this.voices--, dur * 1000 + 30);
      return true;
    },

    /** 噪音爆裂（槍砲聲、爆炸核心） */
    _noise(t, dur, type, f1, f2, gain, q = 1) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const filt = c.createBiquadFilter(); filt.type = type; filt.Q.value = q;
      filt.frequency.setValueAtTime(f1, t); filt.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
      const gn = c.createGain(); gn.gain.setValueAtTime(gain, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filt); filt.connect(gn); gn.connect(this.sfxBus);
      src.start(t, Math.random() * 0.5, dur + 0.05);
    },
    _tone(t, dur, type, f1, f2, gain, bus) {
      const c = this.ctx, o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f1, t); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(gain, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
    },

    play(name) {
      if (!this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const gap = this.minGap[name] || 0.03;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      const t = now + 0.005;
      switch (name) {
        case 'mg': if (!this._voice(0.08)) return; this._noise(t, 0.06, 'bandpass', 2200, 900, 0.22, 1.2); this._tone(t, 0.04, 'square', 160, 90, 0.05); break;
        case 'flak': if (!this._voice(0.2)) return; this._noise(t, 0.12, 'bandpass', 1200, 300, 0.32); this._tone(t, 0.12, 'sine', 150, 60, 0.2); break;
        case 'at': if (!this._voice(0.4)) return; this._noise(t, 0.08, 'highpass', 3000, 1200, 0.35); this._noise(t, 0.35, 'lowpass', 900, 120, 0.45); this._tone(t, 0.3, 'sine', 120, 45, 0.35); break;
        case 'at17': if (!this._voice(0.5)) return; this._noise(t, 0.1, 'highpass', 2800, 900, 0.4); this._noise(t, 0.5, 'lowpass', 700, 80, 0.55); this._tone(t, 0.4, 'sine', 95, 35, 0.45); break;
        case 'mortar': if (!this._voice(0.3)) return; this._tone(t, 0.18, 'sine', 220, 70, 0.35); this._noise(t, 0.12, 'lowpass', 1200, 300, 0.2); break;
        case 'howitzer': if (!this._voice(0.6)) return; this._noise(t, 0.6, 'lowpass', 600, 60, 0.6); this._tone(t, 0.5, 'sine', 80, 30, 0.5); break;
        case 'boom': if (!this._voice(0.7)) return; this._noise(t, 0.6, 'lowpass', 1000, 70, 0.55); this._tone(t, 0.45, 'sine', 90, 32, 0.4); break;
        case 'bomb': if (!this._voice(0.9)) return; this._noise(t, 0.9, 'lowpass', 800, 50, 0.75); this._tone(t, 0.7, 'sine', 70, 25, 0.55); break;
        case 'ricochet': if (!this._voice(0.2)) return; this._tone(t, 0.16, 'sine', 2600 + Math.random() * 600, 900, 0.08); break;
        case 'build': this._tone(t, 0.07, 'square', 330, 330, 0.08); this._tone(t + 0.08, 0.09, 'square', 495, 495, 0.08); this._noise(t, 0.15, 'lowpass', 500, 200, 0.15); break;
        case 'sell': this._tone(t, 0.1, 'triangle', 500, 250, 0.1); break;
        case 'upgrade': [523, 659, 784].forEach((f, i) => this._tone(t + i * 0.08, 0.16, 'triangle', f, f, 0.12)); break;
        case 'click': this._tone(t, 0.04, 'square', 700, 700, 0.04); break;
        case 'error': this._tone(t, 0.12, 'square', 180, 140, 0.07); break;
        case 'hqHit': this._tone(t, 0.3, 'sawtooth', 160, 90, 0.12); this._noise(t, 0.3, 'lowpass', 600, 100, 0.3); break;
        case 'alarm': // 敵軍來襲：軍號式警報
          [0, 0.22, 0.44].forEach(d => this._tone(t + d, 0.18, 'sawtooth', 392, 392, 0.07)); this._tone(t + 0.66, 0.45, 'sawtooth', 523, 523, 0.08); break;
        case 'siren': { // 空襲警報
          const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(760, t + 0.7); o.frequency.linearRampToValueAtTime(420, t + 1.4);
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
          const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.07, t + 0.15); gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
          o.connect(f); f.connect(gn); gn.connect(this.sfxBus); o.start(t); o.stop(t + 1.5); break;
        }
        case 'victory': [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.16, i === 6 ? 0.8 : 0.18, 'triangle', f, f, 0.16)); break;
        case 'defeat': [392, 349, 311, 262].forEach((f, i) => this._tone(t + i * 0.32, 0.4, 'triangle', f, f * 0.98, 0.15)); break;
      }
    },

    /* 低調軍事背景音樂：鼓點 + 低音持續音（不壓過戰鬥音效） */
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.musicBus.gain.value = this.enabled ? 0.32 : 0;
      const c = this.ctx;
      this.pad = [];
      for (const [f, det] of [[55, 0], [82.4, 4], [110, -3]]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
        const gn = c.createGain(); gn.gain.value = 0.035;
        o.connect(lp); lp.connect(gn); gn.connect(this.musicBus); o.start();
        this.pad.push(o);
      }
      let step = 0; const bpm = 96, sp = 60 / bpm / 2;
      let next = c.currentTime + 0.1;
      const pattern = [1, 0, 0.4, 0, 0.7, 0.3, 0.4, 0, 1, 0, 0.4, 0.3, 0.7, 0.3, 0.5, 0.6];
      const bass = [55, 0, 0, 0, 65.4, 0, 0, 0, 49, 0, 0, 0, 55, 0, 0, 0];
      this.musicTimer = setInterval(() => {
        while (next < c.currentTime + 0.25) {
          const v = pattern[step % 16];
          if (v) { // 小鼓
            const src = c.createBufferSource(); src.buffer = this.noise;
            const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
            const gn = c.createGain(); gn.gain.setValueAtTime(0.09 * v, next); gn.gain.exponentialRampToValueAtTime(0.001, next + 0.09);
            src.connect(f); f.connect(gn); gn.connect(this.musicBus); src.start(next, Math.random(), 0.12);
          }
          const b = bass[step % 16];
          if (b) this._tone(next, sp * 3.5, 'triangle', b, b, 0.12, this.musicBus);
          next += sp; step++;
        }
      }, 80);
    },
    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      if (this.pad) { this.pad.forEach(o => { try { o.stop(); } catch (e) {} }); this.pad = null; }
    },
  };

  SD.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
