import type { Settings } from '../../types'

/**
 * Layered audio engine.
 *
 * The game ships with no audio files, so every sound here is synthesised at
 * runtime through Web Audio: filtered noise beds for wind/stream/traffic, soft
 * oscillator pads for the music, and short shaped bursts for one-shots. It is
 * deliberately quiet and sparse rather than a wall of synth tones.
 *
 * Dropping a real file into `public/audio/...` overrides the generated version
 * for that slot — see `FILE_SLOTS` and PERSONALIZE.md. Missing files are not an
 * error; the generator simply keeps playing.
 */

type AmbienceId =
  | 'bedroom'
  | 'cottage'
  | 'town'
  | 'forest'
  | 'water'
  | 'mountain'
  | 'transition'
  | 'parkingLot'
  | 'car'
  | 'none'

type MusicId =
  | 'title'
  | 'cottage'
  | 'town'
  | 'forest'
  | 'crossing'
  | 'mountain'
  | 'stars'
  | 'transition'
  | 'lot'
  | 'ending'
  | 'none'

export interface TrafficPassOptions {
  /** -1 = right-to-left, 1 = left-to-right. */
  direction?: -1 | 1
  /** Normalized listener distance. 0 is close; 1 is far. */
  distance?: number
  /** Relative vehicle speed. 1 is an ordinary city-road pass. */
  speed?: number
}

/** Optional file overrides. Drop a file at the path and it takes over that slot. */
const FILE_SLOTS: Record<string, string> = {
  'music:title': '/audio/music/title.mp3',
  'music:cottage': '/audio/music/cottage.mp3',
  'music:town': '/audio/music/town.mp3',
  'music:forest': '/audio/music/forest.mp3',
  'music:crossing': '/audio/music/crossing.mp3',
  'music:mountain': '/audio/music/mountain.mp3',
  'music:stars': '/audio/music/stars.mp3',
  'music:transition': '/audio/music/transition.mp3',
  'music:lot': '/audio/music/parking-lot.mp3',
  'music:ending': '/audio/music/ending.mp3',
  'ambience:bedroom': '/audio/ambience/bedroom.mp3',
  'ambience:cottage': '/audio/ambience/cottage.mp3',
  'ambience:town': '/audio/ambience/town.mp3',
  'ambience:forest': '/audio/ambience/forest.mp3',
  'ambience:water': '/audio/ambience/water.mp3',
  'ambience:mountain': '/audio/ambience/mountain.mp3',
  'ambience:transition': '/audio/ambience/transition.mp3',
  'ambience:parkingLot': '/audio/ambience/parking-lot.mp3',
  'ambience:car': '/audio/ambience/car.mp3',
}

const SEMITONE = Math.pow(2, 1 / 12)
const note = (midi: number) => 440 * Math.pow(SEMITONE, midi - 69)

type Motif = [number | null, number][]

/**
 * The layer that makes a biome sound like itself. The pads and motifs carry the
 * tune from chapter to chapter; this is the air around it, and no two chapters
 * use the same one.
 */
type MusicTexture =
  | 'none'
  | 'hearth'
  | 'pluck'
  | 'breath'
  | 'drip'
  | 'wind'
  | 'bell'
  | 'seam'
  | 'hum'
  | 'chime'

interface MusicTheme {
  /** MIDI root. */
  root: number
  /** Chord voicings as semitone offsets from root. */
  chords: number[][]
  /** Seconds per chord. */
  chordTime: number
  /** Melody as [semitone offset, beats] pairs; null = rest. */
  motif: Motif
  /** Seconds per beat for the motif. */
  beat: number
  /** How often the motif plays, in chords. 0 = never. */
  motifEvery: number
  padGain: number
  motifGain: number
  bassGain: number
  /** Oscillator colour. */
  padType: OscillatorType
  motifType: OscillatorType
  detune: number
  /**
   * Pad lowpass corner, in Hz. The single biggest reason two chapters built
   * from the same oscillators do not sound alike: a closed room, an open
   * street and a night sky are mostly a question of how much top is left on.
   */
  cutoff: number
  texture: MusicTexture
  textureGain: number
  /**
   * The chapter this one is a remix of. Its motif is thinned out and played
   * slow and low underneath, so every chapter half-remembers the one before it
   * instead of starting a new piece. null seeds a lineage.
   */
  carry: Exclude<MusicId, 'none'> | null
  carryGain: number
}

/**
 * The two motifs the whole score is built from:
 * the Cheetah figure (rising, moving) and the Peach figure (falling, settling).
 * Every chapter theme is one of them, re-harmonised.
 */
const CHEETAH_MOTIF: Motif = [
  [0, 1], [7, 1], [9, 2], [7, 1], [4, 3], [null, 2],
]
const PEACH_MOTIF: Motif = [
  [12, 2], [9, 1], [7, 2], [4, 1], [5, 2], [4, 3], [null, 2],
]

/**
 * Motif transforms. Later chapters are written as one of these applied to an
 * earlier chapter's line, so the score keeps reworking its own material.
 *
 * Only pitch-preserving operations live here — reversing, stretching, thinning,
 * octave shifts. A derived line therefore sits against its chords exactly as
 * consonantly as the line it came from, which is what makes deriving one tune
 * from another safe to do in code rather than by ear.
 */
const retrograde = (m: Motif): Motif => [...m].reverse()
const augment = (m: Motif, factor: number): Motif =>
  m.map(([s, b]): [number | null, number] => [s, b * factor])
const octave = (m: Motif, n: number): Motif =>
  m.map(([s, b]): [number | null, number] => [s == null ? null : s + n * 12, b])
/** Keeps every other sounding note; the rest become rests of the same length. */
const thin = (m: Motif): Motif => {
  let heard = 0
  return m.map(([s, b]): [number | null, number] =>
    s == null ? [null, b] : [heard++ % 2 === 0 ? s : null, b],
  )
}
const fragment = (m: Motif, n: number): Motif => m.slice(0, n)

/**
 * Chapter-specific figures, so no two biomes play the same tune. Each is still
 * drawn from the same slow, gentle language as the two core motifs — long
 * notes, frequent rests, stepwise motion — so the score stays one ethereal
 * piece rather than becoming a medley.
 */
// Home — small and circular, never leaving the tonic for long.
const HOME_MOTIF: Motif = [
  [4, 2], [2, 1], [0, 3], [null, 1], [-3, 2], [0, 2], [null, 3],
]
// Forest — a wandering line that keeps drifting a step further out.
const WANDER_MOTIF: Motif = [
  [0, 2], [2, 1], [3, 2], [7, 1], [5, 3], [2, 2], [null, 3],
]
// Crossing — suspended, two notes held apart like a held breath.
const HOLD_MOTIF: Motif = [
  [7, 3], [null, 1], [9, 2], [7, 4], [4, 2], [null, 3],
]
// Mountain — the crossing figure heard backwards and a shade quicker: the same
// held breath, now climbing instead of waiting.
const CLIMB_MOTIF: Motif = augment(retrograde(HOLD_MOTIF), 0.85)
// Stars — sparse high points, counted one at a time.
const STAR_MOTIF: Motif = [
  [12, 3], [null, 2], [16, 2], [null, 2], [11, 3], [null, 4],
]
// Road — the long straight one, the only figure that actually goes somewhere.
const ROAD_MOTIF: Motif = [
  [0, 2], [4, 1], [7, 2], [12, 3], [11, 1], [7, 4], [null, 2],
]
// Lot — the road tune worn down to its first three notes and stretched out,
// the way a drive sounds once you have already arrived.
const LOT_MOTIF: Motif = fragment(augment(ROAD_MOTIF, 1.4), 3)
// Ending — the Peach figure resolving downward, finally landing on the tonic.
const RETURN_MOTIF: Motif = [
  [12, 2], [11, 1], [7, 2], [4, 2], [2, 1], [0, 4], [null, 3],
]

