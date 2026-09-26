export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualitySettings {
  /** Minimum render scale — on 1× displays "high" supersamples for an HD look. */
  minPixelRatio: number;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  grassDensity: number;
  grassDistance: number;
  grassField: number;
  bloom: boolean;
  smaa: boolean;
  sharpen: boolean;
  ao: boolean;
  pixelHalfAO: boolean;
}

// Note: composer MSAA (multisampling) is deliberately avoided — it produced blank frames on some
// ANGLE/D3D11 GPUs. SMAA + sharpening gives reliable, crisp anti-aliasing everywhere.
export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { minPixelRatio: 1.1, maxPixelRatio: 2, shadows: true, shadowMap: 4096, grassDensity: 1, grassDistance: 90, grassField: 1, bloom: true, smaa: true, sharpen: true, ao: true, pixelHalfAO: true },
  medium: { minPixelRatio: 1, maxPixelRatio: 1.5, shadows: true, shadowMap: 2048, grassDensity: 0.88, grassDistance: 75, grassField: 0.85, bloom: true, smaa: true, sharpen: true, ao: true, pixelHalfAO: true },
  low: { minPixelRatio: 0.85, maxPixelRatio: 1, shadows: false, shadowMap: 1024, grassDensity: 0.7, grassDistance: 56, grassField: 0.6, bloom: false, smaa: false, sharpen: false, ao: false, pixelHalfAO: true },
};

/** GPU renderer string (e.g. "ANGLE (AMD Radeon ...)"), or '' when the browser hides it. */
function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

export function detectQuality(): QualityLevel {
  // After the GPU dropped the WebGL context in this tab, come back on the lightest settings.
  try {
    if (sessionStorage.getItem('hitesh-safe-mode') === '1') return 'low';
  } catch {
    /* storage unavailable */
  }
  // Software rasterisers cannot run the full world smoothly.
  if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(gpuName().toLowerCase())) return 'low';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2) return 'low';
  if (coarse && small) return cores >= 8 && memory >= 6 ? 'medium' : 'low';
  if (cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}
