import { getLandmarks } from "../vision/facemesh"
import { deform } from "../geometry/deform"
import { renderFrame } from "../gpu/renderer"

// ✅ NEW: smoothing state
let prevLandmarks = null

// ✅ NEW: smoothing function
function smoothLandmarks(current) {
  if (!prevLandmarks) {
    prevLandmarks = current
    return current
  }

  const alpha = 0.7 // tweak if needed (0.6–0.8)

  const smoothed = current.map((p, i) => ({
    x: prevLandmarks[i].x * alpha + p.x * (1 - alpha),
    y: prevLandmarks[i].y * alpha + p.y * (1 - alpha)
  }))

  prevLandmarks = smoothed
  return smoothed
}

export function runPipeline(media, canvas, state) {
  let lastSize = { w: 0, h: 0 }
  let rafId = null
  let cachedControls = {}

  const gl = canvas.getContext("webgl", {
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  })

  if (!gl) {
    console.error("❌ WebGL not supported")
    return () => {}
  }

  function resizeCanvasToMedia(media) {
    const w = media.videoWidth || media.naturalWidth
    const h = media.videoHeight || media.naturalHeight

    if (!w || !h) return
    if (w === lastSize.w && h === lastSize.h) return

    lastSize = { w, h }

    canvas.width = w
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

    // 🔥 reset globals
    prevLandmarks = null
    window.__landmarks = null
    window.__lastDetect = null
    window.__detecting = false
    window.__lastMedia = null
  }

  async function loop() {

    const current = media

    if (!running) return

    if (!current) {
      rafId = requestAnimationFrame(loop)
      return
    }

    resizeCanvasToMedia(current)

    const isVideo = current.tagName === "VIDEO"

    if (isVideo && current.readyState < 2) {
      rafId = requestAnimationFrame(loop)
      return
    }

    let w = 0
    let h = 0

    if (current.tagName === "VIDEO") {
      w = current.videoWidth
      h = current.videoHeight
    } else {
      w = current.naturalWidth
      h = current.naturalHeight
    }

    if (!w || !h) {
      rafId = requestAnimationFrame(loop)
      return
    }

    let landmarks = null

    // ✅ reset detection per media
    if (!window.__lastMedia || window.__lastMedia !== current) {
      window.__landmarks = null
      window.__lastMedia = current

      // ✅ ALSO reset smoothing when media changes
      prevLandmarks = null
      window.__detecting = false
    }

    const DETECT_INTERVAL = document.hidden ? 400 : 80
    const isStaticImage = current.tagName === "IMG"

    if (isStaticImage && window.__landmarks) {
      // reuse
    } if (!window.__detecting) {
        window.__detecting = true

        const detected = await getLandmarks(current)

        if (!running) return

        if (detected) {
          window.__landmarks = detected
        }

        window.__lastDetect = Date.now()
        window.__detecting = false
      }

    landmarks = window.__landmarks

    if (!landmarks || landmarks.length === 0) {
      renderFrame(gl, current, null, null, {})
      gl.flush()
      rafId = requestAnimationFrame(loop)
      return
    }

    // ✅ ✅ ✅ KEY FIX: smooth BEFORE deform
    const smooth = smoothLandmarks(landmarks)

    let modified = smooth

    const categories = ["eyes","nose","lips","jaw","face","eyebrows"]

    for (let category of categories) {
      modified = deform(modified, {
        category,
        getAll: (cat) => state.getAll(cat)
      })
    }

    cachedControls = {
      enhance: state.getAll("enhance") || {},
      filter: state.getAll("filter") || {}
    }

    const enhanceControls = cachedControls.enhance
    const filterControls = cachedControls.filter

    // ✅ IMPORTANT: pass smooth, not raw landmarks
    try {
      renderFrame(gl, current, smooth, modified, {
        ...enhanceControls,
        ...filterControls
      })
    } catch (e) {
      // 🛑 prevents texImage2D crash loop
      rafId = requestAnimationFrame(loop)
      return
    }

    gl.flush()

    rafId = requestAnimationFrame(loop)
  }

  loop()
  return stop
}