/**
 * One theme per biome. Read the `carry` column top to bottom and it is a single
 * piece being rewritten as she travels: the menu tune follows her into the
 * bedroom, the bedroom tune follows her into town, and so on down the road —
 * until the ending reaches back past all of it to the cottage she started in.
 */
export const THEMES: Record<Exclude<MusicId, 'none'>, MusicTheme> = {
  title: {
    root: 53, chords: [[0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 7], [2, 5, 9, 12]],
    chordTime: 7, motif: PEACH_MOTIF, beat: 0.62, motifEvery: 2,
    padGain: 0.1, motifGain: 0.055, bassGain: 0.05, padType: 'triangle', motifType: 'sine', detune: 5,
    cutoff: 1800, texture: 'none', textureGain: 0, carry: null, carryGain: 0,
  },
  // A closed room at night: the top rolled off, a low pulse under everything.
  cottage: {
    root: 53, chords: [[0, 4, 7, 11], [-5, 0, 4, 9], [-3, 2, 5, 9], [-1, 4, 7, 11]],
    chordTime: 8, motif: HOME_MOTIF, beat: 0.66, motifEvery: 2,
    padGain: 0.095, motifGain: 0.05, bassGain: 0.045, padType: 'triangle', motifType: 'sine', detune: 4,
    cutoff: 1250, texture: 'hearth', textureGain: 0.05, carry: 'title', carryGain: 0.026,
  },
  // Daylight and errands: the brightest, busiest mix in the game.
  town: {
    root: 55, chords: [[0, 4, 7], [5, 9, 12], [-3, 2, 7], [-5, 0, 4]],
    chordTime: 5.5, motif: CHEETAH_MOTIF, beat: 0.42, motifEvery: 1,
    padGain: 0.085, motifGain: 0.065, bassGain: 0.05, padType: 'triangle', motifType: 'triangle', detune: 7,
    cutoff: 2700, texture: 'pluck', textureGain: 0.034, carry: 'cottage', carryGain: 0.022,
  },
  forest: {
    root: 50, chords: [[0, 3, 7, 10], [-2, 3, 5, 10], [-4, 0, 3, 7], [-5, 2, 7, 11]],
    chordTime: 9, motif: WANDER_MOTIF, beat: 0.75, motifEvery: 2,
    padGain: 0.105, motifGain: 0.05, bassGain: 0.055, padType: 'sine', motifType: 'sine', detune: 6,
    cutoff: 1450, texture: 'breath', textureGain: 0.05, carry: 'town', carryGain: 0.024,
  },
  crossing: {
    root: 48, chords: [[0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 9]],
    chordTime: 11, motif: HOLD_MOTIF, beat: 0.9, motifEvery: 2,
    padGain: 0.1, motifGain: 0.045, bassGain: 0.05, padType: 'sine', motifType: 'sine', detune: 4,
    cutoff: 1000, texture: 'drip', textureGain: 0.038, carry: 'forest', carryGain: 0.024,
  },
  mountain: {
    root: 45, chords: [[0, 7, 12, 16], [-3, 4, 9, 14], [-5, 2, 7, 11], [0, 5, 9, 12]],
    chordTime: 10, motif: CLIMB_MOTIF, beat: 0.8, motifEvery: 2,
    padGain: 0.11, motifGain: 0.05, bassGain: 0.06, padType: 'sawtooth', motifType: 'sine', detune: 8,
    cutoff: 1950, texture: 'wind', textureGain: 0.03, carry: 'crossing', carryGain: 0.022,
  },
  // The one place with nothing overhead: everything opens up.
  stars: {
    root: 45, chords: [[0, 7, 12, 16, 19], [-3, 4, 11, 14, 18], [-5, 2, 9, 12, 16]],
    chordTime: 12, motif: STAR_MOTIF, beat: 0.95, motifEvery: 1,
    padGain: 0.12, motifGain: 0.06, bassGain: 0.05, padType: 'sine', motifType: 'sine', detune: 10,
    cutoff: 3400, texture: 'bell', textureGain: 0.042, carry: 'mountain', carryGain: 0.02,
  },
  // Stripped back to a drone and the seams in the asphalt.
  transition: {
    root: 45, chords: [[0, 7, 12], [-3, 4, 9], [-5, 0, 7]],
    chordTime: 13, motif: ROAD_MOTIF, beat: 1.0, motifEvery: 0,
    padGain: 0.075, motifGain: 0.03, bassGain: 0.04, padType: 'sine', motifType: 'sine', detune: 3,
    cutoff: 820, texture: 'seam', textureGain: 0.05, carry: 'stars', carryGain: 0.024,
  },
  lot: {
    root: 45, chords: [[0, 7], [-3, 4]],
    chordTime: 16, motif: LOT_MOTIF, beat: 1.1, motifEvery: 0,
    padGain: 0.05, motifGain: 0.03, bassGain: 0.03, padType: 'sine', motifType: 'sine', detune: 2,
    cutoff: 640, texture: 'hum', textureGain: 0.022, carry: 'transition', carryGain: 0.02,
  },
  // Not the road's music resolving — the cottage's, come all this way to meet her.
  ending: {
    root: 53, chords: [[0, 4, 7, 11], [-5, 0, 4, 9], [-3, 2, 5, 9], [-1, 4, 7, 12]],
    chordTime: 9, motif: RETURN_MOTIF, beat: 0.7, motifEvery: 1,
    padGain: 0.12, motifGain: 0.07, bassGain: 0.06, padType: 'triangle', motifType: 'sine', detune: 5,
    cutoff: 2300, texture: 'chime', textureGain: 0.04, carry: 'cottage', carryGain: 0.03,
  },
}

interface Layer {
  gain: GainNode
  stop: () => void
}

interface OptionalPlaybackOptions {
  /** Called only when this keyed playback ends while it is still current. */
  onEnded?: () => void
  /**
   * Voices the track as if it plays from a physical source in the world (a
   * car radio): a lowpass + level chain sits between the layer and its bus,
   * driven afterwards via `setOptionalProximity`. Starts fully muffled.
   */
  radio?: boolean
  /** Loop the track for as long as it stays current, rather than playing once. */
  loop?: boolean
}

export interface AudioDebugSnapshot {
  contextState: AudioContextState | 'uninitialized'
  currentAmbience: AmbienceId
  currentMusic: MusicId
  activeOptionalKeys: string[]
  pendingOptionalKeys: string[]
  optionalStartCounts: Record<string, number>
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  /** Generated/file-override score only; personal media bypasses this fader. */
  private scoreBus: GainNode | null = null
  private ambienceBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private reverbSend: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private currentAmbience: AmbienceId = 'none'
  private currentMusic: MusicId = 'none'
  private ambienceLayer: Layer | null = null
  private musicLayer: Layer | null = null

