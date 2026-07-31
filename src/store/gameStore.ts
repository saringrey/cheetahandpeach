import { create } from 'zustand'
import type { ChapterId, GamePhase, SaveData, Settings, InteractionVerb } from '../types'
import {
  emptySave,
  loadSave,
  writeSave,
  clearSave,
  loadSettings,
  writeSettings,
  DEFAULT_SETTINGS,
  hasSave,
} from '../game/save/save'
import type { DialogueLine } from '../content/dialogue'
import { CHAPTER_TITLES, INTERSTITIAL_LINE } from '../content/gameContent'
import { runtime } from './runtime'

export interface PromptState {
  verb: InteractionVerb
  label?: string
  /** 0..1 while a hold-to-interact is in progress. */
  hold: number
}

export interface ChapterCard {
  title: string
  subtitle?: string
  key: number
}

export interface ToastState {
  text: string
  key: number
}

/**
 * `murmur` is a passer-by talking about her; `love` is him.
 *
 * They are the same mechanism and deliberately opposite treatments — cold, small
 * and off to the side versus warm and centred — because the whole point is that
 * one of these voices is worth listening to and the rest never were.
 */
export type WhisperKind = 'murmur' | 'love'

export interface WhisperState {
  text: string
  kind: WhisperKind
  key: number
}

export interface ChapterTransitionOptions {
  /**
   * `interstitial` keeps the long black prose card.
   * `dissolve` uses only a slow visual fade for continuous locations.
   */
  mode?: 'interstitial' | 'dissolve'
}

interface GameState {
  // ── lifecycle ───────────────────────────────────────────────────────────
  phase: GamePhase
  booted: boolean
  loadProgress: number
  hasExistingSave: boolean

  // ── progression ─────────────────────────────────────────────────────────
  save: SaveData
  /** Bumps whenever the active scene should hard-reset (new game / chapter jump). */
  sceneEpoch: number

  // ── presentation ────────────────────────────────────────────────────────
  settings: Settings
  prompt: PromptState | null
  dialogue: DialogueLine[] | null
  dialogueIndex: number
  chapterCard: ChapterCard | null
  toast: ToastState | null
  savingIndicator: boolean
  /** True while an authored camera move owns the camera. */
  cinematic: boolean
  /** Set once a cinematic has run long enough to be skippable. */
  cinematicSkippable: boolean
  /** Full-screen fade, 0 = clear, 1 = opaque black. */
  fade: number
  /** A single line of prose centered on screen, or null. */
  narration: string | null
  /**
   * A whisper: either something half-heard from a passer-by, or his voice.
   *
   * Kept separate from `narration` so the two can be on screen at once and so
   * they can look completely different — a scene setting narration must never
   * silently wipe a whisper that is mid-read.
   */
  whisper: WhisperState | null
  /** Full-screen black card shown between chapters, or null. */
  interstitial: string | null
  /** Ending overlay is active. */
  endingActive: boolean
  /** The written message has finished and the windshield callback may begin. */
  endingCallbackReady: boolean
  /** The quiet callback shot completed; ending actions may now appear. */
  endingCallbackDone: boolean

  // ── actions ─────────────────────────────────────────────────────────────
  boot: () => void
  setLoadProgress: (v: number) => void
  newGame: () => void
  continueGame: () => void
  replayEnding: () => void
  goToTitle: () => void
  setPhase: (p: GamePhase) => void
  togglePause: () => void
  toggleJournal: () => void

  setChapter: (c: ChapterId, opts?: { silent?: boolean }) => void
  setCheckpoint: (position: [number, number, number], facing: number) => void
  collectMemory: (id: string) => void
  completeTownTask: (id: string) => void
  completeConstellation: (id: string) => void
  markReachedParkingLot: () => void
  markEndingComplete: () => void
  resetProgress: () => void
  /** Debug-safe recovery: release presentation holds without touching progress. */
  recoverControl: () => void
  addPlayTime: (seconds: number) => void

