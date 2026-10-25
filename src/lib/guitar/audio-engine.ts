import {
  CHORDS,
  CHORD_ORDER,
  TUNING_MIDI,
  midiToFrequency,
  type ChordId,
} from "@/lib/guitar/chords";

export type StrumDirection = "down" | "up";

type Pluck = {
  buffer: AudioBuffer;
  /** Buffer is rendered at its nearest integer period, then resampled to pitch. */
  playbackRate: number;
};

type Voice = { source: AudioBufferSourceNode; gain: GainNode };

/** Subtle stereo spread + detune so six strings read as one instrument. */
const STRING_PAN = [-0.34, -0.19, -0.05, 0.09, 0.22, 0.36];
const STRING_DETUNE_CENTS = [0, -1.8, 1.4, -1.1, 2.0, -0.7];
const STRING_LEVEL = [1, 0.97, 0.94, 0.9, 0.87, 0.84];

const RENDER_SECONDS = 4.2;

/**
 * A small Karplus-Strong (plucked string) synth.
 *
 * Each unique pitch is rendered once into an AudioBuffer by running a delay
 * line filled with filtered noise through a lossy lowpass feedback loop. Audio
 * buffers are then played through per-string panners into a shared guitar bus
 * (EQ + reverb + compressor), which sounds far closer to a real acoustic
 * guitar than oscillator stacks and costs almost nothing at playback time.
 */