  private settings: Settings | null = null
  private muted = false
  private started = false
  private fileCache = new Map<string, AudioBuffer | null>()
  /** Decoded personal recordings are shared between preload and playback. */
  private optionalFileCache = new Map<string, Promise<AudioBuffer | null>>()
  /** Keyed personal tracks are deduplicated and stopped on title return. */
  private optionalLayers = new Map<string, Layer>()
  private optionalInFlight = new Map<string, Promise<boolean>>()
  private optionalEndListeners = new Map<string, Set<() => void>>()
  private optionalStartCounts = new Map<string, number>()
  /** Car-radio voicing chains inserted between a keyed layer and its bus. */
  private radioChains = new Map<string, { filter: BiquadFilterNode; gain: GainNode; reverbSend: GainNode }>()
  /** Last requested 0..1 proximity per key; applied when the chain exists. */
  private radioProximity = new Map<string, number>()
  /** Invalidates fetch/decode work that outlives a return to the title. */
  private playbackGeneration = 0
  /** Shared-noise traffic voices are capped so clustered visuals never become a wall of sound. */
  private activeTrafficPasses = 0
  private trafficStops = new Set<() => void>()
  /** One-shot output nodes are disconnected after their longest possible tail. */
  private oneShotStops = new Set<() => void>()

  /** 0..1 — the transition scene pulls this down to strip the score back. */
  musicIntensity = 1

