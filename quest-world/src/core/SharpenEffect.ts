import { BlendFunction, Effect } from 'postprocessing';
import * as THREE from 'three';

/**
 * Contrast-adaptive sharpening (a lightweight take on AMD FidelityFX CAS): restores crisp detail
 * after tone mapping and anti-aliasing so foliage, grass and text look HD rather than soft.
 */
export class SharpenEffect extends Effect {
  constructor(amount = 0.45) {
    super(
      'SharpenEffect',
      /* glsl */ `
      uniform float amount;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        vec3 n = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb;
        vec3 s = texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb;
        vec3 e = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb;
        vec3 w = texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb;
        vec3 mn = min(c, min(min(n, s), min(e, w)));
        vec3 mx = max(c, max(max(n, s), max(e, w)));
        // Adaptive weight: sharpen less where local contrast is already high (avoids halos).
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        vec3 wgt = -amp * mix(0.125, 0.2, amount);
        vec3 result = (c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt);
        outputColor = vec4(clamp(result, 0.0, 1.0), inputColor.a);
      }
    `,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['amount', new THREE.Uniform(amount)]]) },
    );
  }
}
