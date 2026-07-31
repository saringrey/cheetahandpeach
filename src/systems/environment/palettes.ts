import * as THREE from 'three'
import type { ChapterId } from '../../types'

/**
 * One palette per region. Every scene pulls its sky, fog, light colors and
 * ground tones from here, which is what keeps the regions distinct but related.
 */
export interface Palette {
  /** Sky dome: horizon → zenith. */
  skyHorizon: string
  skyZenith: string
  /** A warm band just above the horizon, in the sun's direction. */
  skyGlow: string
  fog: string
  fogNear: number
  fogFar: number
  sun: string
  sunIntensity: number
  /** Direction the key light comes from. Normalized on use. */
  sunDir: [number, number, number]
  /** Hemisphere sky/ground bounce. */
  ambientSky: string
  ambientGround: string
  ambientIntensity: number
  /** Base terrain tones. */
  groundA: string
  groundB: string
  /** Path / trail color. */
  path: string
  foliageA: string
  foliageB: string
  /** Emissive accents: lanterns, fireflies, windows. */
  accentWarm: string
  accentCool: string
  /** Post-processing. */
  bloomIntensity: number
  saturation: number
  /** ACES exposure for this chapter. Night scenes need different lift than interiors. */
  exposure: number
  /** Edge falloff. Kept per chapter so darkness frames detail instead of erasing it. */
  vignette: number
  /** Subtle final grade; restrained so emissive story beats keep their color. */
  brightness?: number
  contrast?: number
}