  get ready() {
    return this.started && this.ctx?.state === 'running'
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {})
      return
    }
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx

      this.master = ctx.createGain()
      this.master.gain.value = 0.85
      this.master.connect(ctx.destination)

      // A short synthetic hall. Cheap, and it is most of why this does not
      // sound like beeps in a vacuum.
      this.reverb = ctx.createConvolver()
      this.reverb.buffer = this.makeImpulse(2.6, 2.4)
      const wet = ctx.createGain()
      wet.gain.value = 0.55
      this.reverb.connect(wet)
      wet.connect(this.master)
      this.reverbSend = ctx.createGain()
      this.reverbSend.gain.value = 1
      this.reverbSend.connect(this.reverb)

      this.musicBus = ctx.createGain()
      this.scoreBus = ctx.createGain()
      this.ambienceBus = ctx.createGain()
      this.sfxBus = ctx.createGain()
      for (const bus of [this.musicBus, this.ambienceBus, this.sfxBus]) {
        bus.connect(this.master)
      }
      this.scoreBus.connect(this.musicBus)
      // Music and one-shots feed the hall; ambience stays dry so it sits behind.
      const musicSend = ctx.createGain()
      musicSend.gain.value = 0.35
      this.musicBus.connect(musicSend)
      musicSend.connect(this.reverbSend)
      const sfxSend = ctx.createGain()
      sfxSend.gain.value = 0.2
      this.sfxBus.connect(sfxSend)
      sfxSend.connect(this.reverbSend)

      this.noiseBuffer = this.makeNoise(4)
      this.started = true
      if (this.settings) this.applySettings(this.settings)
      await ctx.resume().catch(() => {})
    } catch {
      // Audio is entirely optional. If the context cannot be created the game
      // runs silently rather than failing.
      this.started = false
    }
  }

  applySettings(s: Settings) {
    this.settings = s
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const m = this.muted ? 0 : s.masterVolume
    this.master.gain.setTargetAtTime(m, t, 0.05)
    this.musicBus?.gain.setTargetAtTime(s.musicVolume, t, 0.08)
    this.scoreBus?.gain.setTargetAtTime(this.musicIntensity, t, 0.08)
    this.ambienceBus?.gain.setTargetAtTime(s.ambienceVolume, t, 0.08)
    this.sfxBus?.gain.setTargetAtTime(s.sfxVolume, t, 0.05)
  }

  setMuted(v: boolean) {
    this.muted = v
    if (this.settings) this.applySettings(this.settings)
  }

  /** Strips the score back without changing the user's music volume setting. */
  setMusicIntensity(v: number) {
    this.musicIntensity = Math.max(0, Math.min(1, v))
    if (this.settings) this.applySettings(this.settings)
  }

  // ── buffers ─────────────────────────────────────────────────────────────

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    // Pink-ish noise (Voss). Warmer and far less fatiguing than white.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
    return buf
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    return src
  }

  // ── optional file override ───────────────────────────────────────────────

  private async tryLoadFile(slot: string): Promise<AudioBuffer | null> {
    if (this.fileCache.has(slot)) return this.fileCache.get(slot) ?? null
    const url = FILE_SLOTS[slot]
    if (!url || !this.ctx) {
      this.fileCache.set(slot, null)
      return null
    }
    try {
      const res = await fetch(url, { cache: 'force-cache' })
      // A dev server happily returns index.html for a missing file; reject that.
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || type.includes('text/html')) {
        this.fileCache.set(slot, null)
        return null
      }
      const arr = await res.arrayBuffer()
      if (arr.byteLength < 512) {
        this.fileCache.set(slot, null)
        return null
      }
      const buf = await this.ctx.decodeAudioData(arr)
      this.fileCache.set(slot, buf)
      return buf
    } catch {
      this.fileCache.set(slot, null)
      return null
    }
  }

  private loadOptionalFile(url: string): Promise<AudioBuffer | null> {
    const cached = this.optionalFileCache.get(url)
    if (cached) return cached
    if (!this.ctx) return Promise.resolve(null)

    const ctx = this.ctx
    const pending = (async () => {
      try {
        const res = await fetch(url, { cache: 'force-cache' })
        const type = res.headers.get('content-type') ?? ''
        if (!res.ok || type.includes('text/html')) return null
        const arr = await res.arrayBuffer()
        if (arr.byteLength < 512) return null
        return await ctx.decodeAudioData(arr)
      } catch {
        return null
      }
    })()
    this.optionalFileCache.set(url, pending)
    void pending.then((buffer) => {
      // A transient preload failure must not poison parking-lot entry. Keep
      // successful decoded buffers, but allow the scene-entry request to retry.
      if (!buffer && this.optionalFileCache.get(url) === pending) {
        this.optionalFileCache.delete(url)
      }
    })
    return pending
  }

  private playBuffer(
    buf: AudioBuffer,
    bus: AudioNode,
    loop: boolean,
    onEnded?: () => void,
  ): Layer {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = loop
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(gain)
    gain.connect(bus)
    let released = false
    const release = () => {
      if (released) return
      released = true
      try { gain.disconnect() } catch { /* already disconnected */ }
      onEnded?.()
    }
    src.onended = release
    src.start()
    return {
      gain,
      stop: () => {
        try {
          src.stop(ctx.currentTime + 0.05)
        } catch {
          /* already stopped */
        }
        setTimeout(release, 120)
      },
    }
  }

  // ── ambience ─────────────────────────────────────────────────────────────

  async ambience(id: AmbienceId, fade = 1.6) {
    if (!this.started || !this.ctx || !this.ambienceBus) {
      this.currentAmbience = id
      return
    }
    if (this.currentAmbience === id) return
    this.currentAmbience = id

    const old = this.ambienceLayer
    if (old) {
      const t = this.ctx.currentTime
      old.gain.gain.cancelScheduledValues(t)
      old.gain.gain.setValueAtTime(old.gain.gain.value, t)
      old.gain.gain.linearRampToValueAtTime(0, t + fade)
      setTimeout(() => old.stop(), fade * 1000 + 120)
    }
    this.ambienceLayer = null
    if (id === 'none') return

    const file = await this.tryLoadFile(`ambience:${id}`)
    const layer = file
      ? this.playBuffer(file, this.ambienceBus, true)
      : this.buildAmbience(id)
    if (!layer) return
    // A newer request may have landed while the file was decoding.
    if (this.currentAmbience !== id) {
      layer.stop()
      return
    }
    this.ambienceLayer = layer
    const t = this.ctx.currentTime
    layer.gain.gain.setValueAtTime(0, t)
    layer.gain.gain.linearRampToValueAtTime(1, t + fade)
  }

  private buildAmbience(id: AmbienceId): Layer | null {
    const ctx = this.ctx!
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(this.ambienceBus!)
    const stops: (() => void)[] = []

    /** A filtered noise bed with a slow breathing LFO. */
    const bed = (
      type: BiquadFilterType,
      freq: number,
      q: number,
      level: number,
      lfoRate: number,
      lfoDepth: number,
    ) => {
      const src = this.noiseSource()
      const filt = ctx.createBiquadFilter()
      filt.type = type
      filt.frequency.value = freq
      filt.Q.value = q
      const g = ctx.createGain()
      g.gain.value = level
      src.connect(filt)
      filt.connect(g)
      g.connect(out)
      if (lfoDepth > 0) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = lfoRate
        const lg = ctx.createGain()
        lg.gain.value = lfoDepth
        lfo.connect(lg)
        lg.connect(g.gain)
        lfo.start()
        stops.push(() => {
          try { lfo.stop() } catch { /* noop */ }
        })
      }
      src.start()
      stops.push(() => {
        try { src.stop() } catch { /* noop */ }
      })
      return { filt, g }
    }

    /** Sparse scheduled one-shots: birds, chimes, passing cars. */
    const sparse = (minGap: number, maxGap: number, fire: () => void) => {
      let timer: ReturnType<typeof setTimeout>
      const loop = () => {
        fire()
        timer = setTimeout(loop, (minGap + Math.random() * (maxGap - minGap)) * 1000)
      }
      timer = setTimeout(loop, (minGap + Math.random() * (maxGap - minGap)) * 1000)
      stops.push(() => clearTimeout(timer))
    }

    const bird = (baseHz: number, level = 0.06) => {
      const t = ctx.currentTime
      const o = ctx.createOscillator()
      o.type = 'sine'
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      pan.pan.value = (Math.random() - 0.5) * 1.35
      const notes = 2 + Math.floor(Math.random() * 3)
      o.frequency.setValueAtTime(baseHz * (0.9 + Math.random() * 0.3), t)
      g.gain.setValueAtTime(0, t)
      for (let i = 0; i < notes; i++) {
        const nt = t + i * 0.11
        o.frequency.exponentialRampToValueAtTime(baseHz * (0.85 + Math.random() * 0.55), nt + 0.05)
        g.gain.linearRampToValueAtTime(level, nt + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, nt + 0.09)
      }
      o.connect(g)
      g.connect(pan)
      pan.connect(out)
      const send = ctx.createGain()
      send.gain.value = 0.5
      g.connect(send)
      send.connect(this.reverbSend!)
      o.start(t)
      o.stop(t + notes * 0.11 + 0.2)
    }

    const chime = (hz: number, level = 0.05) => {
      const t = ctx.currentTime
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      pan.pan.value = (Math.random() - 0.5) * 1.15
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(level, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
      o.connect(g)
      g.connect(pan)
      pan.connect(out)
      const send = ctx.createGain()
      send.gain.value = 0.8
      g.connect(send)
      send.connect(this.reverbSend!)
      o.start(t)
      o.stop(t + 2.8)
    }

    /** A small dry leaf or paper movement, placed somewhere off the path. */
    const rustle = (freq: number, level: number, duration: number) => {
      const t = ctx.currentTime
      const src = this.noiseSource()
      const filt = ctx.createBiquadFilter()
      filt.type = 'bandpass'
      filt.frequency.value = freq * (0.82 + Math.random() * 0.36)
      filt.Q.value = 0.72
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(level, t + duration * 0.18)
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
      const pan = ctx.createStereoPanner()
      pan.pan.value = (Math.random() - 0.5) * 1.7
      src.connect(filt)
      filt.connect(g)
      g.connect(pan)
      pan.connect(out)
      src.start(t)
      src.stop(t + duration + 0.04)
    }

    /** A car passing on a road somewhere out of sight. */
    const passingCar = () => {
      const t = ctx.currentTime
      const src = this.noiseSource()
      const filt = ctx.createBiquadFilter()
      filt.type = 'bandpass'
      filt.Q.value = 1.1
      filt.frequency.setValueAtTime(220, t)
      filt.frequency.linearRampToValueAtTime(620, t + 1.5)
      filt.frequency.linearRampToValueAtTime(180, t + 3.4)
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      const direction = Math.random() > 0.5 ? 1 : -1
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.12, t + 1.4)
      g.gain.linearRampToValueAtTime(0, t + 3.4)
      pan.pan.setValueAtTime(-0.72 * direction, t)
      pan.pan.linearRampToValueAtTime(0.72 * direction, t + 3.4)
      src.connect(filt)
      filt.connect(g)
      g.connect(pan)
      pan.connect(out)
      src.start(t)
      src.stop(t + 3.6)
    }

    switch (id) {
      case 'bedroom':
        bed('lowpass', 320, 0.7, 0.05, 0.07, 0.012) // room tone
        bed('bandpass', 900, 1.4, 0.012, 0.13, 0.008) // curtain movement
        sparse(12, 24, () => bird(2400, 0.025))
        break
      case 'cottage':
        bed('lowpass', 500, 0.6, 0.06, 0.09, 0.02)
        bed('highpass', 1400, 0.5, 0.02, 0.16, 0.01)
        sparse(5, 12, () => bird(2600, 0.045))
        break
      case 'town':
        bed('lowpass', 420, 0.6, 0.045, 0.1, 0.018)
        bed('bandpass', 700, 0.9, 0.035, 0.06, 0.012) // distant voices
        sparse(7, 14, () => bird(2300, 0.035))
        sparse(18, 34, () => chime(392, 0.075)) // town bell
        break
      case 'forest':
        bed('lowpass', 620, 0.7, 0.06, 0.11, 0.02) // leaves
        bed('highpass', 2600, 0.6, 0.03, 0.35, 0.012) // insects
        bed('bandpass', 1500, 0.8, 0.055, 0.5, 0.014) // stream
        sparse(5, 12, () => bird(2800, 0.045))
        sparse(8, 16, () => rustle(1650, 0.024, 0.9))
        break
      case 'water':
        bed('bandpass', 900, 0.7, 0.08, 0.28, 0.02) // ripples
        bed('lowpass', 380, 0.6, 0.04, 0.14, 0.014)
        bed('highpass', 3200, 0.5, 0.016, 0.4, 0.008) // reeds
        sparse(6, 16, () => bird(1700, 0.038))
        break
      case 'mountain':
        bed('bandpass', 480, 0.55, 0.1, 0.06, 0.035) // wind
        bed('highpass', 1800, 0.4, 0.026, 0.09, 0.014)
        sparse(9, 22, () => chime(523.25 * (Math.random() > 0.5 ? 1 : 1.5), 0.05))
        break
      case 'transition':
        bed('lowpass', 340, 0.6, 0.05, 0.08, 0.02) // distant traffic
        bed('bandpass', 760, 0.8, 0.026, 0.2, 0.014) // leaves, thinning
        sparse(9, 22, () => rustle(1250, 0.016, 0.75))
        sparse(11, 26, () => passingCar())
        break
      case 'parkingLot':
        bed('lowpass', 300, 0.6, 0.07, 0.05, 0.018) // road hum
        bed('bandpass', 92, 1.8, 0.024, 0.035, 0.006) // rooftop HVAC drone
        bed('bandpass', 2400, 3.2, 0.009, 0.02, 0.004) // streetlight hum
        bed('highpass', 1600, 0.5, 0.012, 0.22, 0.01) // leaves on asphalt
        // Visible traffic owns every pass sound in this scene. Only loose paper
        // and leaves live in the ambience, so sound and headlights agree.
        sparse(12, 28, () => rustle(2200, 0.014, 0.62))
        break
      case 'car':
        bed('lowpass', 200, 0.7, 0.05, 0.04, 0.012) // muffled outside
        bed('bandpass', 2400, 3.2, 0.004, 0.02, 0.002)
        break
      default:
        break
    }

    return {
      gain: out,
      stop: () => {
        stops.forEach((s) => s())
        try {
          out.disconnect()
        } catch {
          /* noop */
        }
      },
    }
  }

  // ── music ────────────────────────────────────────────────────────────────

  async music(id: MusicId, fade = 3.5, intensity = 1) {
    const changed = this.currentMusic !== id
    if (changed) this.currentMusic = id
    // Intensity and cue ownership change atomically. A new cue defaults to a
    // full mix, while authored moments can request a restrained score without
    // also turning down personal media on the parent music bus.
    this.setMusicIntensity(intensity)
    if (!this.started || !this.ctx || !this.scoreBus) {
      return
    }
    if (!changed) return

    const old = this.musicLayer
    if (old) {
      const t = this.ctx.currentTime
      old.gain.gain.cancelScheduledValues(t)
      old.gain.gain.setValueAtTime(old.gain.gain.value, t)
      old.gain.gain.linearRampToValueAtTime(0, t + fade)
      setTimeout(() => old.stop(), fade * 1000 + 150)
    }
    this.musicLayer = null
    if (id === 'none') return

    const file = await this.tryLoadFile(`music:${id}`)
    const layer = file ? this.playBuffer(file, this.scoreBus, true) : this.buildMusic(id)
    if (!layer) return
    if (this.currentMusic !== id) {
      layer.stop()
      return
    }
    this.musicLayer = layer
    const t = this.ctx.currentTime
    layer.gain.gain.setValueAtTime(0, t)
    layer.gain.gain.linearRampToValueAtTime(1, t + fade)
  }

  private buildMusic(id: MusicId): Layer | null {
    if (id === 'none') return null
    const theme = THEMES[id]
    const ctx = this.ctx!
    const noiseBuffer = this.noiseBuffer
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(this.scoreBus!)

    let chordIndex = 0
    let motifCounter = 0
    let stopped = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const voice = (
      freq: number,
      start: number,
      dur: number,
      level: number,
      type: OscillatorType,
      detuneCents: number,
      cutoff = theme.cutoff,
    ) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = detuneCents
      const g = ctx.createGain()
      const attack = Math.min(dur * 0.35, 1.6)
      const release = Math.min(dur * 0.5, 3.2)
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + attack)
      g.gain.setValueAtTime(Math.max(0.0002, level), start + Math.max(attack, dur - release))
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      // Gentle low-pass so pads stay soft rather than buzzy. Per-theme, because
      // how much top survives is most of what separates one biome from another.
      const filt = ctx.createBiquadFilter()
      filt.type = 'lowpass'
      filt.frequency.value = cutoff
      filt.Q.value = 0.4
      o.connect(filt)
      filt.connect(g)
      g.connect(out)
      o.start(start)
      o.stop(start + dur + 0.1)
    }

    /** Struck rather than bowed: instant attack, long tail. Bells and plucks. */
    const struck = (
      freq: number,
      start: number,
      dur: number,
      level: number,
      type: OscillatorType = 'sine',
    ) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + 0.014)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      o.connect(g)
      g.connect(out)
      o.start(start)
      o.stop(start + dur + 0.05)
    }

    /** A filtered swell of the shared pink noise — wind, water, room tone. */
    const breath = (
      start: number,
      dur: number,
      level: number,
      from: number,
      to: number,
      q: number,
    ) => {
      if (!noiseBuffer) return
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer
      src.loop = true
      const filt = ctx.createBiquadFilter()
      filt.type = 'bandpass'
      filt.frequency.setValueAtTime(from, start)
      filt.frequency.linearRampToValueAtTime(to, start + dur)
      filt.Q.value = q
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.linearRampToValueAtTime(level, start + dur * 0.45)
      g.gain.linearRampToValueAtTime(0.0001, start + dur)
      src.connect(filt)
      filt.connect(g)
      g.connect(out)
      src.start(start)
      src.stop(start + dur + 0.05)
    }

    /**
     * The biome's own air, laid over the same pad-and-motif skeleton every
     * chapter shares. This is what stops the score reading as one long track
     * with the key changed.
     */
    const playTexture = (now: number, chord: number[]) => {
      const level = theme.textureGain
      if (level <= 0) return
      const span = theme.chordTime
      const root = theme.root + chord[0]
      switch (theme.texture) {
        case 'hearth':
          // Two soft low pulses per chord — a warm room breathing in the dark.
          for (let i = 0; i < 2; i++) {
            voice(note(root - 24), now + span * (0.05 + i * 0.5), 2.1, level, 'sine', 0, 300)
          }
          break
        case 'pluck':
          // A light arpeggio strolling up the chord: the town's small errands.
          for (let i = 0; i <= chord.length; i++) {
            const semis = chord[i % chord.length] + (i >= chord.length ? 12 : 0)
            struck(
              note(theme.root + semis + 12),
              now + span * 0.08 + i * theme.beat * 0.8,
              1.6,
              level,
              'triangle',
            )
          }
          break
        case 'breath':
          // Wind through a canopy, tuned just enough to belong to the chord.
          breath(now, span * 0.92, level, note(root + 12), note(root + 19), 9)
          break
        case 'drip':
          // Two high drops per chord, far apart — water off a lifted paddle.
          struck(note(root + 24), now + span * 0.22, 3.4, level)
          struck(note(theme.root + chord[chord.length - 1] + 24), now + span * 0.61, 3.8, level * 0.8)
          break
        case 'wind':
          // One long gust rising and falling across the whole chord.
          breath(now, span, level, 190, 660, 1.4)
          break
        case 'bell':
          // Chord tones struck one at a time, high and slow, left to ring out.
          for (let i = 0; i < 3; i++) {
            const semis = chord[(chordIndex + i) % chord.length]
            struck(note(theme.root + semis + 24), now + span * (0.1 + i * 0.27), 6, level * (1 - i * 0.18))
          }
          break
        case 'seam':
          // Expansion joints under the tyres: a dull knock every few seconds.
          for (let t = 0; t < span; t += 2.6) breath(now + t, 0.17, level, 150, 95, 1)
          break
        case 'hum':
          // The lot's own note: a sodium lamp, barely moving all night.
          voice(note(root - 12), now, span * 1.3, level, 'sawtooth', 5, 170)
          voice(note(root - 12), now, span * 1.3, level * 0.9, 'sawtooth', -8, 170)
          break
        case 'chime':
          // The stars' bells brought back down to where she can reach them.
          struck(note(root + 12), now + span * 0.08, 4.5, level)
          struck(note(theme.root + chord[Math.min(2, chord.length - 1)] + 12), now + span * 0.52, 4.5, level * 0.8)
          break
        case 'none':
          break
      }
    }

    /**
     * The previous chapter's tune, thinned to a handful of notes and set an
     * octave down under this one. It is what makes a chapter a remix rather
     * than a new piece: you keep half-hearing where you have just been.
     */
    const carried = theme.carry ? octave(thin(THEMES[theme.carry].motif), -1) : null

    const playCarry = (now: number, chord: number[]) => {
      if (!carried || theme.carryGain <= 0) return
      // Enters late in the chord, where the chapter's own motif has finished.
      let t = now + theme.chordTime * 0.55
      for (const [semi, beats] of carried) {
        const d = beats * theme.beat * 1.5
        if (semi != null) {
          const f = note(theme.root + chord[0] + semi)
          voice(f, t, d * 0.9, theme.carryGain, 'sine', 3, Math.min(theme.cutoff, 850))
        }
        t += d
      }
    }

    const playChord = () => {
      if (stopped) return
      const now = ctx.currentTime
      const chord = theme.chords[chordIndex % theme.chords.length]
      const dur = theme.chordTime * 1.25

      // Pad
      for (const semis of chord) {
        const f = note(theme.root + semis)
        voice(f, now, dur, theme.padGain, theme.padType, -theme.detune)
        voice(f, now, dur, theme.padGain * 0.8, theme.padType, theme.detune)
      }
      // Bass, an octave under the root of the voicing
      voice(note(theme.root + chord[0] - 12), now, dur, theme.bassGain, 'sine', 0)

      // Motif
      if (theme.motifEvery > 0 && motifCounter % theme.motifEvery === 0) {
        let t = now + theme.chordTime * 0.18
        for (const [semi, beats] of theme.motif) {
          const d = beats * theme.beat
          if (semi != null) {
            voice(note(theme.root + chord[0] + semi), t, d * 0.92, theme.motifGain, theme.motifType, 0)
          }
          t += d
        }
      }

      // The chapter before this one, every other chord, offset from the motif
      // above so the two lines take turns rather than talk over each other.
      if (motifCounter % 2 === 1) playCarry(now, chord)

      playTexture(now, chord)

      chordIndex++
      motifCounter++
      timers.push(setTimeout(playChord, theme.chordTime * 1000))
    }

    playChord()

    return {
      gain: out,
      stop: () => {
        stopped = true
        timers.forEach(clearTimeout)
        setTimeout(() => {
          try {
            out.disconnect()
          } catch {
            /* noop */
          }
        }, 4000)
      },
    }
  }

  // ── one-shots ────────────────────────────────────────────────────────────

  private oneShot(
    build: (t: number, dest: GainNode) => void,
    gain = 1,
    lifetimeMs = 8000,
  ) {
    if (!this.started || !this.ctx || !this.sfxBus) return
    const g = this.ctx.createGain()
    g.gain.value = gain
    g.connect(this.sfxBus)
    let cleaned = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      if (timer) clearTimeout(timer)
      this.oneShotStops.delete(cleanup)
      try { g.disconnect() } catch { /* already disconnected */ }
    }
    this.oneShotStops.add(cleanup)
    try {
      build(this.ctx.currentTime, g)
      timer = setTimeout(cleanup, Math.max(250, lifetimeMs))
    } catch (error) {
      cleanup()
      throw error
    }
  }

  footstep(surface: 'grass' | 'wood' | 'stone' | 'gravel' | 'asphalt' | 'water', intensity = 0.5) {
    const profile = {
      grass: { hz: 900, q: 0.9, dur: 0.1, level: 0.05, type: 'bandpass' as BiquadFilterType },
      wood: { hz: 380, q: 2.4, dur: 0.11, level: 0.07, type: 'bandpass' as BiquadFilterType },
      stone: { hz: 1500, q: 1.6, dur: 0.07, level: 0.055, type: 'bandpass' as BiquadFilterType },
      gravel: { hz: 2200, q: 0.7, dur: 0.12, level: 0.05, type: 'highpass' as BiquadFilterType },
      asphalt: { hz: 1100, q: 1.2, dur: 0.08, level: 0.045, type: 'bandpass' as BiquadFilterType },
      water: { hz: 700, q: 0.8, dur: 0.2, level: 0.06, type: 'bandpass' as BiquadFilterType },
    }[surface]

    this.oneShot((t, dest) => {
      const ctx = this.ctx!
      const src = this.noiseSource()
      const filt = ctx.createBiquadFilter()
      filt.type = profile.type
      filt.frequency.value = profile.hz * (0.85 + Math.random() * 0.3)
      filt.Q.value = profile.q
      const g = ctx.createGain()
      const lvl = profile.level * (0.6 + intensity * 0.7)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(lvl, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, t + profile.dur)
      src.connect(filt)
      filt.connect(g)
      g.connect(dest)
      src.start(t)
      src.stop(t + profile.dur + 0.05)
    })
  }

  /**
   * Synchronized road pass for a visible vehicle.
   *
   * Reuses the engine's shared noise buffer, caps concurrent voices, and
   * shapes stereo pan, filter, and low engine tone together. No fetched asset.
   */
  trafficPass(options: TrafficPassOptions = {}): boolean {
    if (
      !this.started
      || !this.ctx
      || !this.sfxBus
      || !this.noiseBuffer
      || this.activeTrafficPasses >= 2
    ) {
      return false
    }

    const ctx = this.ctx
    const direction = options.direction === -1 ? -1 : 1
    const distance = Math.max(0, Math.min(1, options.distance ?? 0.3))
    const speed = Math.max(0.55, Math.min(1.8, options.speed ?? 1))
    const duration = Math.max(2.2, Math.min(4.8, 3.7 / speed))
    const near = 1 - distance
    const peak = 0.035 + near * 0.055
    const t = ctx.currentTime

    const source = this.noiseSource()
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 0.82
    filter.frequency.setValueAtTime(150 + speed * 55, t)
    filter.frequency.linearRampToValueAtTime(470 + speed * 150, t + duration * 0.46)
    filter.frequency.exponentialRampToValueAtTime(135, t + duration)

    const envelope = ctx.createGain()
    envelope.gain.setValueAtTime(0.0001, t)
    envelope.gain.linearRampToValueAtTime(peak * 0.18, t + duration * 0.12)
    envelope.gain.linearRampToValueAtTime(peak, t + duration * 0.48)
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration)

    const pan = ctx.createStereoPanner()
    pan.pan.setValueAtTime(-0.82 * direction, t)
    pan.pan.linearRampToValueAtTime(0.82 * direction, t + duration)

    const engine = ctx.createOscillator()
    engine.type = 'triangle'
    engine.frequency.setValueAtTime(54 * speed, t)
    engine.frequency.linearRampToValueAtTime(76 * speed, t + duration * 0.46)
    engine.frequency.exponentialRampToValueAtTime(48, t + duration)
    const engineGain = ctx.createGain()
    engineGain.gain.setValueAtTime(0.0001, t)
    engineGain.gain.linearRampToValueAtTime(peak * 0.22, t + duration * 0.45)
    engineGain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(pan)
    engine.connect(engineGain)
    engineGain.connect(pan)
    pan.connect(this.sfxBus)

    this.activeTrafficPasses += 1
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      this.activeTrafficPasses = Math.max(0, this.activeTrafficPasses - 1)
      this.trafficStops.delete(stop)
      for (const node of [source, filter, envelope, engine, engineGain, pan]) {
        try { node.disconnect() } catch { /* already disconnected */ }
      }
    }
    const stop = () => {
      try { source.stop() } catch { /* already stopped */ }
      try { engine.stop() } catch { /* already stopped */ }
      cleanup()
    }
    this.trafficStops.add(stop)
    source.onended = cleanup

    source.start(t)
    engine.start(t)
    source.stop(t + duration + 0.04)
    engine.stop(t + duration + 0.04)
    return true
  }

  /**
   * A far-off storm heard after the light reaches us.
   *
   * The mountain scene owns the delay and sometimes chooses silence. This method
   * only shapes the sound once that delayed arrival is due: a soft low-frequency
   * front followed by a longer, filtered tail. It never schedules a repeating
   * timer, so leaving the scene cannot strand a storm process behind.
   */
  distantThunder(distance = 0.76) {
    if (!this.started || !this.ctx) return
    const far = Math.max(0, Math.min(1, distance))
    const level = 0.11 * (1 - far * 0.58)

    this.oneShot((t, dest) => {
      const ctx = this.ctx!
      const noise = this.noiseSource()
      const low = ctx.createBiquadFilter()
      low.type = 'lowpass'
      low.frequency.setValueAtTime(185, t)
      low.frequency.exponentialRampToValueAtTime(62, t + 4.8)
      low.Q.value = 0.58

      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(0.0001, t)
      envelope.gain.linearRampToValueAtTime(level * 0.34, t + 0.18)
      envelope.gain.linearRampToValueAtTime(level, t + 0.72)
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + 5.2)

      const rumble = ctx.createOscillator()
      rumble.type = 'sine'
      rumble.frequency.setValueAtTime(43, t)
      rumble.frequency.exponentialRampToValueAtTime(29, t + 4.6)
      const rumbleGain = ctx.createGain()
      rumbleGain.gain.setValueAtTime(0.0001, t)
      rumbleGain.gain.linearRampToValueAtTime(level * 0.24, t + 0.55)
      rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + 4.8)

      const pan = ctx.createStereoPanner()
      pan.pan.value = (Math.random() - 0.5) * 0.28

      noise.connect(low)
      low.connect(envelope)
      envelope.connect(pan)
      rumble.connect(rumbleGain)
      rumbleGain.connect(pan)
      pan.connect(dest)

      noise.start(t)
      rumble.start(t)
      noise.stop(t + 5.3)
      rumble.stop(t + 4.9)
    }, 1, 6200)
  }

  /** Short shaped tones for interactions and UI. */
  cue(
    name:
      | 'memory'
      | 'ui'
      | 'uiConfirm'
      | 'uiBack'
      | 'journal'
      | 'chime'
      | 'bell'
      | 'water'
      | 'doorOpen'
      | 'doorClose'
      | 'carDoor'
      | 'constellation'
      | 'reveal'
      | 'pet'
      | 'bloom'
      | 'bark'
      | 'purr',
  ) {
    if (!this.started || !this.ctx) return
    const ctx = this.ctx

    const tone = (
      hz: number,
      dur: number,
      level: number,
      type: OscillatorType,
      delay = 0,
      slideTo?: number,
    ) => {
      this.oneShot((t0, dest) => {
        const t = t0 + delay
        const o = ctx.createOscillator()
        o.type = type
        o.frequency.setValueAtTime(hz, t)
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(level, t + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        o.connect(g)
        g.connect(dest)
        const send = ctx.createGain()
        send.gain.value = 0.6
        g.connect(send)
        send.connect(this.reverbSend!)
        o.start(t)
        o.stop(t + dur + 0.05)
      })
    }

    const thud = (hz: number, dur: number, level: number, delay = 0) => {
      this.oneShot((t0, dest) => {
        const t = t0 + delay
        const src = this.noiseSource()
        const filt = ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.setValueAtTime(hz, t)
        filt.frequency.exponentialRampToValueAtTime(hz * 0.4, t + dur)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(level, t + 0.008)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(filt)
        filt.connect(g)
        g.connect(dest)
        src.start(t)
        src.stop(t + dur + 0.05)
      })
    }

    switch (name) {
      case 'memory':
        // A small rising figure — the Peach motif compressed into three notes.
        tone(note(72), 1.6, 0.075, 'sine')
        tone(note(76), 1.5, 0.06, 'sine', 0.13)
        tone(note(79), 2.4, 0.055, 'sine', 0.27)
        break
      case 'constellation':
        tone(note(69), 2.6, 0.06, 'sine')
        tone(note(76), 2.6, 0.05, 'sine', 0.18)
        tone(note(81), 3.2, 0.045, 'sine', 0.36)
        break
      case 'reveal':
        tone(note(64), 2.8, 0.05, 'triangle')
        tone(note(71), 3.0, 0.04, 'sine', 0.22)
        break
      case 'ui':
        tone(note(84), 0.09, 0.03, 'sine')
        break
      case 'uiConfirm':
        tone(note(81), 0.14, 0.04, 'sine')
        tone(note(88), 0.2, 0.03, 'sine', 0.06)
        break
      case 'uiBack':
        tone(note(76), 0.16, 0.035, 'sine', 0, note(69))
        break
      case 'journal':
        thud(2600, 0.26, 0.05)
        break
      case 'chime':
        tone(note(83), 2.4, 0.05, 'sine')
        break
      case 'bell':
        tone(note(67), 3.4, 0.07, 'sine')
        tone(note(74), 3.0, 0.03, 'sine', 0.02)
        break
      case 'water':
        thud(1400, 0.42, 0.055)
        break
      case 'doorOpen':
        thud(700, 0.5, 0.05)
        tone(note(50), 0.4, 0.02, 'sine', 0.05)
        break
      case 'doorClose':
        thud(420, 0.28, 0.075)
        break
      case 'carDoor':
        thud(260, 0.34, 0.1)
        tone(note(38), 0.3, 0.03, 'sine', 0.02)
        break
      case 'bark': {
        // Two short falling barks. Voiced with a triangle so it reads as an
        // animal rather than a UI blip, and detuned on the second so it is a
        // dog barking twice and not a sample played twice.
        tone(320, 0.1, 0.07, 'triangle', 0, 190)
        tone(296, 0.09, 0.055, 'triangle', 0.17, 176)
        thud(900, 0.09, 0.03)
        break
      }
      case 'purr': {
        // A purr is amplitude modulation, not a pitch. A low sine under a
        // ~24 Hz tremolo is close enough and costs two nodes.
        tone(58, 1.9, 0.05, 'sine')
        tone(87, 1.7, 0.022, 'sine', 0.04)
        for (let i = 0; i < 12; i++) tone(64, 0.05, 0.028, 'sine', i * 0.075)
        break
      }
      case 'bloom': {
        // A flower opening as she passes. Four notes of a pentatonic figure,
        // picked from a small set so a walk through a meadow sounds like a phrase
        // being played rather than the same chime over and over. Quiet enough to
        // sit under the ambience — several can overlap without turning to mud.
        const figures = [
          [76, 79, 83, 88],
          [72, 76, 81, 84],
          [79, 83, 86, 91],
          [74, 78, 81, 86],
        ]
        const f = figures[Math.floor(Math.random() * figures.length)]
        f.forEach((n, i) => tone(note(n), 1.1 - i * 0.12, 0.022 - i * 0.003, 'sine', i * 0.055))
        break
      }
      case 'pet':
        thud(900, 0.34, 0.03)
        break
    }
  }

  /** Warms a personal recording's fetch/decode cache without starting it. */
  async preloadOptional(url: string | null): Promise<boolean> {
    if (!url || !this.started || !this.ctx) return false
    return Boolean(await this.loadOptionalFile(url))
  }

  /**
   * Plays one keyed personal recording.
   *
   * Repeated calls made by StrictMode, a trigger, or an impatient replay share
   * the same in-flight request or active source instead of restarting it.
   */
  playOptional(
    url: string | null,
    bus: 'music' | 'sfx' = 'music',
    options: OptionalPlaybackOptions = {},
  ): Promise<boolean> {
    if (!url || !this.started || !this.ctx) return Promise.resolve(false)

    const key = `${bus}:${url}`
    let listeners = this.optionalEndListeners.get(key)
    if (!listeners) {
      listeners = new Set()
      this.optionalEndListeners.set(key, listeners)
    }
    if (options.onEnded) listeners.add(options.onEnded)

    if (this.optionalLayers.has(key)) return Promise.resolve(true)
    const existing = this.optionalInFlight.get(key)
    if (existing) return existing

    const generation = this.playbackGeneration
    const listenerSet = listeners
    let pending!: Promise<boolean>
    pending = (async () => {
      const buf = await this.loadOptionalFile(url)
      if (
        !buf
        || generation !== this.playbackGeneration
        || !this.ctx
        || (bus === 'music' ? !this.musicBus : !this.sfxBus)
      ) {
        return false
      }

      // Another request can only win after a lifecycle reset. Never stack it.
      if (this.optionalLayers.has(key)) return true

      const busNode = bus === 'music' ? this.musicBus! : this.sfxBus!
      let dest: AudioNode = busNode
      if (options.radio) {
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.Q.value = 0.7
        const radioGain = this.ctx.createGain()
        filter.connect(radioGain)
        radioGain.connect(busNode)
        // A dedicated, wetter reverb tail so the song reads as playing out
        // across a large night-time space rather than dry in the mix. This is
        // on top of the bus's own send, and it is tapped after the proximity
        // filter, so the hall opens up as she walks toward the car and is at
        // its fullest once she is sitting inside it.
        const reverbSend = this.ctx.createGain()
        reverbSend.gain.value = 0.6
        radioGain.connect(reverbSend)
        if (this.reverbSend) reverbSend.connect(this.reverbSend)
        this.radioChains.set(key, { filter, gain: radioGain, reverbSend })
        this.applyRadioProximity(key, this.radioProximity.get(key) ?? 0, 0)
        dest = filter
      }
      let layer!: Layer
      layer = this.playBuffer(buf, dest, options.loop ?? false, () => {
        if (this.optionalLayers.get(key) !== layer) return
        this.optionalLayers.delete(key)
        this.teardownRadioChain(key)
        const currentListeners = this.optionalEndListeners.get(key)
        this.optionalEndListeners.delete(key)
        currentListeners?.forEach((listener) => {
          try { listener() } catch { /* optional media never breaks scene flow */ }
        })
      })
      this.optionalLayers.set(key, layer)
      this.optionalStartCounts.set(key, (this.optionalStartCounts.get(key) ?? 0) + 1)
      const t = this.ctx.currentTime
      layer.gain.gain.setValueAtTime(0, t)
      layer.gain.gain.linearRampToValueAtTime(1, t + 1.2)
      return true
    })()
      .catch(() => false)
      .finally(() => {
        if (this.optionalInFlight.get(key) === pending) this.optionalInFlight.delete(key)
      })

    this.optionalInFlight.set(key, pending)
    void pending.then((played) => {
      if (
        !played
        && this.optionalEndListeners.get(key) === listenerSet
        && !this.optionalLayers.has(key)
      ) {
        this.optionalEndListeners.delete(key)
      }
    })
    return pending
  }

  /**
   * Fades out and releases one keyed personal recording, if it is playing.
   *
   * The layer is unregistered before the fade so its end callback — and any
   * restart logic listening on it — never fires for a deliberate stop.
   */
  stopOptional(url: string | null, bus: 'music' | 'sfx' = 'music', fade = 1.6) {
    if (!url || !this.ctx) return
    const key = `${bus}:${url}`
    this.optionalInFlight.delete(key)
    this.optionalEndListeners.delete(key)
    const layer = this.optionalLayers.get(key)
    if (!layer) return
    this.optionalLayers.delete(key)
    const t = this.ctx.currentTime
    layer.gain.gain.cancelScheduledValues(t)
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, t)
    layer.gain.gain.linearRampToValueAtTime(0, t + fade)
    // The radio chain must outlive the fade, so its teardown waits for it.
    setTimeout(() => {
      layer.stop()
      this.teardownRadioChain(key)
      this.radioProximity.delete(key)
    }, fade * 1000 + 150)
  }

  /**
   * Steers a radio-voiced keyed track: 0 = far (muffled, quiet), 1 = beside
   * or inside the source (full clarity). Safe to call every frame; values are
   * remembered so a chain created after a slow decode picks up where the
   * player already stands.
   */
  setOptionalProximity(url: string | null, bus: 'music' | 'sfx', proximity: number) {
    if (!url) return
    const key = `${bus}:${url}`
    const p = Math.min(1, Math.max(0, proximity))
    if (this.radioProximity.get(key) === p && this.radioChains.has(key)) return
    this.radioProximity.set(key, p)
    this.applyRadioProximity(key, p, 0.18)
  }

  private applyRadioProximity(key: string, proximity: number, ramp: number) {
    const chain = this.radioChains.get(key)
    if (!chain || !this.ctx) return
    // Far away only the bass carries across the lot; up close the top end and
    // the level open together, like walking up to a car with the radio on.
    const freq = 420 * Math.pow(38, proximity)
    const level = 0.22 + 0.78 * proximity * proximity
    const t = this.ctx.currentTime
    if (ramp <= 0) {
      chain.filter.frequency.setValueAtTime(freq, t)
      chain.gain.gain.setValueAtTime(level, t)
    } else {
      chain.filter.frequency.setTargetAtTime(freq, t, ramp)
      chain.gain.gain.setTargetAtTime(level, t, ramp)
    }
  }

  private teardownRadioChain(key: string) {
    const chain = this.radioChains.get(key)
    if (!chain) return
    this.radioChains.delete(key)
    // Let the 120 ms source release drain through before cutting the chain.
    setTimeout(() => {
      try { chain.filter.disconnect() } catch { /* already disconnected */ }
      try { chain.gain.disconnect() } catch { /* already disconnected */ }
      try { chain.reverbSend.disconnect() } catch { /* already disconnected */ }
    }, 200)
  }

  /** Read-only diagnostics, surfaced only by the debug build below. */
  debugSnapshot(): AudioDebugSnapshot {
    return {
      contextState: this.ctx?.state ?? 'uninitialized',
      currentAmbience: this.currentAmbience,
      currentMusic: this.currentMusic,
      activeOptionalKeys: [...this.optionalLayers.keys()].sort(),
      pendingOptionalKeys: [...this.optionalInFlight.keys()].sort(),
      optionalStartCounts: Object.fromEntries(this.optionalStartCounts),
    }
  }

  /** Silences everything — used on returning to the title. */
  stopAll(fade = 1.2) {
    this.playbackGeneration += 1
    this.optionalInFlight.clear()
    this.optionalEndListeners.clear()
    for (const stop of [...this.trafficStops]) stop()
    this.trafficStops.clear()
    for (const stop of [...this.oneShotStops]) stop()
    this.oneShotStops.clear()
    for (const layer of this.optionalLayers.values()) layer.stop()
    this.optionalLayers.clear()
    for (const key of [...this.radioChains.keys()]) this.teardownRadioChain(key)
    this.radioProximity.clear()
    this.ambience('none', fade)
    this.music('none', fade)
  }

  suspend() {
    this.ctx?.suspend().catch(() => {})
  }

  resume() {
    this.ctx?.resume().catch(() => {})
  }
}

export const audio = new AudioEngine()

// The window guard is not paranoia: a debug build's audio module is also
// imported by the unit tests, which run in node.
if (import.meta.env.VITE_ENABLE_DEBUG_TOOLS === 'true' && typeof window !== 'undefined') {
  const debugWindow = window as unknown as {
    __cpAudio?: { snapshot: () => AudioDebugSnapshot }
  }
  debugWindow.__cpAudio = {
    snapshot: () => audio.debugSnapshot(),
  }
}

export type { AmbienceId, MusicId }
