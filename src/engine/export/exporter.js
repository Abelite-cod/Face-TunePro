// /src/engine/export/exporter.js
import { Muxer, ArrayBufferTarget } from "mp4-muxer"
import { renderFrame } from "../gpu/renderer"
import { getLandmarks } from "../vision/facemesh"
import { deform } from "../geometry/deform"
import { muxAudio } from "./muxAudio"

/* =========================
   📸 IMAGE EXPORT
========================= */

export function fallbackRecord(canvas, media, { onStart, onStop, onProgress } = {}) {
  let recorder = null

  try {
    const stream = canvas.captureStream(30)
    recorder = new MediaRecorder(stream)
    const chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstart = () => {
      console.log("🎬 Fallback recording started")
      onStart?.("recording")
    }

    recorder.onstop = () => {
      console.log("🛑 Fallback recording stopped")
      const blob = new Blob(chunks)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = "face-edit.mov"
      a.click()
      URL.revokeObjectURL(url)
      onStop?.()
    }

    recorder.start()

    if (media && media.tagName === "VIDEO") {
      const duration = media.duration || 0
      const interval = setInterval(() => {
        if (!duration) return
        const p = media.currentTime / duration
        onProgress?.(p)
        if (p >= 0.999) {
          clearInterval(interval)
          if (recorder && recorder.state !== "inactive") recorder.stop()
        }
      }, 100)
    }

  } catch (err) {
    console.error("❌ fallbackRecord failed:", err)
    onStop?.()
  }

  return {
    stop: () => {
      if (recorder && recorder.state !== "inactive") recorder.stop()
    }
  }
}

export function downloadImage(canvas) {
  if (!canvas) {
    console.warn("❌ no canvas")
    return
  }

  try {
    const gl = canvas.getContext("webgl") || canvas.getContext("webgl2")
    if (gl) gl.finish()

    requestAnimationFrame(() => {
      try {
        const dataUrl = canvas.toDataURL("image/png")
        if (!dataUrl || dataUrl === "data:,") {
          console.warn("⚠️ empty canvas export")
          return
        }
        const link    = document.createElement("a")
        link.download = "face-edit.png"
        link.href     = dataUrl
        link.click()
      } catch (err) {
        console.error("❌ image export failed (inner):", err)
      }
    })
  } catch (err) {
    console.error("❌ image export failed:", err)
  }
}


/* =========================
   🎥 VIDEO EXPORT
========================= */

/**
 * Temporal smoother — same algorithm as pipeline.js.
 * Keeps export visually identical to live preview.
 */
function makeExportSmoother() {
  let prev = null
  const alpha = 0.75

  return function smooth(current) {
    if (!prev || prev.length !== current.length) {
      prev = current
      return current
    }
    const smoothed = current.map((p, i) => ({
      x: prev[i].x * alpha + p.x * (1 - alpha),
      y: prev[i].y * alpha + p.y * (1 - alpha)
    }))
    prev = smoothed
    return smoothed
  }
}

export async function recordCanvasVideo(canvas, media, options = {}) {
  const {
    fps        = 30,
    onProgress = () => {},
    onStart    = () => {},
    onStop     = () => {},
    onThumb    = null,   // Feature 10: called with dataUrl every N frames
    state      = null    // EditorState — required for deformations
  } = options

  const width  = canvas.width
  const height = canvas.height

  const gl = canvas.getContext("webgl") || canvas.getContext("webgl2")

  const target = new ArrayBufferTarget()

  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset"
  })

  /* =========================
     🎥 VIDEO ENCODER
  ========================= */

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error:  (e) => console.error("video encoder error:", e)
  })

  videoEncoder.configure({
    codec:     "avc1.42001f",
    width,
    height,
    bitrate:   5_000_000,
    framerate: fps
  })

  onStart()

  const totalFrames   = Math.floor(media.duration * fps)
  const smoothLandmarks = makeExportSmoother()

  // Detect landmarks once at the start for the first frame,
  // then re-detect every N frames to track motion while staying stable.
  const REDETECT_EVERY = 5  // re-detect every 5 frames (~6× per second at 30fps)
  let cachedLandmarks  = null

  /* =========================
     🎥 FRAME LOOP
  ========================= */

  for (let frame = 0; frame < totalFrames; frame++) {

    media.currentTime = frame / fps

    // Wait for seek
    await new Promise((resolve) => {
      const onSeeked = () => {
        media.removeEventListener("seeked", onSeeked)
        resolve()
      }
      media.addEventListener("seeked", onSeeked)
    })

    // Re-detect landmarks periodically (not every frame — too expensive & jittery)
    if (frame === 0 || frame % REDETECT_EVERY === 0) {
      try {
        const detected = await getLandmarks(media)
        if (detected) cachedLandmarks = detected
      } catch (e) {
        console.warn("⚠️ landmark detection failed for frame", frame, e)
      }
    }

    // Apply same smoothing as live preview
    let smooth   = cachedLandmarks
    let modified = cachedLandmarks

    if (cachedLandmarks) {
      // ✅ Smooth — same algorithm as pipeline.js
      smooth = smoothLandmarks(cachedLandmarks)

      // ✅ Single-pass deform — identical to pipeline.js
      modified = state ? deform(smooth, state) : smooth
    }

    // Get filter/enhance controls
    const enhanceControls = state ? (state.getAll("enhance") || {}) : {}
    const filterControls  = state ? (state.getAll("filter")  || {}) : {}

    // Render this frame — identical call signature to pipeline.js
    renderFrame(gl, media, smooth, modified, {
      ...enhanceControls,
      ...filterControls
    })

    // Capture rendered frame
    const bitmap     = await createImageBitmap(canvas)
    const videoFrame = new VideoFrame(bitmap, {
      timestamp: frame * (1_000_000 / fps)
    })

    videoEncoder.encode(videoFrame)
    videoFrame.close()
    bitmap.close()

    // Feature 10: capture thumbnail every 15 frames
    if (onThumb && frame % 15 === 0) {
      try {
        const thumbUrl = canvas.toDataURL("image/jpeg", 0.5)
        onThumb(thumbUrl)
      } catch (_) {}
    }

    onProgress(frame / totalFrames)
  }

  await finalize()

  /* =========================
     🛑 FINALIZE
  ========================= */

  async function finalize() {
    await new Promise(r => setTimeout(r, 50))

    await videoEncoder.flush()
    muxer.finalize()

    const buffer    = target.buffer
    const blob      = new Blob([buffer], { type: "video/mp4" })
    const finalBlob = media.tagName === "VIDEO"
      ? await muxAudio(blob, media)
      : blob

    const url = URL.createObjectURL(finalBlob)
    const a   = document.createElement("a")
    a.href     = url
    a.download = "face-edit.mp4"
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 2000)

    onStop()
  }
}
