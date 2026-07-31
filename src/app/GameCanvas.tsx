import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  SMAA,
  HueSaturation,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

import { useGame } from '../store/gameStore'
import { runtime } from '../store/runtime'
import { input } from '../game/input/input'
import { writeFrameInput, frameInput } from '../game/input/frame'
import { audio } from '../systems/audio/audio'
import { autoQuality } from '../systems/performance/quality'
import { useQualityProfile } from '../systems/performance/useQualityProfile'
import { budgetedFrameDuration } from '../systems/performance/frameBudget'
import { director } from '../game/camera/director'
import { PALETTES } from '../systems/environment/palettes'
import { MoonlitGrade } from '../systems/environment/MoonlitGrade'
import { damp } from '../utils/math'

import { TitleScene } from '../scenes/title/TitleScene'
import { CottageScene } from '../scenes/cottage/CottageScene'
import { TownScene } from '../scenes/town/TownScene'
import { ForestScene } from '../scenes/forest/ForestScene'
import { CrossingScene } from '../scenes/crossing/CrossingScene'
import { MountainScene } from '../scenes/mountain/MountainScene'
import { TransitionScene } from '../scenes/transition/TransitionScene'
import { ParkingLotScene } from '../scenes/parkingLot/ParkingLotScene'

/** Seconds the paper star keeps the guide lit after she holds it up. */
export const QUEST_GUIDE_SECONDS = 12

/* ── input ─────────────────────────────────────────────────────────────────
 * Polled once per frame, before everything else, so the controller, camera and
 * interaction driver all see the same frame's edges.
 * ────────────────────────────────────────────────────────────────────────── */
function InputPump() {
  useEffect(() => {
    // Store transitions are synchronous, while a rendered frame can arrive
    // later. Keep the input boundary in step immediately so the first movement
    // key after closing Pause/Dialogue cannot be discarded during that gap.
    const syncGameplayFocus = (state: ReturnType<typeof useGame.getState>) => {
      input.gameplayFocus = state.phase === 'playing' && !state.dialogue
    }
    syncGameplayFocus(useGame.getState())
    return useGame.subscribe(syncGameplayFocus)
  }, [])

  useFrame((_, dt) => {
    const s = useGame.getState()
    const snap = input.poll(dt)
    writeFrameInput(snap)

    if (snap.pausePressed) {
      if (s.dialogue) s.endDialogue()
      else if (s.phase === 'journal') s.toggleJournal()
      else if (s.phase === 'playing' || s.phase === 'paused') s.togglePause()
      audio.cue('uiBack')
    }
    if (snap.journalPressed && (s.phase === 'playing' || s.phase === 'journal')) {
      s.toggleJournal()
      audio.cue('journal')
    }
    // The paper star: her own way of asking "which way?". Puts time on the guide
    // clock, which lights the wisps and shows the compass without waiting for
    // the idle timer to decide she is lost.
    if (snap.questPressed && s.phase === 'playing' && !s.dialogue && !s.cinematic) {
      runtime.questGuideSeconds = QUEST_GUIDE_SECONDS
      audio.cue('chime')
    }
    // Advancing dialogue is handled here so it works with keyboard and pad alike.
    if (s.dialogue && snap.interactPressed) {
      frameInput.interactPressed = false
      s.advanceDialogue()
      audio.cue('ui')
    }
    // Skipping a cinematic.
    if (s.cinematic && s.cinematicSkippable && (snap.interactPressed || snap.anyPressed)) {
      frameInput.interactPressed = false
      director.skip()
    }
  }, -1000)
  return null
}

/* ── quality ───────────────────────────────────────────────────────────── */
function QualityManager() {
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  const { settings, tier, profile } = useQualityProfile()
  const shadowElapsed = useRef(Number.POSITIVE_INFINITY)
  const lastWallFrame = useRef(performance.now())

  useEffect(() => {
    // Cap DPR: a Retina panel at native resolution is 4x the pixels for no
    // visible gain in a stylized game.
    const dpr = Math.min(profile.dpr, window.devicePixelRatio || 1, 1.35)
    setDpr(dpr)
    runtime.effectiveDpr = dpr
    gl.shadowMap.enabled = profile.shadows !== 'off'
    gl.shadowMap.type = THREE.PCFShadowMap
    // Shadow maps are the most expensive second render of the scene. Updating
    // them at 20–30 Hz is visually smooth but avoids rebuilding a 1K/2K map on
    // every display refresh.
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    shadowElapsed.current = 0
    runtime.activeQuality = tier
  }, [profile, setDpr, gl, tier])

  useFrame((_, dt) => {
    // R3F receives our monotonic simulation clock, so `dt` is intentionally a
    // fixed budget step. Diagnostics and Auto quality must use actual wall
    // cadence or a struggling GPU still reports a perfect synthetic 16.7 ms.
    const now = performance.now()
    const wallDt = (now - lastWallFrame.current) / 1000
    lastWallFrame.current = now
    if (wallDt > 0 && wallDt < 0.2) {
      if (settings.quality === 'auto') autoQuality.update(wallDt)
      const sampleMs = wallDt * 1000
      runtime.frameMs =
        runtime.frameMs > 0 ? runtime.frameMs * 0.9 + sampleMs * 0.1 : sampleMs
      runtime.fps = runtime.frameMs > 0 ? 1000 / runtime.frameMs : 0
    }

    if (profile.shadows !== 'off') {
      shadowElapsed.current += dt
      const shadowInterval = profile.shadows === 'high' ? 1 / 24 : 1 / 15
      if (shadowElapsed.current >= shadowInterval) {
        shadowElapsed.current %= shadowInterval
        gl.shadowMap.needsUpdate = true
      }
    }
  }, -900)

  return null
}

