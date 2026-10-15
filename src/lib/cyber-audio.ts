/**
 * Lightweight Web Audio API Synthesizer for High-Tech Robotics & Cyber UI
 * Generates instantaneous mechanical clicks, scanner hums, hydraulic hisses,
 * shutter snaps, and metallic dings without external audio files or network requests.
 */

type AudioListener = () => void;

class CyberAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scanningOsc1: OscillatorNode | null = null;
  private scanningOsc2: OscillatorNode | null = null;
  private scanningLfo: OscillatorNode | null = null;
  private scanningGain: GainNode | null = null;
  private isScanning = false;
  private isMutedState = false;
  private volumeState = 0.7;
  private listeners: Set<AudioListener> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const savedMute = localStorage.getItem("plp_audio_muted");
        if (savedMute !== null) this.isMutedState = savedMute === "true";
        const savedVol = localStorage.getItem("plp_audio_volume");
        if (savedVol !== null) {
          const parsed = parseFloat(savedVol);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) this.volumeState = parsed;
        }
      } catch {}
    }
  }

  public subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public getVolume(): number {
    return this.volumeState;
  }

  public setMuted(muted: boolean) {
    this.isMutedState = muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("plp_audio_muted", String(muted));
      } catch {}
    }
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volumeState, now + 0.05);
    }
    this.notify();
  }

  public setVolume(vol: number) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volumeState = clamped;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("plp_audio_volume", String(clamped));
      } catch {}
    }
    if (this.masterGain && this.ctx && !this.isMutedState) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(clamped, now + 0.05);
    }
    this.notify();
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(
          this.isMutedState ? 0 : this.volumeState,
          this.ctx.currentTime
        );
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getDestination(): AudioNode | null {
    this.getContext();
    return this.masterGain;
  }

  /**
   * Crisp mechanical cyber switch / tactile click
   */
  public playClick() {
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest || this.isMutedState) return;

    try {
      const now = ctx.currentTime;

      // Click snap (transient)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2600, now);
      filter.Q.setValueAtTime(3.5, now);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(now);
      osc.stop(now + 0.04);

      // Low mechanical latch thud
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(340, now);
      subOsc.frequency.exponentialRampToValueAtTime(90, now + 0.03);

      subGain.gain.setValueAtTime(0.18, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      subOsc.connect(subGain);
      subGain.connect(dest);

      subOsc.start(now);
      subOsc.stop(now + 0.035);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Hydraulic pressure hiss / pneumatic latch when an image is uploaded
   */
  public playHydraulicHiss() {
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest || this.isMutedState) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.16); // 160ms of noise
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(3800, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.16);

      // Soft metallic mechanical latch
      const latch = ctx.createOscillator();
      const latchGain = ctx.createGain();
      latch.type = "triangle";
      latch.frequency.setValueAtTime(420, now + 0.05);
      latch.frequency.exponentialRampToValueAtTime(110, now + 0.1);
      latchGain.gain.setValueAtTime(0.14, now + 0.05);
      latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      latch.connect(latchGain);
      latchGain.connect(dest);

      latch.start(now + 0.05);
      latch.stop(now + 0.11);
    } catch {}
  }

  /**
   * Short mechanical shutter / aperture click when segmentation completes
   */
  public playShutter() {
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest || this.isMutedState) return;

    try {
      const now = ctx.currentTime;

      // 1st blade click
      const blade1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      blade1.type = "triangle";
      blade1.frequency.setValueAtTime(2200, now);
      blade1.frequency.exponentialRampToValueAtTime(300, now + 0.03);
      gain1.gain.setValueAtTime(0.22, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      blade1.connect(gain1);
      gain1.connect(dest);
      blade1.start(now);
      blade1.stop(now + 0.035);

      // 2nd mechanical latch (40ms later)
      const blade2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      blade2.type = "sine";
      blade2.frequency.setValueAtTime(950, now + 0.04);
      blade2.frequency.exponentialRampToValueAtTime(120, now + 0.08);
      gain2.gain.setValueAtTime(0.2, now + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      blade2.connect(gain2);
      gain2.connect(dest);
      blade2.start(now + 0.04);
      blade2.stop(now + 0.09);
    } catch {}
  }

  /**
   * Subtle robotic scanner / servo motor hum loop during AI processing
   */
  public startScanningHum() {
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest || this.isScanning) return;

    try {
      this.isScanning = true;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(520, now);

      // Dual harmonic oscillators
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(108, now); // Fundamental

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(216, now); // 2nd harmonic

      // Slow LFO for servo motor pitch modulation
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.85, now);
      lfoGain.gain.setValueAtTime(14, now);

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.3);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      lfo.start(now);
      osc1.start(now);
      osc2.start(now);

      this.scanningOsc1 = osc1;
      this.scanningOsc2 = osc2;
      this.scanningLfo = lfo;
      this.scanningGain = gain;
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Stop robotic scanning hum smoothly
   */
  public stopScanningHum() {
    if (!this.isScanning || !this.ctx || !this.scanningGain) {
      this.isScanning = false;
      return;
    }

    try {
      const now = this.ctx.currentTime;
      this.scanningGain.gain.cancelScheduledValues(now);
      this.scanningGain.gain.linearRampToValueAtTime(0.001, now + 0.08);
      if (this.scanningOsc1) this.scanningOsc1.stop(now + 0.1);
      if (this.scanningOsc2) this.scanningOsc2.stop(now + 0.1);
      if (this.scanningLfo) this.scanningLfo.stop(now + 0.1);
    } catch {
      // Audio policy fallback
    } finally {
      this.scanningOsc1 = null;
      this.scanningOsc2 = null;
      this.scanningLfo = null;
      this.scanningGain = null;
      this.isScanning = false;
    }
  }

  /**
   * High-tech metallic ding / harmonic chime when PNG is ready
   */
  public playMetallicDing() {
    this.stopScanningHum();
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest || this.isMutedState) return;

    try {
      const now = ctx.currentTime;

      // Metallic partials (fundamental + inharmonic overtones for metallic ring)
      const partials = [
        { freq: 1180, gain: 0.18, decay: 0.45 },
        { freq: 2360, gain: 0.08, decay: 0.28 },
        { freq: 3540, gain: 0.04, decay: 0.18 },
      ];

      partials.forEach(({ freq, gain, decay }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(gain, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(g);
        g.connect(dest);

        osc.start(now);
        osc.stop(now + decay + 0.02);
      });
    } catch {}
  }

  /**
   * Alias for backwards compatibility
   */
  public playSuccessChime() {
    this.playMetallicDing();
  }
}

export const cyberAudio = new CyberAudioManager();
