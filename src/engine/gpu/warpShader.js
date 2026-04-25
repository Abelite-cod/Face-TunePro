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

#define POINT_COUNT 64

uniform vec2 u_original[POINT_COUNT];
uniform vec2 u_modified[POINT_COUNT];
uniform float u_strength;

// 🎨 NEW
uniform float u_smooth;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_grayscale;
uniform float u_warmth;

varying vec2 v_uv;

float influence(vec2 uv, vec2 point) {
  float d = distance(uv, point);
  return exp(-d * 25.0);
}

void main() {
  vec2 uv = v_uv;
  uv.y = uv.y; 
  uv.x = uv.x;  

  vec2 offset = vec2(0.0);

  for (int i = 0; i < POINT_COUNT; i++) {
    vec2 o = u_original[i];
    vec2 m = u_modified[i];

    float w = influence(uv, o);
    offset += (m - o) * w * u_strength;
  }

  vec2 warpedUV = uv - offset;
  warpedUV = clamp(warpedUV, 0.0, 1.0);

  // 🎯 STEP 1: SAMPLE
  vec4 color = texture2D(u_texture, warpedUV);

  // =========================
  // 🎨 EFFECTS START HERE
  // =========================

  // 🔥 SMOOTH (skin blur)
  if (u_smooth > 0.0) {
    vec4 blur = (
      texture2D(u_texture, warpedUV + vec2(0.001, 0.0)) +
      texture2D(u_texture, warpedUV + vec2(-0.001, 0.0)) +
      texture2D(u_texture, warpedUV + vec2(0.0, 0.001)) +
      texture2D(u_texture, warpedUV + vec2(0.0, -0.001))
    ) * 0.25;

    color = mix(color, blur, u_smooth * 0.7);
  }

  // ☀️ BRIGHTNESS
  color.rgb += u_brightness * 0.2;

  // 🎚️ CONTRAST
  color.rgb = (color.rgb - 0.5) * (1.0 + u_contrast) + 0.5;

  // ⚫ GRAYSCALE
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(color.rgb, vec3(gray), u_grayscale);

  // 🌡️ WARMTH (warm ↔ cool)
  color.r += u_warmth * 0.1;
  color.b -= u_warmth * 0.1;

  // 🎯 FINAL OUTPUT
  gl_FragColor = color;
}
`