import { createProgram } from "./shaderUtils"
import { vertexShader, fragmentShader } from "./warpShader"

let program = null
let positionBuffer = null
let texture = null

let uTextureLoc = null
let uStrengthLoc = null
let uOriginalLoc = null
let uModifiedLoc = null

let uSmoothLoc = null
let uBrightnessLoc = null
let uContrastLoc = null
let uGrayscaleLoc = null
let uWarmthLoc = null

export function renderFrame(gl, media, landmarks, modified, controls = {}) {

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  if (!program) {
    
    program = createProgram(gl, vertexShader, fragmentShader)

    positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW)

    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

    // uniforms
    uTextureLoc = gl.getUniformLocation(program, "u_texture")
    uStrengthLoc = gl.getUniformLocation(program, "u_strength")
    uOriginalLoc = gl.getUniformLocation(program, "u_original")
    uModifiedLoc = gl.getUniformLocation(program, "u_modified")

    uSmoothLoc = gl.getUniformLocation(program, "u_smooth")
    uBrightnessLoc = gl.getUniformLocation(program, "u_brightness")
    uContrastLoc = gl.getUniformLocation(program, "u_contrast")
    uGrayscaleLoc = gl.getUniformLocation(program, "u_grayscale")
    uWarmthLoc = gl.getUniformLocation(program, "u_warmth")
  }

  if (!media) return

  const isVideo = media.tagName === "VIDEO"
  if (isVideo && media.readyState < 2) return

  
  gl.useProgram(program)

  const strength = modified ? 1.2 : 0.0
  gl.uniform1f(uStrengthLoc, strength)

  // filters
  gl.uniform1f(uSmoothLoc, controls.smooth || 0)
  gl.uniform1f(uBrightnessLoc, controls.brightness || 0)
  gl.uniform1f(uContrastLoc, controls.contrast || 0)
  gl.uniform1f(uGrayscaleLoc, controls.grayscale || 0)
  gl.uniform1f(uWarmthLoc, controls.warmth || 0)

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    media
  )

  gl.uniform1i(uTextureLoc, 0)

  if (landmarks && modified) {
    
    const indices = [

      // EYES
      33,133,160,159,158,144,145,153,
      362,263,387,386,385,373,374,380,

      // NOSE
      1,2,98,327,168,197,195,5,4,45,275,

      // LIPS
      61,146,91,181,84,17,314,405,321,375,
      291,308,324,318,402,317,14,87,

      // JAW
      234,93,132,58,172,136,
      150,149,176,148,152,
      377,400,378,379,365,397,

      // EYEBROWS
      // EYEBROWS (BOOSTED FOR VISIBILITY)
            // EYEBROWS
      70,63,105,66,107,55,65,52,53,46,193,189,
      336,296,334,293,300,285,295,282,283,276,417,413,
    ]

    const pick = (points) => {
      const arr = []

      for (let i of indices) {
        const p = points[i]

        const w = media.videoWidth || media.naturalWidth
        const h = media.videoHeight || media.naturalHeight

        arr.push(1.0 - (p.x / w))
        arr.push(1.0 - (p.y / h))
      }

      return new Float32Array(arr)
    }

    gl.uniform2fv(uOriginalLoc, pick(landmarks))
    gl.uniform2fv(uModifiedLoc, pick(modified))

  

  }

  const posLoc = gl.getAttribLocation(program, "a_position")

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(posLoc)
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

}