import type { ChapterId } from '../content/gameContent'

export type { ChapterId }

export type GamePhase =
  | 'boot'
  | 'title'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'journal'
  | 'credits'

export type QualityPreset = 'auto' | 'low' | 'medium' | 'high'

export interface Settings {
  quality: QualityPreset
  resolutionScale: number
  shadows: 'off' | 'low' | 'high'
  foliageDensity: number
  particleDensity: number
  bloom: boolean
  depthOfField: boolean
  reduceMotion: boolean
  masterVolume: number
  musicVolume: number
  ambienceVolume: number
  sfxVolume: number
  mouseSensitivity: number
  invertY: boolean
  reduceCameraMotion: boolean
  textScale: number
  highContrastPrompts: boolean
  holdToInteract: boolean
  /** Show the paper-star compass in the corner of the HUD. */
  showCompass: boolean
}

export interface Checkpoint {
  chapter: ChapterId
  position: [number, number, number]
  facing: number
}

export interface SaveData {
  version: number
  chapter: ChapterId
  checkpoint: Checkpoint | null
  memories: string[]
  townTasks: string[]
  journalPages: string[]
  constellations: string[]
  reachedParkingLot: boolean
  endingComplete: boolean
  playedSeconds: number
  updatedAt: number
}

export type InteractionVerb =
  | 'inspect'
  | 'talk'
  | 'collect'
  | 'deliver'
  | 'water'
  | 'sit'
  | 'pet'
  | 'ring'
  | 'open'
  | 'reveal'
  | 'enter'

export interface Interactable {
  id: string
  verb: InteractionVerb
  /** Shown after the verb, e.g. "Look — the journal". Optional. */
  label?: string
  position: [number, number, number]
  radius: number
  /** Lower sorts first when two are in range. */
  priority?: number
  /** Return false to hide the prompt without removing the registration. */
  enabled?: () => boolean
  onInteract: () => void
}