export const PALETTES: Record<ChapterId, Palette> = {
  // Moonlit night: a cool key light so the land still reads, with all the warmth
  // coming from the cottage windows and the lanterns.
  // The menu is the darkest thing in the game on purpose: the constellations
  // over the title have to be the brightest points on screen, and they only
  // read that way if the world behind them is nearly out. Ground and foliage
  // are pulled down much harder than the sky, so the horizon still separates.
  title: {
    // The horizon stays lifted even though everything under it is crushed: a
    // visible skyline is what keeps "dark" from becoming "off". The hills read as
    // silhouette against it, which is more atmospheric than any amount of fill
    // light on the meadow would be.
    skyHorizon: '#17182c',
    skyZenith: '#02040b',
    skyGlow: '#24304b',
    fog: '#090c16',
    fogNear: 4,
    fogFar: 48,
    sun: '#9bb8e8',
    sunIntensity: 0.34,
    sunDir: [-0.42, 0.62, 0.5],
    ambientSky: '#1d2947',
    ambientGround: '#0a0b10',
    ambientIntensity: 0.2,
    groundA: '#1a211b',
    groundB: '#111713',
    path: '#332e2a',
    foliageA: '#162318',
    foliageB: '#0d170f',
    accentWarm: '#ffb877',
    accentCool: '#8fb0e0',
    bloomIntensity: 1.2,
    saturation: -0.12,
    exposure: 0.6,
    vignette: 0.86,
    brightness: -0.08,
    contrast: 0.24,
  },

  // The cottage is night, not amber daylight. A narrow silver key describes
  // forms while the lamp and windows remain the only warm values.
  cottage: {
    skyHorizon: '#171b30',
    skyZenith: '#03050e',
    skyGlow: '#283757',
    fog: '#101625',
    fogNear: 5,
    fogFar: 32,
    sun: '#a3bde8',
    sunIntensity: 0.38,
    sunDir: [-0.55, 0.74, 0.4],
    ambientSky: '#26365e',
    ambientGround: '#101217',
    ambientIntensity: 0.18,
    groundA: '#293427',
    groundB: '#1c251c',
    path: '#5d5147',
    foliageA: '#233424',
    foliageB: '#162518',
    accentWarm: '#ffbe88',
    accentCool: '#a9d8ea',
    bloomIntensity: 1.15,
    saturation: -0.12,
    exposure: 0.56,
    vignette: 0.68,
    brightness: -0.075,
    contrast: 0.22,
  },

  // Moonlit village stone with isolated lantern warmth.
  town: {
    skyHorizon: '#1b1b32',
    skyZenith: '#040611',
    skyGlow: '#33263f',
    fog: '#121422',
    fogNear: 5,
    fogFar: 34,
    sun: '#9db3dd',
    sunIntensity: 0.38,
    sunDir: [-0.55, 0.18, 0.72],
    ambientSky: '#2b345a',
    ambientGround: '#15131a',
    ambientIntensity: 0.23,
    groundA: '#343c2e',
    groundB: '#242c23',
    path: '#665746',
    foliageA: '#30442e',
    foliageB: '#203220',
    accentWarm: '#ffab5e',
    accentCool: '#6fb3ae',
    bloomIntensity: 1.25,
    saturation: -0.11,
    exposure: 0.65,
    vignette: 0.68,
    brightness: -0.065,
    contrast: 0.21,
  },

  // Wet black-green woodland, silver canopy gaps, firefly gold.
  forest: {
    skyHorizon: '#101827',
    skyZenith: '#03090d',
    skyGlow: '#1c3240',
    fog: '#081315',
    fogNear: 3,
    fogFar: 22,
    sun: '#8facd6',
    sunIntensity: 0.34,
    sunDir: [-0.42, 0.62, 0.66],
    ambientSky: '#1c3943',
    ambientGround: '#0b110d',
    ambientIntensity: 0.22,
    groundA: '#1b2a1a',
    groundB: '#111d12',
    path: '#4f4634',
    foliageA: '#183119',
    foliageB: '#0f2313',
    accentWarm: '#ffc46b',
    accentCool: '#63c9c0',
    bloomIntensity: 1.25,
    saturation: -0.08,
    exposure: 0.67,
    vignette: 0.62,
    brightness: -0.055,
    contrast: 0.2,
  },

  // Cold river moonlight with warm lamps held as accents.
  crossing: {
    skyHorizon: '#17192f',
    skyZenith: '#040613',
    skyGlow: '#25354c',
    fog: '#11172b',
    fogNear: 5,
    fogFar: 34,
    sun: '#94b5e2',
    sunIntensity: 0.34,
    sunDir: [0.72, 0.24, -0.55],
    ambientSky: '#28345f',
    ambientGround: '#111a22',
    ambientIntensity: 0.23,
    groundA: '#21362d',
    groundB: '#16271f',
    path: '#584e40',
    foliageA: '#294b39',
    foliageB: '#193529',
    accentWarm: '#ffb27a',
    accentCool: '#8fd0d8',
    bloomIntensity: 1.2,
    saturation: -0.1,
    exposure: 0.66,
    vignette: 0.64,
    brightness: -0.06,
    contrast: 0.21,
  },

  // Violet-black high country with a hard silver moon key.
  mountain: {
    skyHorizon: '#15152c',
    skyZenith: '#030513',
    skyGlow: '#2b2843',
    fog: '#101224',
    // Pushed out from 52. The massif is one huge unlit mass and a near fog plane
    // swallowed the whole silhouette, so the mountain read as a black hole rather
    // than as rock.
    fogNear: 9,
    fogFar: 64,
    sun: '#9eb4e5',
    sunIntensity: 0.4,
    sunDir: [0.78, 0.14, -0.6],
    // Moonlight has to do all the modelling up here: there are no practicals on a
    // mountainside and nothing warm to fall back on, so the ambient carries the
    // rock. Raised from 0.32 — below about 0.45 the cliffs stop being shapes.
    ambientSky: '#29345f',
    ambientGround: '#15141d',
    ambientIntensity: 0.3,
    groundA: '#30342d',
    groundB: '#222720',
    path: '#696359',
    foliageA: '#30442f',
    foliageB: '#213323',
    accentWarm: '#ffb27a',
    accentCool: '#9fb0e0',
    bloomIntensity: 1.2,
    saturation: -0.1,
    exposure: 0.68,
    vignette: 0.66,
    brightness: -0.055,
    contrast: 0.2,
  },

  // Desaturating fantasy → roadside green, asphalt, streetlight amber, dusk blue.
  transition: {
    skyHorizon: '#101426',
    skyZenith: '#03050f',
    skyGlow: '#222a42',
    fog: '#0e1423',
    fogNear: 5,
    fogFar: 34,
    sun: '#93abd5',
    sunIntensity: 0.3,
    sunDir: [0.6, 0.5, -0.62],
    ambientSky: '#242e50',
    ambientGround: '#12151a',
    ambientIntensity: 0.21,
    groundA: '#2f382c',
    groundB: '#222a22',
    path: '#494b4b',
    foliageA: '#293b29',
    foliageB: '#1b2c1d',
    accentWarm: '#ffb15e',
    accentCool: '#8f9cbb',
    bloomIntensity: 1.18,
    saturation: -0.13,
    exposure: 0.67,
    vignette: 0.62,
    brightness: -0.06,
    contrast: 0.21,
  },

  // Warm sunset orange, muted asphalt, sodium amber, cool windshield, soft interior light.
  parkingLot: {
    skyHorizon: '#101322',
    skyZenith: '#03050d',
    skyGlow: '#24263a',
    fog: '#0d1220',
    fogNear: 6,
    fogFar: 40,
    sun: '#91a9d2',
    sunIntensity: 0.24,
    sunDir: [0.55, 0.55, -0.62],
    ambientSky: '#222b49',
    ambientGround: '#101216',
    ambientIntensity: 0.2,
    groundA: '#2d3036',
    groundB: '#22252a',
    path: '#34363a',
    foliageA: '#293626',
    foliageB: '#1c281b',
    accentWarm: '#ffb15e',
    accentCool: '#93a6c4',
    bloomIntensity: 1.2,
    saturation: -0.14,
    exposure: 0.68,
    vignette: 0.62,
    brightness: -0.055,
    contrast: 0.2,
  },

  ending: {
    skyHorizon: '#0d101c',
    skyZenith: '#02030a',
    skyGlow: '#1d2234',
    fog: '#0a0f1a',
    fogNear: 5,
    fogFar: 34,
    sun: '#8fa7d0',
    sunIntensity: 0.2,
    sunDir: [0.55, 0.5, -0.66],
    ambientSky: '#1f2844',
    ambientGround: '#0e1014',
    ambientIntensity: 0.18,
    groundA: '#272a2f',
    groundB: '#1e2125',
    path: '#303237',
    foliageA: '#253123',
    foliageB: '#192319',
    accentWarm: '#ffb977',
    accentCool: '#8b9dbb',
    bloomIntensity: 1.22,
    saturation: -0.14,
    exposure: 0.64,
    vignette: 0.72,
    brightness: -0.07,
    contrast: 0.22,
  },
}