export class GuitarEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stringBus: GainNode | null = null;
  private palmFilter: BiquadFilterNode | null = null;
  private reverbSend: GainNode | null = null;
  private cache = new Map<number, Pluck>();
  private voices = new Set<Voice>();
  private disposed = false;
  private prewarmTimer: number | null = null;

  private muted = false;
  private volume = 0.85;
  private reverbAmount = 0.28;
  /** 变调夹: every sounding pitch is raised by this many semitones. */
  private capo = 0;

  get isReady() {
    return this.ctx !== null;
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000;
  }

  /** The underlying context, so schedulers can read `currentTime`. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
      return;
    }

    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.volume;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.3;

    const bus = ctx.createGain();
    bus.gain.value = 1;

    const palm = ctx.createBiquadFilter();
    palm.type = "lowpass";
    palm.frequency.value = 16500;
    palm.Q.value = 0.5;

    // Acoustic-guitar body: a low Helmholtz bump, warmth around 200 Hz, a dip
    // for the boxy mid, presence near 2.4 kHz, and a gentle top-end cut so the
    // plucked-string highs never turn into fizz.
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 105;
    body.Q.value = 0.9;
    body.gain.value = 3.5;

    const wood = ctx.createBiquadFilter();
    wood.type = "peaking";
    wood.frequency.value = 210;
    wood.Q.value = 1.1;
    wood.gain.value = 1.8;

    const box = ctx.createBiquadFilter();
    box.type = "peaking";
    box.frequency.value = 520;
    box.Q.value = 1.2;
    box.gain.value = -2.2;

    const air = ctx.createBiquadFilter();
    air.type = "peaking";
    air.frequency.value = 2400;
    air.Q.value = 0.7;
    air.gain.value = 1.6;

    const fizz = ctx.createBiquadFilter();
    fizz.type = "lowpass";
    fizz.frequency.value = 7200;
    fizz.Q.value = 0.6;

    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = "highpass";
    rumbleCut.frequency.value = 60;

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = this.reverbAmount * 0.5;

    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = this.buildImpulse(ctx);

    const wet = ctx.createGain();
    wet.gain.value = 1;

    bus.connect(palm);
    palm.connect(body);
    body.connect(wood);
    wood.connect(box);
    box.connect(air);
    air.connect(fizz);
    fizz.connect(rumbleCut);
    rumbleCut.connect(compressor);
    rumbleCut.connect(reverbSend);
    reverbSend.connect(convolver);
    convolver.connect(wet);
    wet.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    this.master = master;
    this.stringBus = bus;
    this.palmFilter = palm;
    this.reverbSend = reverbSend;

    // Autoplay policy: a suspended context cannot resume without a gesture.
    // Never block startup on it — `unlock()` retries on the first interaction.
    if (ctx.state === "suspended") {
      void Promise.race([
        ctx.resume().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
    }
    this.schedulePrewarm();
  }

  /** Call from a real user gesture to satisfy the browser autoplay policy. */
  async unlock() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "suspended") return;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }

  /** Synthesises a plucked string into a buffer: Karplus-Strong, one period of noise. */
  private renderPluck(midi: number, ctx: AudioContext): Pluck {
    const sr = ctx.sampleRate;
    const freq = midiToFrequency(midi);
    const period = Math.max(4, Math.round(sr / freq));
    const naturalFreq = sr / period;
    const length = Math.floor(RENDER_SECONDS * sr);

    const out = new Float32Array(length);

    // Initial condition: the shape of a string plucked at `pluckPoint` — a
    // triangle. Classic Karplus-Strong feeds the delay line with noise, which
    // gives every harmonic a random amplitude: the fundamental can end up
    // weaker than its neighbours, and that is what makes a noise-excited KS
    // sound hollow and metallic. A triangle has the natural 1/n² string
    // spectrum plus the pick-position nulls.
    const pluckPoint = 0.12 + ((midi - 40) / 28) * 0.1;
    const excitation = new Float32Array(period);
    let mean = 0;
    for (let i = 0; i < period; i++) {
      const x = i / period;
      const triangle = x < pluckPoint ? x / pluckPoint : (1 - x) / (1 - pluckPoint);
      excitation[i] = triangle;
      mean += triangle;
    }
    mean /= period;

    // A little filtered noise keeps successive plucks from being identical
    // (pick texture) without dominating the harmonic balance.
    let lp = 0;
    for (let i = 0; i < period; i++) {
      const white = Math.random() * 2 - 1;
      lp = lp * 0.55 + white * 0.45;
      excitation[i] = excitation[i] - mean + lp * 0.2;
    }

    // Long ring: ~4.5 s on the low strings, ~2.6 s up the neck.
    const t60 = 2.6 + 1.9 * Math.max(0, 1 - (freq - 82) / 280);
    const retention = Math.pow(0.001, period / (t60 * sr));
    // 0.5 = classic two-tap averaging lowpass (natural highs roll-off).
    const brightness = 0.5;

    for (let i = 0; i < period; i++) out[i] = excitation[i];
    out[period] = out[0] * 0.5 + out[1] * 0.5;

    let peak = 0;
    for (let i = period + 1; i < length; i++) {
      const a = out[i - period];
      const b = out[i - period - 1];
      const value = (brightness * a + (1 - brightness) * b) * retention;
      out[i] = value;
      const magnitude = value < 0 ? -value : value;
      if (magnitude > peak) peak = magnitude;
    }

    // Normalise, then trim clicks at both ends.
    const norm = peak > 0 ? 0.9 / peak : 1;
    const fadeIn = Math.min(144, length);
    const fadeOut = Math.min(Math.floor(sr * 0.15), length);
    for (let i = 0; i < length; i++) {
      out[i] *= norm;
      if (i < fadeIn) out[i] *= i / fadeIn;
      const fromEnd = length - 1 - i;
      if (fromEnd < fadeOut) out[i] *= fromEnd / fadeOut;
    }

    const buffer = ctx.createBuffer(1, length, sr);
    buffer.copyToChannel(out, 0);

    return { buffer, playbackRate: freq / naturalFreq };
  }

  private getPluck(midi: number): Pluck | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const cached = this.cache.get(midi);
    if (cached) return cached;
    const pluck = this.renderPluck(midi, ctx);
    this.cache.set(midi, pluck);
    return pluck;
  }

  /** Synthesised stereo room: a darkening noise tail plus early reflections. */
  private buildImpulse(ctx: AudioContext, seconds = 1.9, decay = 2.4) {
    const length = Math.floor(seconds * ctx.sampleRate);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const taps = [0.008, 0.015, 0.023, 0.037, 0.052, 0.073];

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let lowpass = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const white = Math.random() * 2 - 1;
        // The tail gets darker as it dies away, like a real room. A raw noise
        // tail sounds like hiss and makes the whole guitar sound cheap.
        const coeff = 0.2 + 0.55 * t;
        lowpass = lowpass * coeff + white * (1 - coeff);
        data[i] = lowpass * Math.pow(1 - t, decay) * 2.2;
      }
      for (let k = 0; k < taps.length; k++) {
        const index = Math.floor(taps[k] * ctx.sampleRate) + channel * 29;
        if (index < length) data[index] += (k % 2 === 0 ? 0.35 : -0.26) * Math.pow(0.7, k);
      }
      for (let i = 0; i < 48; i++) data[i] *= i / 48;
    }

    return impulse;
  }

  private playString(
    stringIndex: number,
    midi: number,
    when: number,
    velocity: number,
    detuneCents: number,
  ) {
    const ctx = this.ctx;
    const bus = this.stringBus;
    if (!ctx || !bus) return;
    const pluck = this.getPluck(midi);
    if (!pluck) return;

    const source = ctx.createBufferSource();
    source.buffer = pluck.buffer;
    source.playbackRate.value = pluck.playbackRate * Math.pow(2, detuneCents / 1200);

    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = STRING_PAN[stringIndex] ?? 0;

    const duration = pluck.buffer.duration / source.playbackRate.value;
    const peak = Math.max(0.03, 0.3 * velocity * (STRING_LEVEL[stringIndex] ?? 1));

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.004);
    gain.gain.setValueAtTime(peak, when + Math.max(0.02, duration - 0.18));
    gain.gain.linearRampToValueAtTime(0, when + duration);

    source.connect(gain);
    gain.connect(pan);
    pan.connect(bus);

    source.start(when);
    source.stop(when + duration + 0.05);

    const voice: Voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      try {
        gain.disconnect();
        pan.disconnect();
      } catch {
        /* already detached */
      }
    };
  }

  /**
   * Strum the given chord. `direction` decides string order and pick stagger,
   * `velocity` (0..1) scales loudness — the gesture layer derives it from hand
   * speed so a lazy strum is soft and a fast one is loud.
   */
  strum(chord: ChordId | null, direction: StrumDirection, velocity = 0.8) {
    const ctx = this.ctx;
    if (!ctx || !chord || this.muted) return;
    const def = CHORDS[chord];
    if (!def) return;

    const strings = def.frets
      .map((fret, index) => ({ fret, index }))
      .filter((entry) => entry.fret >= 0);
    if (direction === "up") strings.reverse();

    const now = ctx.currentTime + 0.015;
    const stagger = direction === "down" ? 0.01 : 0.008;
    const shape = velocity * (direction === "up" ? 0.82 : 1);

    strings.forEach((entry, order) => {
      const midi = TUNING_MIDI[entry.index] + entry.fret + this.capo;
      const humanise = 0.92 + Math.random() * 0.16;
      const jitter = (Math.random() - 0.5) * 0.0035;
      const panic = order === 0 ? 1.05 : 1;
      this.playString(
        entry.index,
        midi,
        now + order * stagger + jitter,
        Math.min(1, shape * humanise * panic),
        STRING_DETUNE_CENTS[entry.index] ?? 0,
      );
    });

    // Ensure the noise buffers exist for the notes we just queued.
    for (const entry of strings) {
      this.getPluck(TUNING_MIDI[entry.index] + entry.fret + this.capo);
    }
  }

  /**
   * Pluck a single string — the building block of 分解和弦 (fingerpicking).
   * Returns the MIDI note that sounded, or null when the chord mutes that string.
   */
  pluck(chord: ChordId | null, stringIndex: number, velocity = 0.8, when?: number): number | null {
    const ctx = this.ctx;
    if (!ctx || !chord || this.muted) return null;
    const fret = CHORDS[chord]?.frets[stringIndex];
    if (fret === undefined || fret < 0) return null;

    const midi = TUNING_MIDI[stringIndex] + fret + this.capo;
    const at = when ?? ctx.currentTime + 0.012;
    this.playString(
      stringIndex,
      midi,
      at,
      Math.min(1, Math.max(0.05, velocity * (0.94 + Math.random() * 0.12))),
      STRING_DETUNE_CENTS[stringIndex] ?? 0,
    );
    return midi;
  }

  /** 变调夹: 0 = off, 1..7 frets. Shapes stay the same, pitch goes up. */
  setCapo(semitones: number) {
    const next = Math.max(0, Math.min(7, Math.round(semitones)));
    if (next === this.capo) return;
    this.capo = next;
    // Pre-render the transposed strings so the next strum has no render hitch.
    if (this.ctx) this.schedulePrewarm();
  }

  get capoPosition() {
    return this.capo;
  }

  /** Palm mute: darkens the bus and cuts ringing notes, like a muted strum. */
  setMuted(muted: boolean) {
    this.muted = muted;
    const ctx = this.ctx;
    if (!ctx || !this.palmFilter || !this.stringBus) return;
    const now = ctx.currentTime;
    this.palmFilter.frequency.cancelScheduledValues(now);
    this.palmFilter.frequency.setTargetAtTime(muted ? 900 : 16500, now, 0.02);
    this.stringBus.gain.cancelScheduledValues(now);
    this.stringBus.gain.setTargetAtTime(muted ? 0.5 : 1, now, 0.02);
    if (muted) this.cutVoices(0.04);
  }

  get isMuted() {
    return this.muted;
  }

  private cutVoices(release: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, release);
        voice.source.stop(now + release * 4);
      } catch {
        /* voice already stopped */
      }
    }
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.03);
  }

  setReverb(value: number) {
    this.reverbAmount = Math.min(1, Math.max(0, value));
    const ctx = this.ctx;
    if (!ctx || !this.reverbSend) return;
    this.reverbSend.gain.setTargetAtTime(this.reverbAmount * 0.5, ctx.currentTime, 0.05);
  }

  /** Keyboard / touch fallback: one-shot chord, no gestures involved. */
  playChord(chord: ChordId, velocity = 0.8) {
    this.strum(chord, "down", velocity);
  }

  private schedulePrewarm() {
    if (this.prewarmTimer !== null) window.clearTimeout(this.prewarmTimer);
    let index = 0;
    const step = () => {
      if (this.disposed || !this.ctx) return;
      const chord = CHORD_ORDER[index++];
      if (!chord) {
        this.prewarmTimer = null;
        return;
      }
      for (const midi of CHORDS[chord].midis) this.getPluck(midi + this.capo);
      this.prewarmTimer = window.setTimeout(step, 16);
    };
    this.prewarmTimer = window.setTimeout(step, 40);
  }

  async dispose() {
    this.disposed = true;
    if (this.prewarmTimer !== null) window.clearTimeout(this.prewarmTimer);
    this.voices.clear();
    this.cache.clear();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* already closed */
      }
    }
  }
}
