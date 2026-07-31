/**
 * CONSTELLATIONS — the three shapes she draws at the overlook.
 *
 * `points` are 2D coordinates in a -1..1 box, projected onto the sky dome.
 * They are joined in array order. Editing the points changes the drawn shape.
 * `message` appears once the last line is drawn.
 */

export interface Constellation {
  id: string
  name: string
  message: string
  /** Where on the sky it sits: azimuth in degrees (0 = straight ahead), elevation in degrees. */
  azimuth: number
  elevation: number
  /** How wide the shape is on the dome, in degrees. */
  spread: number
  points: [number, number][]
}

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'cheetah',
    name: 'The Cheetah',
    message: 'You gave movement a direction.',
    azimuth: -26,
    elevation: 30,
    spread: 20,
    // nose → head → back → haunch → tail, with two legs dropping down
    points: [
      [-0.95, 0.15],
      [-0.62, 0.3],
      [-0.2, 0.42],
      [0.28, 0.36],
      [0.66, 0.5],
      [0.95, 0.78],
      [0.66, 0.5],
      [0.34, 0.0],
      [0.42, -0.55],
      [0.34, 0.0],
      [-0.34, -0.05],
      [-0.44, -0.62],
    ],
  },
  {
    id: 'peach',
    name: 'The Peach',
    message: 'You made softness feel like strength.',
    azimuth: 8,
    elevation: 44,
    spread: 15,
    // round body with a cleft at the top and a leaf
    points: [
      [0, 0.72],
      [-0.5, 0.6],
      [-0.82, 0.12],
      [-0.6, -0.5],
      [0, -0.82],
      [0.6, -0.5],
      [0.82, 0.12],
      [0.5, 0.6],
      [0, 0.72],
      [0.16, 0.98],
      [0.62, 0.92],
    ],
  },
  {
    id: 'road-home',
    name: 'The Road Home',
    message: 'Every road I kept became a road back to you.',
    azimuth: 34,
    elevation: 26,
    spread: 22,
    // a curving road narrowing into the distance
    points: [
      [-0.95, -0.75],
      [-0.55, -0.42],
      [-0.2, -0.05],
      [0.05, 0.3],
      [0.18, 0.62],
      [0.24, 0.9],
      [-0.62, -0.9],
      [-0.2, -0.6],
      [0.14, -0.22],
      [0.34, 0.16],
      [0.44, 0.55],
      [0.48, 0.88],
    ],
  },
]

/** Seconds of holding E to connect one star to the next. */
export const CONNECT_HOLD_SECONDS = 0.55
