import type { SaveData, Settings, ChapterId } from '../../types'

export const SAVE_VERSION = 3
const SAVE_KEY = 'cheetah-peach.save.v1'
const SETTINGS_KEY = 'cheetah-peach.settings.v1'

export const CHAPTER_ORDER: ChapterId[] = [
  'cottage',
  'town',
  'forest',
  'crossing',
  'mountain',
  'transition',
  'parkingLot',
  'ending',
]

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    chapter: 'cottage',
    checkpoint: null,
    memories: [],
    townTasks: [],
    journalPages: [],
    constellations: [],
    reachedParkingLot: false,
    endingComplete: false,
    playedSeconds: 0,
    updatedAt: Date.now(),
  }
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  resolutionScale: 1,
  shadows: 'high',
  foliageDensity: 1,
  particleDensity: 1,
  bloom: true,
  depthOfField: false,
  reduceMotion: false,
  masterVolume: 0.85,
  musicVolume: 0.7,
  ambienceVolume: 0.8,
  sfxVolume: 0.8,
  mouseSensitivity: 1,
  invertY: false,
  reduceCameraMotion: false,
  textScale: 1,
  highContrastPrompts: false,
  holdToInteract: false,
  showCompass: true,
}

function isChapter(v: unknown): v is ChapterId {
  return typeof v === 'string' && (CHAPTER_ORDER as string[]).includes(v)
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function finiteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * Bring any older/partial/hostile save shape up to the current version.
 * This never throws — anything it cannot understand is replaced with a safe default.
 */
export function migrate(raw: unknown): SaveData {
  const base = emptySave()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const chapter = isChapter(r.chapter) ? r.chapter : base.chapter

  // Checkpoint positions from older versions may be from a scene that no longer
  // exists, or may contain NaN. Drop anything that is not three finite numbers.
  let checkpoint = base.checkpoint
  const cp = r.checkpoint as Record<string, unknown> | null | undefined
  if (cp && typeof cp === 'object' && isChapter(cp.chapter)) {
    const p = cp.position
    if (Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      const withinSanity = (p as number[]).every((n) => Math.abs(n) < 5000)
      if (withinSanity && cp.chapter === chapter) {
        checkpoint = {
          chapter: cp.chapter,
          position: p as [number, number, number],
          facing: finiteNumber(cp.facing, 0),
        }
      }
    }
  }

  return {
    version: SAVE_VERSION,
    chapter,
    checkpoint,
    memories: stringArray(r.memories),
    townTasks: stringArray(r.townTasks),
    journalPages: stringArray(r.journalPages),
    constellations: stringArray(r.constellations),
    reachedParkingLot: r.reachedParkingLot === true,
    endingComplete: r.endingComplete === true,
    playedSeconds: Math.max(0, finiteNumber(r.playedSeconds, 0)),
    updatedAt: finiteNumber(r.updatedAt, Date.now()),
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    // Corrupted JSON, blocked storage, quota errors — treat as "no save".
    return null
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
  } catch {
    /* storage unavailable — the run still works, it just will not persist */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  return loadSave() !== null
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const merged = { ...DEFAULT_SETTINGS } as Record<string, unknown>
    // Only accept keys we know about, and only if the type matches the default.
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const incoming = parsed[key]
      const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key]
      if (typeof incoming === typeof fallback && incoming !== null) {
        if (typeof incoming === 'number' && !Number.isFinite(incoming)) continue
        merged[key] = incoming
      }
    }
    return merged as unknown as Settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function nextChapter(chapter: ChapterId): ChapterId {
  const i = CHAPTER_ORDER.indexOf(chapter)
  if (i < 0 || i === CHAPTER_ORDER.length - 1) return chapter
  return CHAPTER_ORDER[i + 1]
}

export function chapterIndex(chapter: ChapterId): number {
  return Math.max(0, CHAPTER_ORDER.indexOf(chapter))
}
