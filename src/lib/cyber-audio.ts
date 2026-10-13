/**
 * Lightweight Web Audio API Synthesizer for High-Tech Robotics & Cyber UI
 * Generates instantaneous mechanical clicks, scanner hums, and success chimes
 * without external audio files or network requests.
 */

class CyberAudioManager {
  private ctx: AudioContext | null = null;
  private scanningOsc: OscillatorNode | null = null;
  private scanningGain: GainNode | null = null;
  private isScanning = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Crisp mechanical cyber switch / tactile click
   */
  public playClick() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Click snap (transient)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2400, now);
      filter.Q.setValueAtTime(3, now);

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.035);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);

      // Low mechanical thud
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(320, now);
      subOsc.frequency.exponentialRampToValueAtTime(80, now + 0.03);

      subGain.gain.setValueAtTime(0.18, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 0.035);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Subtle robotic scanner / servo motor hum during AI processing
   */
  public startScanningHum() {
    const ctx = this.getContext();
    if (!ctx || this.isScanning) return;

    try {
      this.isScanning = true;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(650, now);

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(280, now + 1.2);

      // Very subtle, comfortable hum volume
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);

      this.scanningOsc = osc;
      this.scanningGain = gain;
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Stop robotic scanning hum smoothly
   */
  public stopScanningHum() {
    if (!this.isScanning || !this.ctx || !this.scanningGain || !this.scanningOsc) {
      this.isScanning = false;
      return;
    }

    try {
      const now = this.ctx.currentTime;
      this.scanningGain.gain.linearRampToValueAtTime(0.001, now + 0.1);
      this.scanningOsc.stop(now + 0.12);
    } catch {
      // Audio policy fallback
    } finally {
      this.scanningOsc = null;
      this.scanningGain = null;
      this.isScanning = false;
    }
  }

  /**
   * Clean futuristic chime / system ready confirmation beep
   */
  public playSuccessChime() {
    this.stopScanningHum();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // High-tech two-tone chime
      const freqs = [880, 1318.5]; // A5 -> E6 harmonic fifth
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.001, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.38);
      });
    } catch {
      // Audio policy fallback
    }
  }
}

export const cyberAudio = new CyberAudioManager();