  setPrompt: (p: PromptState | null) => void
  startDialogue: (lines: DialogueLine[]) => void
  advanceDialogue: () => void
  endDialogue: () => void
  showChapterCard: (title: string, subtitle?: string) => void
  clearChapterCard: () => void
  showToast: (text: string) => void
  clearToast: () => void
  setNarration: (text: string | null) => void
  /** Show a whisper. `kind` picks the treatment; passing null clears it. */
  showWhisper: (text: string, kind: WhisperKind) => void
  clearWhisper: () => void
  setInterstitial: (text: string | null) => void
  /** Fade out, optionally hold a black card, swap chapter, fade back in. */
  transitionToChapter: (
    c: ChapterId,
    line?: string,
    options?: ChapterTransitionOptions,
  ) => void

  setCinematic: (v: boolean) => void
  setCinematicSkippable: (v: boolean) => void
  setFade: (v: number) => void
  setEndingActive: (v: boolean) => void
  setEndingCallbackReady: (v: boolean) => void
  setEndingCallbackDone: (v: boolean) => void

  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void

  persist: () => void
}

/** The line held on the black card between chapters. Editable in gameContent. */
const FADE_OUT_MS = 1200
const SCENE_FADE_IN_MS = 1400
const INTERSTITIAL_MS = 10_000
let transitioning = false
/** Every timer a running transition owns, so a new game can cancel them. */
let transitionTimers: ReturnType<typeof setTimeout>[] = []

/**
 * Abandon any in-flight chapter transition and hand control back.
 *
 * Starting a new game, loading a save, or bailing to the title in the middle of
 * a transition used to leave `transitioning` latched true and the control hold
 * still taken — the next chapter change was silently ignored and the player
 * could not move. Everything about a transition is torn down here.
 */
function resetControlState() {
  transitionTimers.forEach(clearTimeout)
  transitionTimers = []
  transitioning = false
  runtime.releaseAllControl()
}

let toastKey = 0
let cardKey = 0
let whisperKey = 0
let saveIndicatorTimer: ReturnType<typeof setTimeout> | null = null

