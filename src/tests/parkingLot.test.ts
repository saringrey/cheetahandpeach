/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAR_MEMORY, PARKING_LOT } from '../content/characters'
import { APPROACH_SONG, PEACHY_GREETING } from '../content/finalMessage'

const readSource = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('final car memory staging', () => {
  it('puts Cheetah at the driver side and Peach at the passenger side', () => {
    expect(CAR_MEMORY.driver).toBe('girl')
    expect(CAR_MEMORY.seats.girl.position[0]).toBeLessThan(0)
    expect(CAR_MEMORY.seats.person.position[0]).toBeGreaterThan(0)
  })

  it('keeps the closed JEWEL store behind a road-facing car', () => {
    expect(PARKING_LOT.storeSign).toBe('JEWEL')
    expect(CAR_MEMORY.layout.storeZ).toBeLessThan(CAR_MEMORY.layout.carZ)
    expect(CAR_MEMORY.layout.carZ).toBeLessThan(CAR_MEMORY.layout.roadZ)
    expect(CAR_MEMORY.layout.carForward).toEqual([0, 0, 1])
  })

  it('uses the approved player-paced conversation', () => {
    expect(PEACHY_GREETING).toEqual([
      'I’m sorry it took me so long.',
      'I remember how easy it was to stay.',
      'We kept talking while the whole road moved past us.',
      'Nothing extraordinary was happening.',
    ])
    expect(PEACHY_GREETING[0]).toBe('I’m sorry it took me so long.')
    expect(PEACHY_GREETING.join(' ')).not.toContain('waiting for you')
  })

  it('uses Cheetah eye-line framing from the left-hand driver seat', () => {
    expect(CAR_MEMORY.cameras.conversation.position[0]).toBeLessThan(0)
    expect(CAR_MEMORY.cameras.conversation.lookAt[0]).toBeGreaterThan(0)
    expect(CAR_MEMORY.cameras.conversation.fov).toBeLessThanOrEqual(62)
  })

  it('lets traffic and silence happen before Peach speaks', () => {
    const parking = readSource('../scenes/parkingLot/ParkingLotScene.tsx')

    expect(parking).toContain('export const OPENING_SILENCE_MS = 6_200')
    expect(parking).toContain('trafficPasses <= openingPassStart.current')
    expect(parking).not.toContain('<Girl ')
  })

  it('preloads APPROACH during the descent and starts it at parking-lot spawn', () => {
    const audio = readSource('../systems/audio/audio.ts')
    const transition = readSource('../scenes/transition/TransitionScene.tsx')
    const parking = readSource('../scenes/parkingLot/ParkingLotScene.tsx')
    const sceneEntry = parking.indexOf("audio.playOptional(APPROACH_SONG, 'music'")
    const delayedIntro = parking.indexOf('useSceneIntro(() =>')
    const noticed = parking.slice(
      parking.indexOf('const onNoticed'),
      parking.indexOf('const onGetIn'),
    )

    expect(APPROACH_SONG).toBe('/audio/music/approach.mp3')
    expect(transition).toContain('audio.preloadOptional(APPROACH_SONG)')
    expect(sceneEntry).toBeGreaterThan(0)
    expect(sceneEntry).toBeLessThan(delayedIntro)
    expect(noticed).not.toContain('playOptional')
    expect(audio).toContain('private optionalInFlight = new Map<string, Promise<boolean>>()')
    expect(audio).toContain('generation !== this.playbackGeneration')
    expect(audio).toContain('optionalStartCounts')
  })

  it('carries the quiet river-bench mug pair into the windshield callback', () => {
    const forest = readSource('../scenes/forest/ForestScene.tsx')
    const parking = readSource('../scenes/parkingLot/ParkingLotScene.tsx')

    expect(forest).toContain('<MugPair')
    expect(parking).toContain("setStage('afterglow')")
    expect(parking).toContain("showDashboardMugs={stage === 'afterglow'}")
    expect(parking).toContain('trafficPasses <= callbackPassStart.current')
  })
})
