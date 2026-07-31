import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Uniform } from 'three'
import { BlendFunction, Effect } from 'postprocessing'

const fragmentShader = /* glsl */ `
  uniform float uBrightness;
  uniform float uContrast;

  void mainImage(
    const in vec4 inputColor,
    const in vec2 uv,
    out vec4 outputColor
  ) {
    vec3 source = max(inputColor.rgb, vec3(0.0));

    // A restrained film S-curve. The previous sub-1.0 gamma lifted every
    // midtone, which made fog, pale walls, and moonlit ground converge toward
    // the same washed value. This keeps a very small shadow lift, then gives
    // darks and lights distinct separation without clipping either end.
    float gamma = 0.97;
    float gain = clamp(0.91 + uBrightness, 0.78, 0.91);
    vec3 base = clamp(pow(source, vec3(gamma)) * gain, 0.0, 1.0);
    vec3 sCurve = base * base * (3.0 - 2.0 * base);
    float contrastMix = clamp(uContrast * 0.8, 0.0, 0.32);
    vec3 graded = mix(base, sCurve, contrastMix);

    // A soft shoulder contains practicals and fog highlights before bloom.
    // It is deliberately gentle so the moon and story lights still lead.
    graded /= 1.0 + graded * (0.045 + uContrast * 0.08);

    // Cool only the shadows. Practical lamps retain their warm story color,
    // while moonlit surfaces share the same blue-silver environmental grade.
    float luminance = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = 1.0 - smoothstep(0.07, 0.5, luminance);
    vec3 splitTone = mix(
      vec3(1.018, 0.995, 0.972),
      vec3(0.94, 0.995, 1.06),
      shadowMask
    );
    graded = max(graded * splitTone, vec3(0.0));

    // Vibrance, not saturation: only the muted values are nudged toward their
    // own hue, so lanterns and windows already at full color stay untouched
    // while the moonlit midfield stops drifting toward grey.
    float chroma = max(graded.r, max(graded.g, graded.b)) - min(graded.r, min(graded.g, graded.b));
    float vib = 0.14 * (1.0 - smoothstep(0.0, 0.4, chroma));
    graded = clamp(mix(vec3(luminance), graded, 1.0 + vib), 0.0, 1.0);

    // Fine, luma-weighted film grain. Night fog is a field of near-flat dark
    // gradients, which 8-bit panels band visibly; a whisper of animated grain
    // dissolves the banding and gives the black air a film texture.
    float grain = fract(sin(dot(uv, vec2(12.9898, 78.233)) * 4375.85 + time * 57.0) * 43758.5453);
    graded += (grain - 0.5) * 0.016 * (1.0 - smoothstep(0.0, 0.6, luminance));

    outputColor = vec4(max(graded, vec3(0.0)), inputColor.a);
  }
`

class MoonlitGradeEffect extends Effect {
  constructor() {
    super('MoonlitGradeEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uBrightness', new Uniform(-0.05)],
        ['uContrast', new Uniform(0.2)],
      ]),
    })
  }

  setGrade(brightness: number, contrast: number) {
    this.uniforms.get('uBrightness')!.value = brightness
    this.uniforms.get('uContrast')!.value = contrast
  }
}

interface MoonlitGradeProps {
  brightness: number
  contrast: number
}

/**
 * One fused postprocessing effect. It replaces the old linear
 * BrightnessContrast stage, so the mood pass does not increase draw calls.
 */
export function MoonlitGrade({ brightness, contrast }: MoonlitGradeProps) {
  const effect = useMemo(() => new MoonlitGradeEffect(), [])

  useLayoutEffect(() => {
    effect.setGrade(brightness, contrast)
  }, [brightness, contrast, effect])

  useEffect(() => () => effect.dispose(), [effect])

  return <primitive object={effect} dispose={null} />
}