const cache = new Map<string, THREE.Color>()
/** Colors are looked up constantly; cache the parse. */
export function color(hex: string): THREE.Color {
  let c = cache.get(hex)
  if (!c) {
    c = new THREE.Color(hex)
    cache.set(hex, c)
  }
  return c
}

/** Blend two palettes — used by the fantasy→reality transition. */
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const ca = new THREE.Color()
  const cb = new THREE.Color()
  const mixHex = (x: string, y: string) => {
    ca.set(x)
    cb.set(y)
    return '#' + ca.lerp(cb, t).getHexString()
  }
  const mixNum = (x: number, y: number) => x + (y - x) * t
  return {
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon),
    skyZenith: mixHex(a.skyZenith, b.skyZenith),
    skyGlow: mixHex(a.skyGlow, b.skyGlow),
    fog: mixHex(a.fog, b.fog),
    fogNear: mixNum(a.fogNear, b.fogNear),
    fogFar: mixNum(a.fogFar, b.fogFar),
    sun: mixHex(a.sun, b.sun),
    sunIntensity: mixNum(a.sunIntensity, b.sunIntensity),
    sunDir: [
      mixNum(a.sunDir[0], b.sunDir[0]),
      mixNum(a.sunDir[1], b.sunDir[1]),
      mixNum(a.sunDir[2], b.sunDir[2]),
    ],
    ambientSky: mixHex(a.ambientSky, b.ambientSky),
    ambientGround: mixHex(a.ambientGround, b.ambientGround),
    ambientIntensity: mixNum(a.ambientIntensity, b.ambientIntensity),
    groundA: mixHex(a.groundA, b.groundA),
    groundB: mixHex(a.groundB, b.groundB),
    path: mixHex(a.path, b.path),
    foliageA: mixHex(a.foliageA, b.foliageA),
    foliageB: mixHex(a.foliageB, b.foliageB),
    accentWarm: mixHex(a.accentWarm, b.accentWarm),
    accentCool: mixHex(a.accentCool, b.accentCool),
    bloomIntensity: mixNum(a.bloomIntensity, b.bloomIntensity),
    saturation: mixNum(a.saturation, b.saturation),
    exposure: mixNum(a.exposure, b.exposure),
    vignette: mixNum(a.vignette, b.vignette),
    brightness: mixNum(a.brightness ?? -0.035, b.brightness ?? -0.035),
    contrast: mixNum(a.contrast ?? 0.14, b.contrast ?? 0.14),
  }
}
