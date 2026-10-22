/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Order Ringtone Synthesizer for TumpangGo Food Merchant.
 * Uses Web Audio API to create a realistic telephone ring pattern (dual frequency tone).
 * 
 * Benefits:
 * - Zero external assets (no MP3 loading errors, no CDN latency, 100% offline capable)
 * - Complies with W3C Autoplay Policy (safe resume on user gesture)
 * - Realistic phone call cadence (ring... ring... pause... repeat)
 * - Mute control, test tone preview, and state listeners
 */

class OrderRingtonePlayer {
  private audioCtx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private isMutedState: boolean = false;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeGainNodes: GainNode[] = [];
  private statusListeners: Array<(isRinging: boolean, isMuted: boolean, isUnlocked: boolean) => void> = [];

  constructor() {
    // Check saved mute preference in local storage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tumpang_merchant_ringtone_muted');
        this.isMutedState = saved === 'true';
      } catch {
        this.isMutedState = false;
      }
    }
  }

  /**
   * Initializes or resumes the AudioContext on user interaction
   */
  public async unlock(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return false;
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.notifyListeners();
      return this.audioCtx.state === 'running';
    } catch (e) {
      console.warn('[OrderRingtone] Failed to unlock AudioContext:', e);
      return false;
    }
  }

  public isUnlocked(): boolean {
    return !!(this.audioCtx && this.audioCtx.state === 'running');
  }

  public isRinging(): boolean {
    return this.isPlaying;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tumpang_merchant_ringtone_muted', muted ? 'true' : 'false');
      } catch {}
    }

    if (muted && this.isPlaying) {
      this.stopRinging();
    }
    this.notifyListeners();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMutedState);
    return this.isMutedState;
  }

  public subscribe(cb: (isRinging: boolean, isMuted: boolean, isUnlocked: boolean) => void): () => void {
    this.statusListeners.push(cb);
    cb(this.isPlaying, this.isMutedState, this.isUnlocked());
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== cb);
    };
  }

  private notifyListeners(): void {
    const isRing = this.isPlaying;
    const isMute = this.isMutedState;
    const isUnl = this.isUnlocked();
    this.statusListeners.forEach(cb => cb(isRing, isMute, isUnl));
  }

  /**
   * Play a single telephone burst: 2 short ring pulses (ring-ring)
   * Dual frequencies: 440Hz + 480Hz (classic phone call ring tone)
   */
  private playPhoneBurst(durationSec = 1.6): void {
    if (!this.audioCtx || this.audioCtx.state !== 'running' || this.isMutedState) {
      return;
    }

    try {
      const now = this.audioCtx.currentTime;
      const masterGain = this.audioCtx.createGain();
      masterGain.connect(this.audioCtx.destination);
      masterGain.gain.setValueAtTime(0, now);

      // Pulse 1: 0.0s -> 0.7s
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.35, now + 0.05);
      masterGain.gain.setValueAtTime(0.35, now + 0.65);
      masterGain.gain.linearRampToValueAtTime(0, now + 0.7);

      // Pulse 2: 0.9s -> 1.55s
      masterGain.gain.setValueAtTime(0, now + 0.85);
      masterGain.gain.linearRampToValueAtTime(0.35, now + 0.9);
      masterGain.gain.setValueAtTime(0.35, now + 1.5);
      masterGain.gain.linearRampToValueAtTime(0, now + durationSec);

      // Frequency 1: 440 Hz (Standard Bell tone)
      const osc1 = this.audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);

      // Frequency 2: 480 Hz (Standard Bell tone pairing for phone ring)
      const osc2 = this.audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(now);
      osc2.start(now);

      osc1.stop(now + durationSec + 0.1);
      osc2.stop(now + durationSec + 0.1);

      this.activeOscillators.push(osc1, osc2);
      this.activeGainNodes.push(masterGain);

      // Cleanup finished nodes
      setTimeout(() => {
        this.activeOscillators = this.activeOscillators.filter(o => o !== osc1 && o !== osc2);
        this.activeGainNodes = this.activeGainNodes.filter(g => g !== masterGain);
      }, (durationSec + 0.2) * 1000);
    } catch (e) {
      console.warn('[OrderRingtone] Error during phone burst playback:', e);
    }
  }

  /**
   * Starts repetitive ringing until stopped or muted
   * Pattern: 1.6s burst -> 2.4s silence -> repeat (Total cycle: 4.0s)
   */
  public async startRinging(): Promise<void> {
    if (this.isMutedState) return;

    await this.unlock();

    if (!this.audioCtx || this.audioCtx.state !== 'running') {
      console.warn('[OrderRingtone] Cannot ring: AudioContext is locked. User interaction required.');
      return;
    }

    if (this.isPlaying) return; // already ringing

    this.isPlaying = true;
    this.notifyListeners();

    // First burst immediately
    this.playPhoneBurst();

    // Repeat every 4 seconds
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (!this.isPlaying || this.isMutedState) {
        this.stopRinging();
        return;
      }
      this.playPhoneBurst();
    }, 4000);
  }

  /**
   * Stops the ongoing ringtone
   */
  public stopRinging(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    // Stop and disconnect any currently running oscillators
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];

    this.activeGainNodes.forEach(g => {
      try {
        g.disconnect();
      } catch {}
    });
    this.activeGainNodes = [];

    this.isPlaying = false;
    this.notifyListeners();
  }

  /**
   * Plays a single test ring for 1.6 seconds to let merchant test the volume
   */
  public async playTestTone(): Promise<boolean> {
    const wasMuted = this.isMutedState;
    // Unmute temporarily for the test if muted
    if (wasMuted) {
      this.isMutedState = false;
    }

    const unlocked = await this.unlock();
    if (!unlocked) return false;

    this.playPhoneBurst();

    if (wasMuted) {
      setTimeout(() => {
        this.isMutedState = true;
        this.notifyListeners();
      }, 1700);
    }
    return true;
  }
}

export const orderRingtone = new OrderRingtonePlayer();
