/**
 * TERRA // FOLIO — Procedural Web Audio Surveyor Instrument & Field Acoustics
 * 100% Web Audio API synthesis (zero external audio files).
 */

export class FieldAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.ambientGain = null;
    this.windFilter = null;
    this.droneOsc = null;
  }

  initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    // Create subtle continuous ambient wind/pelagic filter chain
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 1.5;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 3.5;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.0;

    whiteNoise.connect(this.windFilter);
    this.windFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    whiteNoise.start(0);
  }

  toggle() {
    this.initContext();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    if (this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(this.enabled ? 0.035 : 0.0, now, 0.25);
    }
    if (this.enabled) {
      this.playClick(920, 0.045);
    }
    return this.enabled;
  }

  /**
   * Modulates ambient field sound frequency based on hovered terrain elevation
   */
  updateElevationAcoustics(elev, seaLevel = 0) {
    if (!this.enabled || !this.ctx || !this.windFilter) return;
    const rel = elev - seaLevel;
    const targetFreq = rel >= 0
      ? 280 + Math.min(1, rel / 3500) * 680
      : 140 + Math.max(0, 1 + rel / 2000) * 120;
    this.windFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.12);
  }

  playClick(freq = 760, duration = 0.035) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + duration);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playWaypointPing(elev = 500) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq = elev >= 0 ? 587.33 : 329.63; // D5 for land, E4 for bathymetry

    [baseFreq, baseFreq * 1.498].forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.055);

      gain.gain.setValueAtTime(0.065, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.055 + 0.32);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.34);
    });
  }

  playRainDrop() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const f = 900 + Math.random() * 950;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, now + 0.04);

    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}