export const useGame = create<GameState>((set, get) => ({
  phase: 'boot',
  booted: false,
  loadProgress: 0,
  hasExistingSave: false,

  save: emptySave(),
  sceneEpoch: 0,

  settings: { ...DEFAULT_SETTINGS },
  prompt: null,
  dialogue: null,
  dialogueIndex: 0,
  chapterCard: null,
  toast: null,
  savingIndicator: false,
  cinematic: false,
  cinematicSkippable: false,
  fade: 1,
  narration: null,
  whisper: null,
  interstitial: null,
  endingActive: false,
  endingCallbackReady: false,
  endingCallbackDone: false,

  boot: () => {
    const loaded = loadSave()
    set({
      settings: loadSettings(),
      save: loaded ?? emptySave(),
      hasExistingSave: loaded !== null,
      booted: true,
    })
  },

  setLoadProgress: (v) => set({ loadProgress: Math.max(0, Math.min(1, v)) }),

  newGame: () => {
    const fresh = emptySave()
    writeSave(fresh)
    resetControlState()
    set((s) => ({
      save: fresh,
      phase: 'playing',
      sceneEpoch: s.sceneEpoch + 1,
      hasExistingSave: true,
      prompt: null,
      dialogue: null,
      whisper: null,
      endingActive: false,
      endingCallbackReady: false,
      endingCallbackDone: false,
      narration: null,
      interstitial: null,
      cinematic: false,
    }))
  },

  continueGame: () => {
    const loaded = loadSave() ?? emptySave()
    // A save that finished the game drops back into the parking lot so
    // "Continue" always lands somewhere playable.
    const chapter: ChapterId = loaded.chapter === 'ending' ? 'parkingLot' : loaded.chapter
    resetControlState()
    set((s) => ({
      save: { ...loaded, chapter },
      phase: 'playing',
      sceneEpoch: s.sceneEpoch + 1,
      prompt: null,
      dialogue: null,
      whisper: null,
      endingActive: false,
      endingCallbackReady: false,
      endingCallbackDone: false,
      narration: null,
      cinematic: false,
    }))
  },

  replayEnding: () => {
    const current = get().save
    if (!current.endingComplete) return

    const replaySave: SaveData = {
      ...current,
      chapter: 'parkingLot',
      checkpoint: null,
    }
    writeSave(replaySave)
    resetControlState()
    set((s) => ({
      save: replaySave,
      phase: 'playing',
      sceneEpoch: s.sceneEpoch + 1,
      hasExistingSave: true,
      prompt: null,
      dialogue: null,
      dialogueIndex: 0,
      chapterCard: null,
      toast: null,
      endingActive: false,
      endingCallbackReady: false,
      endingCallbackDone: false,
      narration: null,
      whisper: null,
      interstitial: null,
      cinematic: false,
      cinematicSkippable: false,
    }))
  },

  goToTitle: () => {
    resetControlState()
    set((s) => ({
      phase: 'title',
      hasExistingSave: hasSave(),
      prompt: null,
      dialogue: null,
      whisper: null,
      endingActive: false,
      endingCallbackReady: false,
      endingCallbackDone: false,
      narration: null,
      cinematic: false,
      chapterCard: null,
      sceneEpoch: s.sceneEpoch + 1,
    }))
  },

  setPhase: (p) => set({ phase: p }),

  togglePause: () => {
    const { phase } = get()
    if (phase === 'playing') set({ phase: 'paused', prompt: null })
    else if (phase === 'paused') set({ phase: 'playing' })
    else if (phase === 'journal') set({ phase: 'playing' })
  },

  toggleJournal: () => {
    const { phase } = get()
    if (phase === 'playing') set({ phase: 'journal', prompt: null })
    else if (phase === 'journal') set({ phase: 'playing' })
  },

  setChapter: (chapter, opts) => {
    set((s) => ({
      save: { ...s.save, chapter, checkpoint: null },
      sceneEpoch: s.sceneEpoch + 1,
      prompt: null,
      dialogue: null,
    }))
    get().persist()
    if (!opts?.silent) {
      const card = CHAPTER_TITLES[chapter]
      if (card && card.title) get().showChapterCard(card.title, card.subtitle)
    }
  },

  setCheckpoint: (position, facing) => {
    set((s) => ({
      save: { ...s.save, checkpoint: { chapter: s.save.chapter, position, facing } },
    }))
  },

  collectMemory: (id) => {
    const { save } = get()
    if (save.memories.includes(id)) return
    set({
      save: {
        ...save,
        memories: [...save.memories, id],
        journalPages: save.journalPages.includes(id)
          ? save.journalPages
          : [...save.journalPages, id],
      },
    })
    get().persist()
  },

  completeTownTask: (id) => {
    const { save } = get()
    if (save.townTasks.includes(id)) return
    set({ save: { ...save, townTasks: [...save.townTasks, id] } })
    get().persist()
  },

  completeConstellation: (id) => {
    const { save } = get()
    if (save.constellations.includes(id)) return
    set({ save: { ...save, constellations: [...save.constellations, id] } })
    get().persist()
  },

  markReachedParkingLot: () => {
    const { save } = get()
    if (save.reachedParkingLot) return
    set({ save: { ...save, reachedParkingLot: true } })
    get().persist()
  },

  markEndingComplete: () => {
    set((s) => ({ save: { ...s.save, endingComplete: true } }))
    get().persist()
  },

  resetProgress: () => {
    clearSave()
    resetControlState()
    set({
      save: emptySave(),
      hasExistingSave: false,
      endingActive: false,
      endingCallbackReady: false,
      endingCallbackDone: false,
      prompt: null,
      dialogue: null,
      dialogueIndex: 0,
      narration: null,
      whisper: null,
      interstitial: null,
      cinematic: false,
      cinematicSkippable: false,
    })
  },

  recoverControl: () => {
    resetControlState()
    set({
      prompt: null,
      cinematic: false,
      cinematicSkippable: false,
      narration: null,
      whisper: null,
      interstitial: null,
      fade: 0,
    })
  },

  addPlayTime: (seconds) =>
    set((s) => ({ save: { ...s.save, playedSeconds: s.save.playedSeconds + seconds } })),

  setPrompt: (p) => {
    const cur = get().prompt
    // Avoid a re-render when nothing meaningful changed.
    if (!p && !cur) return
    if (p && cur && p.verb === cur.verb && p.label === cur.label && p.hold === cur.hold) return
    set({ prompt: p })
  },

  startDialogue: (lines) => {
    if (!lines.length) return
    set({ dialogue: lines, dialogueIndex: 0, prompt: null })
  },

  advanceDialogue: () => {
    const { dialogue, dialogueIndex } = get()
    if (!dialogue) return
    if (dialogueIndex + 1 >= dialogue.length) set({ dialogue: null, dialogueIndex: 0 })
    else set({ dialogueIndex: dialogueIndex + 1 })
  },

  endDialogue: () => set({ dialogue: null, dialogueIndex: 0 }),

  showChapterCard: (title, subtitle) => set({ chapterCard: { title, subtitle, key: ++cardKey } }),
  clearChapterCard: () => set({ chapterCard: null }),

  showToast: (text) => set({ toast: { text, key: ++toastKey } }),
  clearToast: () => set({ toast: null }),

  setNarration: (text) => set({ narration: text }),

  showWhisper: (text, kind) => {
    const cur = get().whisper
    // His voice outranks the murmurs. A passer-by muttering as she walks past
    // must never cut off the one line in the chapter that is actually for her.
    if (cur && cur.kind === 'love' && kind === 'murmur') return
    if (cur && cur.text === text && cur.kind === kind) return
    set({ whisper: { text, kind, key: ++whisperKey } })
  },

  clearWhisper: () => {
    if (!get().whisper) return
    set({ whisper: null })
  },
  setInterstitial: (text) => set({ interstitial: text }),

  transitionToChapter: (
    chapter,
    line = INTERSTITIAL_LINE,
    options = { mode: 'interstitial' },
  ) => {
    // Guard against a second call while one is already running (a trigger that
    // fires twice must not queue two chapter changes).
    if (transitioning) return
    transitioning = true

    const s = get()
    s.setPrompt(null)
    s.endDialogue()
    runtime.holdControl('transition', true)

    // Fade down over time. Setting opacity straight to 1 made every chapter exit
    // a one-frame teleport before the prose card appeared.
    const fadeSteps = 24
    transitionTimers = Array.from({ length: fadeSteps }, (_, i) =>
      setTimeout(
        () => useGame.getState().setFade((i + 1) / fadeSteps),
        ((i + 1) / fadeSteps) * FADE_OUT_MS,
      ),
    )

    if (options.mode === 'dissolve') {
      // Used where geography is continuous: the woodland road already reveals
      // the JEWEL sign, then this brief dissolve changes only scene ownership.
      transitionTimers.push(
        setTimeout(() => {
          useGame.getState().setChapter(chapter, { silent: true })
        }, FADE_OUT_MS),
        setTimeout(() => {
          runtime.holdControl('transition', false)
          transitioning = false
          transitionTimers = []
        }, FADE_OUT_MS + SCENE_FADE_IN_MS + 80),
      )
      return
    }

    transitionTimers.push(
      // Hold the card.
      setTimeout(() => {
        useGame.getState().setInterstitial(line)
      }, FADE_OUT_MS),
      // Swap the chapter behind the card, then clear it.
      setTimeout(() => {
        useGame.getState().setChapter(chapter, { silent: false })
      }, FADE_OUT_MS + INTERSTITIAL_MS - 400),
      setTimeout(() => {
        useGame.getState().setInterstitial(null)
        runtime.holdControl('transition', false)
        transitioning = false
        transitionTimers = []
      }, FADE_OUT_MS + INTERSTITIAL_MS),
    )
  },

  setCinematic: (v) => set({ cinematic: v, cinematicSkippable: v ? false : false, prompt: null }),
  setCinematicSkippable: (v) => set({ cinematicSkippable: v }),
  setFade: (v) => set({ fade: Math.max(0, Math.min(1, v)) }),
  setEndingActive: (v) =>
    set({
      endingActive: v,
      endingCallbackReady: false,
      endingCallbackDone: false,
    }),
  setEndingCallbackReady: (v) => set({ endingCallbackReady: v }),
  setEndingCallbackDone: (v) => set({ endingCallbackDone: v }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    writeSettings(next)
  },

  resetSettings: () => {
    set({ settings: { ...DEFAULT_SETTINGS } })
    writeSettings({ ...DEFAULT_SETTINGS })
  },

  persist: () => {
    writeSave(get().save)
    set({ savingIndicator: true, hasExistingSave: true })
    if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer)
    saveIndicatorTimer = setTimeout(() => useGame.setState({ savingIndicator: false }), 1400)
  },
}))

/** Non-reactive read, for use inside useFrame where subscribing would be wasteful. */
export const gameState = () => useGame.getState()