/**
 * Count the whole frame, including post-processing passes. WebGLRenderer resets
 * its counters for each render call by default, which made the old debug probe
 * report only the final fullscreen pass.
 */
function RenderStats() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const sampledFrames = useRef(0)
  const announced = useRef(false)

  useEffect(() => {
    // Debug-only probe. The game is set at night, so a screenshot is a poor
    // way to check whether something is the size it should be; this lets an
    // automated pass measure the scene graph directly. Compile-time gated, so
    // it is never present in a normal build.
    const debugWindow = window as unknown as Record<string, unknown>
    if (import.meta.env.VITE_ENABLE_DEBUG_TOOLS === 'true') debugWindow.__cpScene = scene

    const previousAutoReset = gl.info.autoReset
    gl.info.autoReset = false
    const removeAfterEffect = addAfterEffect(() => {
      runtime.drawCalls = gl.info.render.calls
      runtime.triangles = gl.info.render.triangles
      runtime.shaderPrograms = gl.info.programs?.length ?? 0
      runtime.framebufferWidth = gl.domElement.width
      runtime.framebufferHeight = gl.domElement.height

      // A document load is not proof that a WebGL game rendered. Sample one
      // framebuffer pixel occasionally until a real frame is present, then
      // publish a platform-neutral readiness signal for the macOS host and
      // automated smoke checks. This runs once per page lifetime.
      if (!announced.current && ++sampledFrames.current % 12 === 0) {
        const context = gl.getContext()
        const pixel = new Uint8Array(4)
        context.readPixels(
          Math.max(0, Math.floor(gl.domElement.width / 2)),
          Math.max(0, Math.floor(gl.domElement.height / 2)),
          1,
          1,
          context.RGBA,
          context.UNSIGNED_BYTE,
          pixel,
        )
        const hasFrame =
          gl.domElement.width > 0 &&
          gl.domElement.height > 0 &&
          scene.children.length > 0 &&
          pixel[0] + pixel[1] + pixel[2] > 3

        if (hasFrame) {
          const rendererInfo = context.getExtension('WEBGL_debug_renderer_info')
          const renderer = rendererInfo
            ? String(context.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL))
            : String(context.getParameter(context.RENDERER))
          runtime.rendererName = renderer
          announced.current = true
          document.documentElement.dataset.webglReady = 'true'
          window.dispatchEvent(
            new CustomEvent('cheetah-peach-render-ready', {
              detail: {
                width: gl.domElement.width,
                height: gl.domElement.height,
                renderer,
                pixel: Array.from(pixel),
              },
            }),
          )
        }
      }
    })
    return () => {
      removeAfterEffect()
      delete document.documentElement.dataset.webglReady
      gl.info.autoReset = previousAutoReset
      delete debugWindow.__cpScene
    }
  }, [gl, scene])

  useFrame(() => gl.info.reset(), -10_000)
  return null
}

/**
 * Chapter-local exposure keeps the warm cottage from clipping while allowing
 * the forest, descent, and parking lot to retain their authored ground detail.
 * It is eased on the render loop, so chapter changes feel like the eye slowly
 * adapting instead of a brightness switch.
 */
function ExposureManager() {
  const gl = useThree((s) => s.gl)
  const chapter = useGame((s) => s.save.chapter)
  const phase = useGame((s) => s.phase)
  const palette = PALETTES[phase === 'title' ? 'title' : chapter] ?? PALETTES.cottage

  useFrame((_, rawDt) => {
    gl.toneMappingExposure = damp(
      gl.toneMappingExposure,
      palette.exposure,
      2.4,
      Math.min(rawDt, 0.05),
    )
  }, -850)

  return null
}

/* ── post-processing ───────────────────────────────────────────────────── */
function Post() {
  const { profile } = useQualityProfile()
  const chapter = useGame((s) => s.save.chapter)
  const phase = useGame((s) => s.phase)
  const palette = PALETTES[phase === 'title' ? 'title' : chapter] ?? PALETTES.cottage

  const enableBloom = profile.bloom
  const enableSmaa = profile.smaa

  return (
    <EffectComposer enableNormalPass={false} multisampling={0}>
      {enableSmaa ? <SMAA /> : <></>}
      {enableBloom ? (
        <Bloom
          intensity={palette.bloomIntensity * 0.58}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.22}
          mipmapBlur
          radius={0.5}
        />
      ) : (
        <></>
      )}
      <HueSaturation saturation={palette.saturation} hue={0} blendFunction={BlendFunction.NORMAL} />
      <MoonlitGrade
        brightness={palette.brightness ?? -0.035}
        contrast={palette.contrast ?? 0.14}
      />
      <Vignette
        offset={0.16}
        darkness={palette.vignette}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}

