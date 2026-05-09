export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0, 1);
}
`

export const fragmentShader = `
precision mediump float;

uniform sampler2D u_texture;

#define POINT_COUNT 86

uniform vec2 u_original[POINT_COUNT];
uniform vec2 u_modified[POINT_COUNT];
uniform float u_strength;

// 🎨 Filters
uniform float u_smooth;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_grayscale;
uniform float u_warmth;

varying vec2 v_uv;

// Tight local influence - prevents warp from bleeding across the face.
// Higher falloff constant = tighter radius of effect.
float influence(vec2 uv, vec2 point) {
  float d = distance(uv, point);
  // 55.0 gives a tight local warp (~1/4 face width radius)
  return exp(-d * 55.0);
}

void main() {
  vec2 uv = v_uv;

  vec2 totalOffset = vec2(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < POINT_COUNT; i++) {
    vec2 o = u_original[i];
    vec2 m = u_modified[i];

    float w = influence(uv, o);
    totalOffset += (m - o) * w;
    totalWeight += w;
  }

  // Normalize by total weight so overlapping regions don't over-warp
  vec2 offset = (totalWeight > 0.001)
    ? (totalOffset / totalWeight) * u_strength
    : vec2(0.0);

  vec2 warpedUV = clamp(uv - offset, 0.0, 1.0);

  // 🎯 STEP 1: SAMPLE
  vec4 color = texture2D(u_texture, warpedUV);

  // =========================
  // 🎨 EFFECTS
  // =========================

  // 🔥 SMOOTH (skin blur) - multi-tap for better quality
  if (u_smooth > 0.0) {
    float r = 0.0015 * u_smooth;
    vec4 blur =
      texture2D(u_texture, warpedUV + vec2( r,  0.0)) +
      texture2D(u_texture, warpedUV + vec2(-r,  0.0)) +
      texture2D(u_texture, warpedUV + vec2( 0.0,  r)) +
      texture2D(u_texture, warpedUV + vec2( 0.0, -r)) +
      texture2D(u_texture, warpedUV + vec2( r,  r)) +
      texture2D(u_texture, warpedUV + vec2(-r,  r)) +
      texture2D(u_texture, warpedUV + vec2( r, -r)) +
      texture2D(u_texture, warpedUV + vec2(-r, -r));
    blur *= 0.125;
    color = mix(color, blur, clamp(u_smooth * 0.75, 0.0, 0.9));
  }

  // ☀️ BRIGHTNESS
  color.rgb += u_brightness * 0.2;

  // 🎚️ CONTRAST
  color.rgb = (color.rgb - 0.5) * (1.0 + u_contrast * 0.5) + 0.5;

  // ⚫ GRAYSCALE
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(color.rgb, vec3(gray), u_grayscale);

  // 🌡️ WARMTH (warm ↔ cool)
  color.r += u_warmth * 0.08;
  color.b -= u_warmth * 0.08;

  // 🎯 FINAL OUTPUT
  gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`
