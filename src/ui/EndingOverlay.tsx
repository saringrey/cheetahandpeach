import { useEffect, useState, useRef } from 'react'
import { useGame } from '../store/gameStore'
import {
  APPROACH_SONG,
  FINAL_MESSAGE,
  FINAL_LINE,
  FINAL_MEDIA,
  SILENCE_BEFORE_MESSAGE,
  THE_NOTE,
} from '../content/finalMessage'
import { audio } from '../systems/audio/audio'

/**
 * The final message.
 *
 * Groups arrive one at a time and stay. The silence before the first one is
 * part of the scene, so it is a real wait, not a fade. Optional personal media
 * (photograph, recording, song) is attempted and quietly skipped if absent.
 */
export function EndingOverlay() {
  const active = useGame((s) => s.endingActive)
  const callbackReady = useGame((s) => s.endingCallbackReady)
  const callbackDone = useGame((s) => s.endingCallbackDone)
  const setEndingActive = useGame((s) => s.setEndingActive)
  const setEndingCallbackReady = useGame((s) => s.setEndingCallbackReady)
  const setEndingCallbackDone = useGame((s) => s.setEndingCallbackDone)
  const markEndingComplete = useGame((s) => s.markEndingComplete)
  const goToTitle = useGame((s) => s.goToTitle)
  const toggleJournal = useGame((s) => s.toggleJournal)
  const setPhase = useGame((s) => s.setPhase)
  const sceneEpoch = useGame((s) => s.sceneEpoch)

  const [noteOpen, setNoteOpen] = useState(false)
  const [visibleGroups, setVisibleGroups] = useState(0)
  const [showFinalLine, setShowFinalLine] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [photoOk, setPhotoOk] = useState(true)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // Reset whenever the ending starts (including a replay).
    timers.current.forEach(clearTimeout)
    timers.current = []
    setNoteOpen(false)
    setVisibleGroups(0)
    setShowFinalLine(false)
    setShowActions(false)
    setPhotoOk(true)

    if (!active) return

    // The note he handed her opens first; the message is what is written on it.
    const noteMs = THE_NOTE.lines.length ? THE_NOTE.hold * 1000 : 0
    if (noteMs) timers.current.push(setTimeout(() => setNoteOpen(true), 900))

    let t = noteMs + SILENCE_BEFORE_MESSAGE * 1000
    FINAL_MESSAGE.forEach((group, i) => {
      timers.current.push(setTimeout(() => setVisibleGroups(i + 1), t))
      t += group.hold * 1000
    })
    timers.current.push(setTimeout(() => setShowFinalLine(true), t + 1500))
    timers.current.push(setTimeout(() => setEndingCallbackReady(true), t + 4200))

    // Optional personal media, all failure-tolerant.
    if (FINAL_MEDIA.voiceRecording) {
      timers.current.push(
        setTimeout(() => {
          void audio.playOptional(FINAL_MEDIA.voiceRecording, 'music')
        }, SILENCE_BEFORE_MESSAGE * 1000),
      )
    }
    // Their song is cued only once the note and the message have been seen and
    // put away — the same beat the text clears and she looks around the lot.
    // Warmed now so it starts the instant that moment lands, and the looping
    // parking-lot track bows out underneath it.
    if (FINAL_MEDIA.song) {
      void audio.preloadOptional(FINAL_MEDIA.song)
      timers.current.push(
        setTimeout(() => {
          void audio.playOptional(FINAL_MEDIA.song, 'music').then((played) => {
            if (played) audio.stopOptional(APPROACH_SONG, 'music', 2.6)
          })
        }, t + 4200),
      )
    }

    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
  }, [active, sceneEpoch, setEndingCallbackReady])

  useEffect(() => {
    if (!active || !callbackReady) return
    if (callbackDone) {
      setShowActions(true)
      markEndingComplete()
      return
    }

    // The parking scene normally completes this after the next traffic pass.
    // A fallback keeps an interrupted renderer from trapping the player.
    //
    // 14 s is deliberate, not arbitrary. The callback's real budget is 1.8 s
    // camera move + 0.42 s settle + 0.3 s spawn delay + up to 2.9 s of run-up +
    // 4.9 s of return shot ≈ 10.4 s, so this clears it with ~3.5 s spare. Raising
    // it further only delays the ending for anyone whose renderer *did* stall —
    // including the debug entry point, which has no parking scene to drive the
    // callback at all and therefore always waits out this timer.
    const fallback = setTimeout(() => setEndingCallbackDone(true), 14_000)
    return () => clearTimeout(fallback)
  }, [
    active,
    callbackDone,
    callbackReady,
    markEndingComplete,
    setEndingCallbackDone,
  ])

  if (!active) return null

  return (
    <div className={`ending${callbackReady && !callbackDone ? ' ending--callback' : ''}`}>
      <div className="ending__stack">
        {!callbackReady && noteOpen && visibleGroups === 0 ? (
          <div className="note">
            <div className="note__paper">
              {THE_NOTE.heading ? <div className="note__heading">{THE_NOTE.heading}</div> : null}
              {THE_NOTE.lines.map((l, i) => (
                <p key={i}>{l || '\u00a0'}</p>
              ))}
            </div>
          </div>
        ) : null}

        {!callbackReady
          ? FINAL_MESSAGE.slice(0, visibleGroups).map((group, i) => (
              <div className="ending__group" key={i}>
                {group.lines.map((line, j) => (
                  <p key={j}>{line || ' '}</p>
                ))}
              </div>
            ))
          : null}

        {!callbackReady &&
        visibleGroups >= FINAL_MESSAGE.length &&
        FINAL_MEDIA.photograph &&
        photoOk ? (
          <img
            className="ending__photo"
            src={FINAL_MEDIA.photograph}
            alt={FINAL_MEDIA.photographAlt}
            onError={() => setPhotoOk(false)}
          />
        ) : null}

        {showFinalLine && (!callbackReady || callbackDone) ? (
          <div className="ending__group">
            <p style={{ fontStyle: 'italic', opacity: 0.82 }}>{FINAL_LINE}</p>
          </div>
        ) : null}

        {showActions ? (
          <div className="ending__actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                audio.cue('ui')
                setEndingActive(false)
                toggleJournal()
              }}
            >
              Open the journal
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                audio.cue('ui')
                setEndingActive(false)
                setPhase('credits')
              }}
            >
              Credits
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                audio.cue('uiBack')
                audio.stopAll(1.2)
                setEndingActive(false)
                goToTitle()
              }}
            >
              Return to the title
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
