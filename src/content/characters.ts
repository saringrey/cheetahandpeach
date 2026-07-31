/**
 * CHARACTERS & THE CAR — personalization file.
 *
 * Everything here is safe to edit. Colors are hex strings.
 * This file owns appearance, names, and the final car-memory composition.
 *
 * See PERSONALIZE.md for a walkthrough.
 */

export interface GirlAppearance {
  /** Shown in the journal and credits. */
  displayName: string
  skin: string
  hair: string
  /** Slightly darker hair tone used for the under-layer / shadow side. */
  hairShadow: string
  hairStyle: 'long' | 'bob' | 'ponytail' | 'bun'
  /** The cheetah-print shirt: a warm base tone and the darker rosette spots. */
  shirt: string
  shirtSpots: string
  /** Trousers. */
  pants: string
  shoes: string
  /** A tiny accent worn in the hair. Set to null to remove it. */
  hairAccent: string | null
}

export interface PersonAppearance {
  displayName: string
  skin: string
  hair: string
  hairShadow: string
  hairStyle: 'short' | 'medium' | 'curly' | 'buzzed'
  shirt: string
  jacket: string
  /** Set to false to remove the jacket layer entirely. */
  wearsJacket: boolean
  glasses: boolean
  glassesColor: string
  /** A soft silhouette only — not a detailed beard. */
  facialHair: boolean
  facialHairColor: string
}

export interface CarAppearance {
  /** Main paint. */
  body: string
  /** Lower panels / bumper. */
  trim: string
  /** Roof — set equal to `body` for a single-tone car. */
  roof: string
  seats: string
  interior: string
  dashboardLight: string
  /** 'hatch' is rounder and smaller, 'sedan' is longer, 'wagon' has a squarer back. */
  style: 'hatch' | 'sedan' | 'wagon'
  glassTint: string
  /** The small peach-colored object resting on the dashboard. */
  dashCharmColor: string
  /** The little cheetah charm hanging from the mirror. */
  mirrorCharmColor: string
}

export type CarMemoryDriver = 'girl' | 'person'
export type CarMemoryVec3 = [number, number, number]

export interface CarMemorySeatTransform {
  /** Position in car-local space. -X is driver side; +X is passenger side. */
  position: CarMemoryVec3
  /** Y-axis rotation in radians. */
  rotation: number
}

export interface CarMemoryCameraTransform {
  /** Position and target in car-local space. */
  position: CarMemoryVec3
  lookAt: CarMemoryVec3
  fov: number
}

export interface CarMemoryConfig {
  driver: CarMemoryDriver
  seats: {
    girl: CarMemorySeatTransform
    person: CarMemorySeatTransform
  }
  cameras: {
    conversation: CarMemoryCameraTransform
    final: CarMemoryCameraTransform
  }
  mirror: {
    showReflection: boolean
    reflectionText: string
    reverseText: boolean
    showCharm: boolean
  }
  dashboard: {
    showPeach: boolean
    instrumentGlow: boolean
    glowColor: string
  }
  layout: {
    /** Store behind car, road ahead: storeZ < carZ < roadZ. */
    storeZ: number
    carZ: number
    roadZ: number
    /** Car-local forward direction in world space before applying car rotation. */
    carForward: CarMemoryVec3
  }
}

export const GIRL: GirlAppearance = {
  displayName: 'Cheetah',
  skin: '#f2c9a8',
  hair: '#4b2e23',
  hairShadow: '#38211a',
  hairStyle: 'long',
  shirt: '#d8a24a',
  shirtSpots: '#3a2a1c',
  pants: '#43506a',
  shoes: '#5d4a44',
  hairAccent: '#ffd9a0',
}

export const PERSON: PersonAppearance = {
  displayName: 'Peach',
  skin: '#e3b28c',
  hair: '#2c1e18',
  hairShadow: '#1d130f',
  hairStyle: 'short',
  shirt: '#7d95a8',
  jacket: '#3d4a57',
  wearsJacket: true,
  glasses: false,
  glassesColor: '#2a2a2e',
  facialHair: false,
  facialHairColor: '#1d130f',
}

export const CAR: CarAppearance = {
  body: '#eae7e2',
  trim: '#c4c0ba',
  roof: '#eae7e2',
  seats: '#3f3830',
  interior: '#2e2a26',
  dashboardLight: '#ffb877',
  style: 'sedan',
  glassTint: '#1f2a33',
  dashCharmColor: '#ff9e7d',
  mirrorCharmColor: '#e8a13c',
}

/**
 * Final parking-lot memory staging. Positions are intentionally editable,
 * while role and geography stay explicit enough for tests to guard.
 */
export const CAR_MEMORY: CarMemoryConfig = {
  driver: 'girl',
  seats: {
    girl: { position: [-0.42, 0.22, -0.32], rotation: 0 },
    person: { position: [0.42, 0.42, -0.35], rotation: 0 },
  },
  cameras: {
    conversation: {
      // Cheetah's eye line from the left-hand driver's seat, turned gently
      // toward Peach rather than staged from an invisible back-seat camera.
      // The extra handspan of distance and eye target keep Peach's shoulders,
      // the dash, and a seam of night road in the emotional frame.
      position: [-0.56, 1.45, -0.24],
      lookAt: [0.42, 1.46, -0.3],
      fov: 60,
    },
    final: {
      position: [-0.54, 1.45, -0.25],
      lookAt: [0.38, 1.44, -0.18],
      fov: 62,
    },
  },
  mirror: {
    showReflection: true,
    reflectionText: 'JEWEL',
    reverseText: true,
    showCharm: true,
  },
  dashboard: {
    showPeach: true,
    instrumentGlow: true,
    glowColor: CAR.dashboardLight,
  },
  layout: {
    storeZ: -32,
    carZ: -8,
    roadZ: 15,
    carForward: [0, 0, 1],
  },
}

/**
 * The parking lot itself. These details are what make it *your* parking lot.
 */
export const PARKING_LOT = {
  /** Legacy edge-sign field; kept editable for backward compatibility. */
  signText: null as string | null,
  /** Closed storefront sign behind the car. */
  storeSign: 'JEWEL',
  storeSignColor: '#ed1731',
  /** Which parking space the car sits in, counted from the left. 0-7. */
  carSpace: 3,
  /** Restrained warm-white pools against the cool night. */
  lampColor: '#ffd7ad',
  /** Deep late-night sky: no dusk-orange horizon. */
  skyHorizon: '#080e1c',
  skyZenith: '#01030a',
}