/* ── scene router ──────────────────────────────────────────────────────── */
function SceneRouter() {
  const phase = useGame((s) => s.phase)
  const chapter = useGame((s) => s.save.chapter)
  const epoch = useGame((s) => s.sceneEpoch)

  if (phase === 'boot' || phase === 'title' || phase === 'credits') {
    return <TitleScene key={`title-${epoch}`} />
  }

  switch (chapter) {
    case 'cottage':
      return <CottageScene key={`cottage-${epoch}`} />
    case 'town':
      return <TownScene key={`town-${epoch}`} />
    case 'forest':
      return <ForestScene key={`forest-${epoch}`} />
    case 'crossing':
      return <CrossingScene key={`crossing-${epoch}`} />
    case 'mountain':
      return <MountainScene key={`mountain-${epoch}`} />
    case 'transition':
      return <TransitionScene key={`transition-${epoch}`} />
    case 'parkingLot':
    case 'ending':
      return <ParkingLotScene key={`lot-${epoch}`} />
    default:
      return <TitleScene key={`title-${epoch}`} />
  }
}

/* ── frame budget + tab visibility ─────────────────────────────────────── */
function FrameScheduler() {
  const advance = useThree((s) => s.advance)
  const phase = useGame((s) => s.phase)
  // The title is a quiet background behind compositor-driven DOM UI. A 20 Hz
  // world update keeps fireflies and constellation shimmer alive while cutting
  // one third of the idle GPU submissions of the previous 30 Hz cap. Gameplay
  // remains responsive at 60 Hz.
  const targetFps = phase === 'playing' ? 60 : 20
  const renderTime = useRef(0)

  useEffect(() => {
    // Automation escape hatch: ?alwaysRun=1 drives frames from a Web Worker
    // timer, which browsers do not throttle in hidden tabs — so smoke tests
    // and headless drivers can play through while the tab is occluded.
    if (new URLSearchParams(window.location.search).has('alwaysRun')) {
      const src = 'setInterval(() => postMessage(0), 17)'
      const workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
      const worker = new Worker(workerUrl)
      worker.onmessage = () => {
        renderTime.current += 1 / 60
        advance(renderTime.current)
      }
      return () => {
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
      }
    }

    let lastFrame = performance.now()
    let raf = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden) return
      const elapsed = now - lastFrame
      const delivered = budgetedFrameDuration(elapsed, targetFps)
      if (delivered === 0) return
      lastFrame = Math.min(now, lastFrame + delivered)
      // The manual R3F clock consumes seconds, not the browser's millisecond
      // timestamp. Own a monotonic timeline so switching 30↔60 FPS never jumps
      // or reverses simulation time.
      renderTime.current += delivered / 1000
      advance(renderTime.current)
    }

    const onVis = () => {
      if (document.hidden) {
        audio.suspend()
      } else {
        lastFrame = performance.now()
        audio.resume()
      }
    }

    raf = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [advance, targetFps])

  return null
}

/* ── WebGL failure fallback ────────────────────────────────────────────── */
function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl'))
    )
  } catch {
    return false
  }
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const [webglOk] = useState(webglAvailable)
  const [contextLost, setContextLost] = useState(false)
  const onContextLost = useCallback((event: Event) => {
    event.preventDefault()
    setContextLost(true)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    input.attach(el)
    return () => input.detach(el)
  }, [])

  useEffect(
    () => () => {
      canvasElementRef.current?.removeEventListener('webglcontextlost', onContextLost)
      canvasElementRef.current = null
    },
    [onContextLost],
  )

  if (!webglOk || contextLost) {
    return (
      <div className="webgl-error" ref={containerRef}>
        <div className="webgl-error__inner">
          <h1>This little world needs WebGL.</h1>
          <p>
            {contextLost
              ? 'The graphics context was lost. Reloading the page usually brings it back.'
              : 'Your browser could not start WebGL. Try Chrome or Safari on macOS, and make sure hardware acceleration is switched on.'}
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="game-canvas" ref={containerRef}>
      <Canvas
        shadows="percentage"
        dpr={[1, 1.35]}
        frameloop="never"
        gl={{
          antialias: false,
          powerPreference: 'low-power',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        camera={{ fov: 55, near: 0.15, far: 700, position: [0, 3, 8] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = PALETTES.title.exposure
          gl.setClearColor(new THREE.Color('#12101a'))
          scene.matrixWorldAutoUpdate = true
          canvasElementRef.current = gl.domElement
          gl.domElement.addEventListener('webglcontextlost', onContextLost)
        }}
      >
        <InputPump />
        <RenderStats />
        <QualityManager />
        <ExposureManager />
        <FrameScheduler />
        <Suspense fallback={null}>
          <SceneRouter />
        </Suspense>
        <Post />
      </Canvas>
    </div>
  )
}
