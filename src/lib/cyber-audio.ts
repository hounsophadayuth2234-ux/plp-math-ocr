/**
 * Studio Web Audio API Synthesizer Engine
 * Generates instantaneous synthesized feedback: clicks, uploads, completions,
 * shutters, chimes, and previews using Web Audio API nodes without external assets.
 */

export type SoundPreset =
  | "cyber_scifi"
  | "soft_chime"
  | "mechanical_click"
  | "crystal_bell"
  | "mute";

export interface SoundPresetInfo {
  id: SoundPreset;
  nameKhmer: string;
  nameEn: string;
  description: string;
}

export const SOUND_PRESETS: SoundPresetInfo[] = [
  {
    id: "cyber_scifi",
    nameKhmer: "ស៊ីបឺ សាយហ្វាយ",
    nameEn: "Cyber Sci-Fi",
    description: "Frequency sweeps, crisp blips, and resonant futuristic tones",
  },
  {
    id: "soft_chime",
    nameKhmer: "សំឡេងទន់ភ្លន់",
    nameEn: "Soft Chime",
    description: "Gentle harmonic sine waves & warm soothing chords",
  },
  {
    id: "mechanical_click",
    nameKhmer: "ចុចម៉ាស៊ីន",
    nameEn: "Mechanical Click",
    description: "Tactile relay switch clicks, camera shutter & mechanical latch",
  },
  {
    id: "crystal_bell",
    nameKhmer: "ជួងកែវគ្រីស្តាល់",
    nameEn: "Crystal Bell",
    description: "FM synthesis crystalline glass pings & sparkling bell decay",
  },
  {
    id: "mute",
    nameKhmer: "បិទសំឡេង",
    nameEn: "Mute",
    description: "Completely silent operation",
  },
];

type AudioListener = () => void;

class CyberAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scanningOsc1: OscillatorNode | null = null;
  private scanningOsc2: OscillatorNode | null = null;
  private scanningLfo: OscillatorNode | null = null;
  private scanningGain: GainNode | null = null;
  private isScanning = false;
  private isMutedState = true;
  private volumeState = 0.7;
  private currentPreset: SoundPreset = "cyber_scifi";
  private listeners: Set<AudioListener> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const savedPreset = localStorage.getItem("plp_sound_preset") as SoundPreset | null;
        if (savedPreset && SOUND_PRESETS.some((p) => p.id === savedPreset)) {
          this.currentPreset = savedPreset;
          if (savedPreset === "mute") {
            this.isMutedState = true;
          }
        }
        const savedMute = localStorage.getItem("plp_audio_muted");
        if (savedMute !== null) {
          this.isMutedState = savedMute === "true";
        } else if (this.currentPreset !== "mute") {
          // Default unmuted for audio previews if not explicitly muted
          this.isMutedState = false;
        }
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
    return this.isMutedState || this.currentPreset === "mute";
  }

  public getVolume(): number {
    return this.volumeState;
  }

  public getPreset(): SoundPreset {
    return this.currentPreset;
  }

  public setPreset(preset: SoundPreset, preview = true) {
    this.currentPreset = preset;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("plp_sound_preset", preset);
      } catch {}
    }

    if (preset === "mute") {
      this.setMuted(true);
    } else {
      if (this.isMutedState) {
        this.setMuted(false);
      }
      if (preview) {
        this.previewPreset(preset);
      }
    }
    this.notify();
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
    if (this.masterGain && this.ctx && !this.isMuted()) {
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
          this.isMuted() ? 0 : this.volumeState,
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
   * Preview a sound preset with its signature sound cue
   */
  public previewPreset(preset: SoundPreset) {
    if (preset === "mute") return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

    try {
      const now = ctx.currentTime;
      if (preset === "cyber_scifi") {
        // Fast dual electronic chirp
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.06);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (preset === "soft_chime") {
        // Warm major third sine chime (C5 + E5 + G5)
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);
          g.gain.setValueAtTime(0.001, now + idx * 0.04);
          g.gain.linearRampToValueAtTime(0.18, now + idx * 0.04 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.35);
          osc.connect(g);
          g.connect(dest);
          osc.start(now + idx * 0.04);
          osc.stop(now + idx * 0.04 + 0.38);
        });
      } else if (preset === "mechanical_click") {
        // Authentic shutter clack
        const click = ctx.createOscillator();
        const gClick = ctx.createGain();
        click.type = "triangle";
        click.frequency.setValueAtTime(2400, now);
        click.frequency.exponentialRampToValueAtTime(220, now + 0.04);
        gClick.gain.setValueAtTime(0.28, now);
        gClick.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        click.connect(gClick);
        gClick.connect(dest);
        click.start(now);
        click.stop(now + 0.045);

        const latch = ctx.createOscillator();
        const gLatch = ctx.createGain();
        latch.type = "sine";
        latch.frequency.setValueAtTime(550, now + 0.05);
        latch.frequency.exponentialRampToValueAtTime(110, now + 0.09);
        gLatch.gain.setValueAtTime(0.22, now + 0.05);
        gLatch.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        latch.connect(gLatch);
        gLatch.connect(dest);
        latch.start(now + 0.05);
        latch.stop(now + 0.1);
      } else if (preset === "crystal_bell") {
        // High-pitched FM crystal bell
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const mainGain = ctx.createGain();

        carrier.type = "sine";
        carrier.frequency.setValueAtTime(1760, now); // A6
        modulator.type = "sine";
        modulator.frequency.setValueAtTime(987, now); // B5 (inharmonic ratio)

        modGain.gain.setValueAtTime(600, now);
        modGain.gain.exponentialRampToValueAtTime(10, now + 0.3);

        mainGain.gain.setValueAtTime(0.001, now);
        mainGain.gain.linearRampToValueAtTime(0.22, now + 0.008);
        mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(mainGain);
        mainGain.connect(dest);

        modulator.start(now);
        carrier.start(now);
        modulator.stop(now + 0.46);
        carrier.stop(now + 0.46);
      }
    } catch {}
  }

  /**
   * Crisp UI click / toggle sound according to active preset
   */
  public playClick() {
    if (this.isMuted()) return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

    try {
      const now = ctx.currentTime;
      const preset = this.currentPreset;

      if (preset === "cyber_scifi") {
        // Crisp high-tech sweep blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2600, now);
        filter.Q.setValueAtTime(3.5, now);

        osc.type = "triangle";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (preset === "soft_chime") {
        // Soft rounded sine drop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(560, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.045);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.055);
      } else if (preset === "mechanical_click") {
        // Tactile relay switch click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(2800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.025);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(220, now);
        sub.frequency.exponentialRampToValueAtTime(70, now + 0.03);
        subGain.gain.setValueAtTime(0.18, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(dest);
        sub.connect(subGain);
        subGain.connect(dest);

        osc.start(now);
        sub.start(now);
        osc.stop(now + 0.03);
        sub.stop(now + 0.035);
      } else if (preset === "crystal_bell") {
        // Tiny glass bead ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(2400, now);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.035);
      }
    } catch {}
  }

  /**
   * Sound on image upload / intake latch
   */
  public playHydraulicHiss() {
    if (this.isMuted()) return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

    try {
      const now = ctx.currentTime;
      const preset = this.currentPreset;

      if (preset === "cyber_scifi") {
        // Cyber frequency sweep + white noise hiss
        const bufferSize = Math.floor(ctx.sampleRate * 0.15);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(3600, now);
        filter.frequency.exponentialRampToValueAtTime(1100, now + 0.14);
        filter.Q.setValueAtTime(2.5, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        whiteNoise.start(now);
        whiteNoise.stop(now + 0.15);
      } else if (preset === "soft_chime") {
        // Gentle warm intake pad
        [392.0, 493.88, 587.33].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          g.gain.setValueAtTime(0.001, now + idx * 0.03);
          g.gain.linearRampToValueAtTime(0.14, now + idx * 0.03 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.28);
          osc.connect(g);
          g.connect(dest);
          osc.start(now + idx * 0.03);
          osc.stop(now + idx * 0.03 + 0.3);
        });
      } else if (preset === "mechanical_click") {
        // Heavy camera mirror flap & latch
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        g.gain.setValueAtTime(0.24, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (preset === "crystal_bell") {
        // Shimmering crystalline chime sweep
        [1046.5, 1318.5, 1567.98].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(f, now + idx * 0.03);
          g.gain.setValueAtTime(0.001, now + idx * 0.03);
          g.gain.linearRampToValueAtTime(0.16, now + idx * 0.03 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.35);
          osc.connect(g);
          g.connect(dest);
          osc.start(now + idx * 0.03);
          osc.stop(now + idx * 0.03 + 0.36);
        });
      }
    } catch {}
  }

  /**
   * Mechanical shutter sound
   */
  public playShutter() {
    if (this.isMuted()) return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

    try {
      const now = ctx.currentTime;
      // Dual-blade camera shutter click-clack
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
   * Loop scanner hum during AI inference
   */
  public startScanningHum() {
    if (this.isMuted() || this.isScanning) return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

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

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(108, now);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(216, now);

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
    } catch {}
  }

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
    } catch {} finally {
      this.scanningOsc1 = null;
      this.scanningOsc2 = null;
      this.scanningLfo = null;
      this.scanningGain = null;
      this.isScanning = false;
    }
  }

  /**
   * High-tech chime / completion sound according to active preset
   */
  public playMetallicDing() {
    this.stopScanningHum();
    if (this.isMuted()) return;
    const ctx = this.getContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;

    try {
      const now = ctx.currentTime;
      const preset = this.currentPreset;

      if (preset === "cyber_scifi") {
        // High-tech cyber dual resonant ring
        [1180, 2360, 3540].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now);
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.08, now + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, now + (0.45 - i * 0.1));
          osc.connect(g);
          g.connect(dest);
          osc.start(now);
          osc.stop(now + 0.48);
        });
      } else if (preset === "soft_chime") {
        // Soothing warm major triad chord
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + idx * 0.03);
          g.gain.setValueAtTime(0.001, now + idx * 0.03);
          g.gain.linearRampToValueAtTime(0.18, now + idx * 0.03 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.6);
          osc.connect(g);
          g.connect(dest);
          osc.start(now + idx * 0.03);
          osc.stop(now + idx * 0.03 + 0.65);
        });
      } else if (preset === "mechanical_click") {
        // Solid metallic service bell ring
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1420, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.26, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.52);

        const overtone = ctx.createOscillator();
        const gOver = ctx.createGain();
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(2850, now);
        gOver.gain.setValueAtTime(0.001, now);
        gOver.gain.linearRampToValueAtTime(0.1, now + 0.005);
        gOver.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        overtone.connect(gOver);
        gOver.connect(dest);
        overtone.start(now);
        overtone.stop(now + 0.28);
      } else if (preset === "crystal_bell") {
        // FM crystalline bell chime
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const mainGain = ctx.createGain();

        carrier.type = "sine";
        carrier.frequency.setValueAtTime(1318.5, now); // E6
        modulator.type = "sine";
        modulator.frequency.setValueAtTime(987.77, now); // B5

        modGain.gain.setValueAtTime(750, now);
        modGain.gain.exponentialRampToValueAtTime(8, now + 0.6);

        mainGain.gain.setValueAtTime(0.001, now);
        mainGain.gain.linearRampToValueAtTime(0.24, now + 0.006);
        mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(mainGain);
        mainGain.connect(dest);

        modulator.start(now);
        carrier.start(now);
        modulator.stop(now + 0.88);
        carrier.stop(now + 0.88);
      }
    } catch {}
  }

  public playSuccessChime() {
    this.playMetallicDing();
  }

  /**
   * Mask mode switch tone
   */
  public playMaskSwitch() {
    this.playClick();
  }
}

export const cyberAudio = new CyberAudioManager();
