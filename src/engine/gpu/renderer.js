import { createProgram } from "./shaderUtils"
import { vertexShader, fragmentShader } from "./warpShader"

// Per-context cache so export canvas gets its own program
const ctxCache = new WeakMap()

function getCtxState(gl) {
  if (!ctxCache.has(gl)) {
    ctxCache.set(gl, {
      program:       null,
      positionBuffer: null,
      texture:       null,
      uTextureLoc:   null,
      uStrengthLoc:  null,
      uOriginalLoc:  null,
      uModifiedLoc:  null,
      uSmoothLoc:    null,
      uBrightnessLoc: null,
      uContrastLoc:  null,
      uGrayscaleLoc: null,
      uWarmthLoc:    null,
    })
  }
  return ctxCache.get(gl)
}

export function renderFrame(gl, media, landmarks, modified, controls = {}) {

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

  const s = getCtxState(gl)

  if (!s.program) {
    s.program = createProgram(gl, vertexShader, fragmentShader)

    s.positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, s.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW)

    s.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, s.texture)

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    s.uTextureLoc    = gl.getUniformLocation(s.program, "u_texture")
    s.uStrengthLoc   = gl.getUniformLocation(s.program, "u_strength")
    s.uOriginalLoc   = gl.getUniformLocation(s.program, "u_original")
    s.uModifiedLoc   = gl.getUniformLocation(s.program, "u_modified")
    s.uSmoothLoc     = gl.getUniformLocation(s.program, "u_smooth")
    s.uBrightnessLoc = gl.getUniformLocation(s.program, "u_brightness")
    s.uContrastLoc   = gl.getUniformLocation(s.program, "u_contrast")
    s.uGrayscaleLoc  = gl.getUniformLocation(s.program, "u_grayscale")
    s.uWarmthLoc     = gl.getUniformLocation(s.program, "u_warmth")
  }

  if (!media) return

  const isVideo = media.tagName === "VIDEO"
  if (isVideo && media.readyState < 2) return

  // Clear only when media is ready — prevents black flash during export seeks
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.useProgram(s.program)

  const strength = modified ? 1.0 : 0.0
  gl.uniform1f(s.uStrengthLoc, strength)

  // filters
  gl.uniform1f(s.uSmoothLoc,     controls.smooth     || 0)
  gl.uniform1f(s.uBrightnessLoc, controls.brightness || 0)
  gl.uniform1f(s.uContrastLoc,   controls.contrast   || 0)
  gl.uniform1f(s.uGrayscaleLoc,  controls.grayscale  || 0)
  gl.uniform1f(s.uWarmthLoc,     controls.warmth     || 0)

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, s.texture)

  try {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      media
    )
  } catch (e) {
    console.warn("⚠️ texImage2D failed:", e)
    return
  }

  gl.uniform1i(s.uTextureLoc, 0)

  if (landmarks && modified) {
    // POINT_COUNT = 86 — must match #define in warpShader.js
    const indices = [

      // EYES (16)
      33, 133, 160, 159, 158, 144, 145, 153,
      362, 263, 387, 386, 385, 373, 374, 380,

      // NOSE (11)
      1, 2, 98, 327, 168, 197, 195, 5, 4, 45, 275,

      // LIPS (18)
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
      291, 308, 324, 318, 402, 317, 14, 87,

      // JAW (17)
      234, 93, 132, 58, 172, 136,
      150, 149, 176, 148, 152,
      377, 400, 378, 379, 365, 397,

      // EYEBROWS (24)
      70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 193, 189,
      336, 296, 334, 293, 300, 285, 295, 282, 283, 276, 417, 413,
    ]
    // Total: 16+11+18+17+24 = 86
    const w = media.videoWidth  || media.naturalWidth
    const h = media.videoHeight || media.naturalHeight

    const pick = (points) => {
      const arr = []

      for (let i of indices) {
        const p = points[i]
        if (!p) {
          arr.push(0, 0)
          continue
        }

        // Convert pixel coords → UV [0,1]
        // UNPACK_FLIP_Y_WEBGL is true, so Y is already flipped in texture.
        // UV origin is bottom-left in GL, but v_uv = (pos+1)*0.5 maps
        // clip-space to [0,1] with (0,0) at bottom-left.
        // Landmark (0,0) = top-left of image → UV (0, 1) after flip.
        const u = p.x / w
        const v = 1.0 - (p.y / h)   // flip Y to match GL UV convention

        arr.push(u, v)
      }

      return new Float32Array(arr)
    }

    gl.uniform2fv(s.uOriginalLoc, pick(landmarks))
    gl.uniform2fv(s.uModifiedLoc, pick(modified))
  }

  const posLoc = gl.getAttribLocation(s.program, "a_position")

  gl.bindBuffer(gl.ARRAY_BUFFER, s.positionBuffer)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}
