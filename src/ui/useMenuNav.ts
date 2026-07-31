import { useEffect, useRef, useState } from 'react'
import { audio } from '../systems/audio/audio'

/**
 * Keyboard + gamepad navigation for the DOM menus.
 *
 * Menus live in the DOM rather than the canvas, so they listen directly rather
 * than going through the gameplay input system. Gamepads have no input event,
 * but a 20 Hz poll is responsive for discrete menu presses and avoids waking a
 * high-refresh display's renderer 120 times per second while the menu is idle.
 */
export function useMenuNav(count: number, onSelect: (index: number) => void, onBack?: () => void) {
  const [index, setIndex] = useState(0)
  const idxRef = useRef(0)
  const selRef = useRef(onSelect)
  const backRef = useRef(onBack)
  selRef.current = onSelect
  backRef.current = onBack
  idxRef.current = index

  useEffect(() => {
    if (index >= count) setIndex(Math.max(0, count - 1))
  }, [count, index])

  useEffect(() => {
    const move = (delta: number) => {
      if (count === 0) return
      setIndex((i) => {
        const next = (i + delta + count) % count
        if (next !== i) audio.cue('ui')
        return next
      })
    }

    const onKey = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault()
          move(1)
          break
        case 'ArrowUp':
        case 'KeyW':
          e.preventDefault()
          move(-1)
          break
        case 'Enter':
        case 'Space':
        case 'KeyE':
          e.preventDefault()
          audio.cue('uiConfirm')
          selRef.current(idxRef.current)
          break
        case 'Escape':
          if (backRef.current) {
            e.preventDefault()
            // Menus own Escape while they are mounted. Stop the gameplay input
            // listener from seeing the same key and queuing a second pause
            // toggle on the following render frame.
            e.stopImmediatePropagation()
            audio.cue('uiBack')
            backRef.current()
          }
          break
      }
    }

    // Capture runs before the gameplay listener's bubble phase.
    window.addEventListener('keydown', onKey, true)

    // ── gamepad ──
    let prevY = 0
    let prevA = false
    let prevB = false
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? []
      const pad = Array.from(pads).find((p) => p && p.connected)
      if (!pad) return
      const y = (pad.axes[1] ?? 0) + (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0)
      const dir = y > 0.6 ? 1 : y < -0.6 ? -1 : 0
      if (dir !== 0 && prevY === 0) move(dir)
      prevY = dir

      const a = pad.buttons[0]?.pressed ?? false
      if (a && !prevA) {
        audio.cue('uiConfirm')
        selRef.current(idxRef.current)
      }
      prevA = a

      const b = pad.buttons[1]?.pressed ?? false
      if (b && !prevB && backRef.current) {
        audio.cue('uiBack')
        backRef.current()
      }
      prevB = b
    }
    const gamepadPoll = window.setInterval(poll, 50)

    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.clearInterval(gamepadPoll)
    }
  }, [count])

  return [index, setIndex] as const
}
