import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useGame } from '../store/gameStore'
import {
  DEFAULT_SKETCHBOOK_PAGES,
  loadPersonalSketchbookPages,
  type CheetahDrawing,
  type SketchbookPage,
} from '../content/sketchbook'
import { sketchbookUi } from './sketchbookState'
import { audio } from '../systems/audio/audio'

function CheetahSketch({ drawing }: { drawing: CheetahDrawing }) {
  const transform =
    drawing === 'running'
      ? 'translate(10 3) rotate(-4 110 70)'
      : drawing === 'sleeping'
        ? 'translate(14 15) rotate(2 110 70)'
        : 'translate(4 2)'

  return (
    <svg
      className="sketchbook__drawing"
      viewBox="0 0 240 150"
      role="img"
      aria-label={`A loose pencil study of a ${drawing} cheetah`}
    >
      <g transform={transform}>
        {drawing === 'sleeping' ? (
          <>
            <path d="M50 99c15-31 58-38 92-20 20 10 34 9 49 1-4 20-25 31-49 27-34-6-63 12-92-8Z" />
            <path d="M58 96c-26 3-31 23-17 29 13 5 25-4 27-15" />
            <circle cx="159" cy="77" r="20" />
            <path d="m147 63-5-15 15 9m14 4 12-10-2 17" />
            <path d="M169 85c5 2 9 1 13-2" />
          </>
        ) : (
          <>
            <path d="M46 82c11-26 44-35 79-25l37 11c17 5 29 1 38-8-3 20-16 32-38 31l-30-2c-24-2-46 6-63 18Z" />
            <circle cx="58" cy="67" r="21" />
            <path d="m45 53-4-16 14 10m12 0 13-9-4 17M47 71l-17 6m19 2-18 13" />
            <path
              d={
                drawing === 'running'
                  ? 'M86 96 59 127m56-35 22 34m20-38 34 21m-70-15-18 34'
                  : 'M89 94 81 128m39-36 5 37m27-39 6 38m21-41 18 30'
              }
            />
            <path d="M195 62c20-17 32-11 29 6-2 13-18 20-30 12" />
          </>
        )}
        {[
          [77, 67, 3],
          [91, 61, 4],
          [106, 68, 3],
          [120, 62, 3.5],
          [136, 72, 3],
          [84, 79, 3],
          [101, 83, 4],
          [121, 79, 2.8],
          [144, 82, 3.5],
          [55, 62, 2.5],
          [64, 74, 2],
        ].map(([cx, cy, r], index) => (
          <circle key={index} cx={cx} cy={cy} r={r} className="sketchbook__spot" />
        ))}
      </g>
      <path className="sketchbook__ground" d="M20 130c56-8 122 11 201-5" />
      <path className="sketchbook__ghost-line" d="M31 30c35-12 60-8 77-1m53 4c21-7 37-5 53 3" />
    </svg>
  )
}

export function Sketchbook() {
  const { available, open } = useSyncExternalStore(
    sketchbookUi.subscribe,
    sketchbookUi.getSnapshot,
    sketchbookUi.getSnapshot,
  )
  const phase = useGame((state) => state.phase)
  const dialogue = useGame((state) => state.dialogue)
  const [personalPages, setPersonalPages] = useState<SketchbookPage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())
  const closeRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLButtonElement>(null)
  const restorePromptFocus = useRef(false)
  const pages = useMemo(
    () => [...DEFAULT_SKETCHBOOK_PAGES, ...personalPages],
    [personalPages],
  )
  const canOffer = available && phase === 'playing' && !dialogue
  const page = pages[Math.min(pageIndex, pages.length - 1)]

  const close = useCallback(() => {
    restorePromptFocus.current = true
    sketchbookUi.close()
    audio.cue('uiBack')
  }, [])

  const turn = useCallback((direction: -1 | 1) => {
    setPageIndex((current) => (current + direction + pages.length) % pages.length)
    audio.cue('journal')
  }, [pages.length])

  useEffect(() => {
    if (!available || loaded) return
    const controller = new AbortController()
    void loadPersonalSketchbookPages(controller.signal).then((personal) => {
      if (controller.signal.aborted) return
      setPersonalPages(personal)
      setLoaded(true)
    })
    return () => controller.abort()
  }, [available, loaded])

  useEffect(() => {
    if ((!canOffer || dialogue) && open) sketchbookUi.close()
  }, [canOffer, dialogue, open])

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open && canOffer && restorePromptFocus.current) {
      restorePromptFocus.current = false
      promptRef.current?.focus()
    }
  }, [canOffer, open])

  useEffect(() => {
    if (!canOffer) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open && event.code === 'KeyE') {
        event.preventDefault()
        event.stopPropagation()
        sketchbookUi.open()
        audio.cue('journal')
        return
      }
      if (!open) return

      if (event.code === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        turn(-1)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        turn(1)
      } else if (event.code === 'Home') {
        event.preventDefault()
        event.stopPropagation()
        setPageIndex(0)
      } else if (event.code === 'End') {
        event.preventDefault()
        event.stopPropagation()
        setPageIndex(pages.length - 1)
      }
    }
    // Capture before the game's window-level input listener: the book owns its keys.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [canOffer, close, open, pages.length, turn])

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'),
    )
    if (!controls.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!canOffer) return null

  return (
    <>
      {!open ? (
        <button
          ref={promptRef}
          className="sketchbook-prompt"
          type="button"
          onClick={() => {
            sketchbookUi.open()
            audio.cue('journal')
          }}
          aria-label="Open the raft sketchbook"
        >
          <span className="sketchbook-prompt__key" aria-hidden="true">E</span>
          <span>sketchbook</span>
        </button>
      ) : (
        <div
          className="sketchbook-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sketchbook-title"
          onKeyDown={keepFocusInside}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="sketchbook" data-page={page.id}>
            <span className="sketchbook__binding" aria-hidden="true" />
            <header className="sketchbook__header">
              <span className="sketchbook__eyebrow">raft field notes</span>
              <button
                ref={closeRef}
                className="sketchbook__close"
                type="button"
                onClick={close}
                aria-label="Close sketchbook"
              >
                close <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="sketchbook__page" key={page.id}>
              {page.kind === 'image' && !failedImages.has(page.id) ? (
                <img
                  className="sketchbook__image"
                  src={page.src}
                  alt={page.alt}
                  onError={() =>
                    setFailedImages((current) => new Set(current).add(page.id))
                  }
                />
              ) : (
                <CheetahSketch
                  drawing={page.kind === 'drawing' ? page.drawing : 'watching'}
                />
              )}
              {page.kind === 'image' && failedImages.has(page.id) ? (
                <p className="sketchbook__missing" role="status">
                  This page is waiting for its file.
                </p>
              ) : null}
              <h2 id="sketchbook-title" className="sketchbook__title">{page.title}</h2>
              {page.caption ? <p className="sketchbook__caption">{page.caption}</p> : null}
            </div>

            <footer className="sketchbook__footer">
              <button type="button" onClick={() => turn(-1)} aria-label="Previous page">
                ← previous
              </button>
              <span
                aria-live="polite"
                aria-label={`Page ${pageIndex + 1} of ${pages.length}: ${page.title}`}
              >
                {pageIndex + 1} / {pages.length}
              </span>
              <button type="button" onClick={() => turn(1)} aria-label="Next page">
                next →
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
