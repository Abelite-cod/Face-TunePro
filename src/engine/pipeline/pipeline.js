import { getLandmarks } from "../vision/facemesh"
import { deform } from "../geometry/deform"
import { renderFrame } from "../gpu/renderer"

// Smoothing state — reset when media changes
let prevLandmarks     = null
let prevNoseLandmarks = null
let lastDetectTime    = 0

// Nose landmark indices — must match applyNose in deform.js
const NOSE_INDICES = new Set([1, 2, 5, 4, 19, 94, 45, 275, 98, 327, 168, 197, 195, 6])

/**
 * General temporal smoothing for all landmarks.
 * alpha=0.75 — good balance of stability vs responsiveness.
 */
function smoothLandmarks(current) {
  if (!prevLandmarks || prevLandmarks.length !== current.length) {
    prevLandmarks = current
    return current
  }

  const alpha = 0.75

  const smoothed = current.map((p, i) => ({
    x: prevLandmarks[i].x * alpha + p.x * (1 - alpha),
    y: prevLandmarks[i].y * alpha + p.y * (1 - alpha)
  }))

  prevLandmarks = smoothed
  return smoothed
}

/**
 * Extra smoothing applied ONLY to nose landmarks.
 * The nose controls are now very sensitive (high multipliers), so even
 * 1-2px jitter in the nose anchor causes visible oscillation.
 * alpha=0.92 blends new detections in over ~12 frames — invisible transition.
 */
function smoothNoseLandmarks(current) {
  if (!prevNoseLandmarks || prevNoseLandmarks.length !== current.length) {
    prevNoseLandmarks = current.map(p => ({ x: p.x, y: p.y }))
    return current
  }

  const alpha  = 0.92
  const result = current.map((p, i) => {
    if (!NOSE_INDICES.has(i)) return p
    return {
      x: prevNoseLandmarks[i].x * alpha + p.x * (1 - alpha),
      y: prevNoseLandmarks[i].y * alpha + p.y * (1 - alpha)
    }
  })

  for (let i of NOSE_INDICES) {
    prevNoseLandmarks[i] = { x: result[i].x, y: result[i].y }
  }

  return result
}

export function runPipeline(media, canvas, state, comparingRef = null) {
  let lastSize = { w: 0, h: 0 }
  let rafId    = null

  const gl = canvas.getContext("webgl", {
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  })

  if (!gl) {
    console.error("❌ WebGL not supported")
    return () => {}
  }

  function resizeCanvasToMedia(media) {
    const w = media.videoWidth  || media.naturalWidth
    const h = media.videoHeight || media.naturalHeight

    if (!w || !h) return
    if (w === lastSize.w && h === lastSize.h) return

    lastSize = { w, h }
    canvas.width  = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
  }

  let running = true

  function stop() {
    running = false

    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    // Reset globals
    prevLandmarks        = null
    prevNoseLandmarks    = null
    window.__landmarks   = null
    window.__lastDetect  = null
    window.__detecting   = false
    window.__lastMedia   = null
  }

  async function loop() {
    if (!running) return

    if (!media) {
      rafId = requestAnimationFrame(loop)
      return
    }

    resizeCanvasToMedia(media)

    const isVideo = media.tagName === "VIDEO"

    if (isVideo && media.readyState < 2) {
      rafId = requestAnimationFrame(loop)
      return
    }

    const w = media.videoWidth  || media.naturalWidth
    const h = media.videoHeight || media.naturalHeight

    if (!w || !h) {
      rafId = requestAnimationFrame(loop)
      return
    }

    // Reset detection state when media source changes
    if (!window.__lastMedia || window.__lastMedia !== media) {
      window.__landmarks  = null
      window.__lastMedia  = media
      prevLandmarks       = null
      prevNoseLandmarks   = null
      window.__detecting  = false
    }

    const DETECT_INTERVAL = document.hidden ? 400 : 80
    const isStaticImage   = media.tagName === "IMG"
    const now             = performance.now()

    // Async detection — non-blocking
    if (!isStaticImage || !window.__landmarks) {
      if (!window.__detecting && now - lastDetectTime > DETECT_INTERVAL) {
        window.__detecting = true

        try {
          const detected = await getLandmarks(media)
          if (!running) return
          if (detected) window.__landmarks = detected
          lastDetectTime = now
        } finally {
          window.__detecting = false
        }
      }
    }

    const rawLandmarks = window.__landmarks

    if (!rawLandmarks || rawLandmarks.length === 0) {
      renderFrame(gl, media, null, null, {})
      rafId = requestAnimationFrame(loop)
      return
    }

    // Step 1: general smoothing for all landmarks
    const smooth = smoothLandmarks(rawLandmarks)

    // Step 2: extra nose-only smoothing on top (prevents oscillation)
    const noseStable = smoothNoseLandmarks(smooth)

    // Step 3: deform (or skip if comparing)
    const isComparing = comparingRef?.current === true
    const modified = isComparing ? noseStable : deform(noseStable, state)

    const enhanceControls = state.getAll("enhance") || {}
    const filterControls  = state.getAll("filter")  || {}

    try {
      renderFrame(gl, media, noseStable, modified, {
        ...enhanceControls,
        ...filterControls
      })
    } catch (e) {
      // Prevents texImage2D crash loop
      rafId = requestAnimationFrame(loop)
      return
    }

    rafId = requestAnimationFrame(loop)
  }

  loop()
  return stop
}
