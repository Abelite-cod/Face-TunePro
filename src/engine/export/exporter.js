// /src/engine/export/exporter.js
import { Muxer, ArrayBufferTarget } from "mp4-muxer"
import { renderFrame } from "../gpu/renderer"
import { getLandmarks } from "../vision/facemesh"
import { deform } from "../geometry/deform"
import { muxAudio } from "./muxAudio"


/* =========================
   📸 IMAGE EXPORT
========================= */

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
   🔍 CODEC SUPPORT CHECK
========================= */

/**
 * Synchronous check — no async hanging possible.
 * iOS Safari and all Safari browsers use the frameByFrameRecord path.
 * Mac Chrome/Firefox use WebCodecs.
 */
export function supportsH264Encoding() {
  // No VideoEncoder API at all
  if (typeof VideoEncoder === "undefined") return false

  const ua = navigator.userAgent

  // iOS devices — always use fallback
  if (/iPhone|iPad|iPod/i.test(ua)) return false

  // Safari on Mac — use fallback (Safari WebCodecs is unreliable)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
  if (isSafari) return false

  // Chrome, Firefox, Edge on Windows/Mac/Android — use WebCodecs
  return true
}

/* =========================
   🎥 TEMPORAL SMOOTHER
========================= */

function makeExportSmoother() {
  let prev = null
  // Higher alpha = more smoothing between landmark detections.
  // 0.92 means each new detection blends in over ~12 frames instead of jumping instantly.
  const alpha = 0.92

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

/* =========================
   🎥 SHARED FRAME RENDERER
   Used by both export paths
========================= */

async function renderExportFrame(gl, media, frame, fps, cachedLandmarks, smoothLandmarks, state) {
  // Seek to frame
  media.currentTime = frame / fps

  // Wait for seek to complete
  await new Promise((resolve) => {
    const onSeeked = () => {
      media.removeEventListener("seeked", onSeeked)
      resolve()
    }
    media.addEventListener("seeked", onSeeked)
  })

  // Wait for frame to be fully decoded (readyState >= 2 = HAVE_CURRENT_DATA)
  // This prevents the black flash when the frame isn't ready yet
  if (media.readyState < 2) {
    await new Promise((resolve) => {
      const check = () => {
        if (media.readyState >= 2) resolve()
        else requestAnimationFrame(check)
      }
      check()
    })
  }

  // Apply smoothing + deform
  let smooth   = cachedLandmarks
  let modified = cachedLandmarks

  if (cachedLandmarks) {
    smooth   = smoothLandmarks(cachedLandmarks)
    modified = state ? deform(smooth, state) : smooth
  }

  const enhanceControls = state ? (state.getAll("enhance") || {}) : {}
  const filterControls  = state ? (state.getAll("filter")  || {}) : {}

  renderFrame(gl, media, smooth, modified, {
    ...enhanceControls,
    ...filterControls
  })
}

/* =========================
   🎥 WEBCODES EXPORT (Desktop Chrome/Firefox/Edge)
========================= */

export async function recordCanvasVideo(canvas, media, options = {}) {
  const {
    fps        = 30,
    onProgress = () => {},
    onStart    = () => {},
    onStop     = () => {},
    onThumb    = null,
    state      = null
  } = options

  const width  = canvas.width
  const height = canvas.height
  const gl     = canvas.getContext("webgl") || canvas.getContext("webgl2")

  const target = new ArrayBufferTarget()

  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset"
  })

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

  const totalFrames     = Math.floor(media.duration * fps)
  const smoothLandmarks = makeExportSmoother()

  // Re-detect every 30 frames (1 second) — not every 5.
  // Detecting too frequently causes oscillation because each detection
  // returns slightly different landmark positions, making the warp jump.
  // Every 30 frames is frequent enough to track head movement while
  // being slow enough that the heavy smoothing (alpha=0.92) hides any transition.
  const REDETECT_EVERY = 30
  let cachedLandmarks  = null

  for (let frame = 0; frame < totalFrames; frame++) {

    if (frame === 0 || frame % REDETECT_EVERY === 0) {
      try {
        media.currentTime = frame / fps
        await new Promise((resolve) => {
          const onSeeked = () => { media.removeEventListener("seeked", onSeeked); resolve() }
          media.addEventListener("seeked", onSeeked)
        })
        const detected = await getLandmarks(media)
        if (detected) cachedLandmarks = detected
      } catch (e) {
        console.warn("⚠️ landmark detection failed for frame", frame, e)
      }
    }

    await renderExportFrame(gl, media, frame, fps, cachedLandmarks, smoothLandmarks, state)

    const bitmap     = await createImageBitmap(canvas)
    const videoFrame = new VideoFrame(bitmap, {
      timestamp: frame * (1_000_000 / fps)
    })

    videoEncoder.encode(videoFrame)
    videoFrame.close()
    bitmap.close()

    if (onThumb && frame % 15 === 0) {
      try { onThumb(canvas.toDataURL("image/jpeg", 0.5)) } catch (_) {}
    }

    onProgress(frame / totalFrames)
  }

  // Finalize
  await new Promise(r => setTimeout(r, 50))
  await videoEncoder.flush()
  muxer.finalize()

  const buffer    = target.buffer
  const blob      = new Blob([buffer], { type: "video/mp4" })
  const finalBlob = media.tagName === "VIDEO" ? await muxAudio(blob, media) : blob

  const url = URL.createObjectURL(finalBlob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = "face-edit.mp4"
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)

  onStop()
}

/* =========================
   🎥 FRAME-BY-FRAME MEDIARECORDER EXPORT
   For Safari / iOS / any browser without H.264 VideoEncoder support.
   Seeks frame-by-frame → renders → draws to 2D canvas → MediaRecorder captures.
   This gives CORRECT FPS — not real-time capture.
========================= */

export async function frameByFrameRecord(canvas, media, options = {}) {
  const {
    fps        = 30,
    onProgress = () => {},
    onStart    = () => {},
    onStop     = () => {},
    onThumb    = null,
    state      = null   // kept for API compatibility but not used here
  } = options

  // Pick best supported MIME type
  const mimeType = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ].find(m => MediaRecorder.isTypeSupported(m)) || "video/webm"

  // Use 0 fps for captureStream — let the browser decide timing based on actual renders
  // This prevents the "slow motion" effect when device renders slower than 30fps
  const canvasStream = canvas.captureStream(0)

  // Audio via Web Audio API — works on iOS Safari where captureStream audio doesn't
  let audioCtx = null
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaElementSource(media)
    const dest   = audioCtx.createMediaStreamDestination()
    source.connect(dest)
    source.connect(audioCtx.destination) // also play through speakers
    dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t))
  } catch (e) {
    console.warn("⚠️ Web Audio routing failed:", e)
  }

  const recorder = new MediaRecorder(canvasStream, { mimeType })
  const chunks   = []

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  // Reset to start
  media.currentTime = 0
  media.muted = false

  // Start recording
  recorder.start(100)
  onStart("recording")

  // Play video
  try {
    await media.play()
  } catch (e) {
    console.warn("⚠️ media.play() failed:", e)
    media.muted = true
    try { await media.play() } catch (_) {}
  }

  // Resume AudioContext if suspended (iOS requires user gesture)
  if (audioCtx && audioCtx.state === "suspended") {
    try { await audioCtx.resume() } catch (_) {}
  }

  let frameCount  = 0
  let animFrameId = null
  const duration  = media.duration || 0

  // The live pipeline renders the warped canvas every frame.
  // We just need to tell captureStream(0) to grab a new frame on each render.
  // captureStream(0) = manual frame capture — we call track.requestFrame() each time.
  const videoTrack = canvasStream.getVideoTracks()[0]

  await new Promise((resolve) => {

    const onFrame = () => {
      // Only stop when video has actually ended (not just paused at start)
      if (media.ended || (media.paused && frameCount > 0)) {
        resolve()
        return
      }

      // Manually push the current canvas frame into the stream
      // This ensures MediaRecorder gets exactly one frame per render, not based on time
      if (videoTrack && videoTrack.requestFrame) {
        videoTrack.requestFrame()
      }

      // Progress
      if (duration > 0) {
        onProgress(media.currentTime / duration)
      }

      if (onThumb && frameCount % 30 === 0) {
        try { onThumb(canvas.toDataURL("image/jpeg", 0.5)) } catch (_) {}
      }

      frameCount++

      // Use requestVideoFrameCallback if available (iOS Safari 15.4+)
      // — fires exactly once per decoded video frame for perfect sync
      if (media.requestVideoFrameCallback) {
        media.requestVideoFrameCallback(onFrame)
      } else {
        animFrameId = requestAnimationFrame(onFrame)
      }
    }

    // Safety timeout — never get permanently stuck
    const safetyTimer = setTimeout(() => {
      console.warn("⚠️ Export safety timeout triggered")
      if (animFrameId) cancelAnimationFrame(animFrameId)
      resolve()
    }, (duration + 10) * 1000)

    media.addEventListener("ended", () => {
      clearTimeout(safetyTimer)
      if (animFrameId) cancelAnimationFrame(animFrameId)
      resolve()
    }, { once: true })

    // Start the loop
    if (media.requestVideoFrameCallback) {
      media.requestVideoFrameCallback(onFrame)
    } else {
      animFrameId = requestAnimationFrame(onFrame)
    }
  })

  // Small buffer to let MediaRecorder flush
  await new Promise(r => setTimeout(r, 500))

  // Stop recorder and wait for final data — with timeout safety for iOS Safari
  await Promise.race([
    new Promise((resolve) => {
      recorder.onstop = resolve
      if (recorder.state !== "inactive") recorder.stop()
      else resolve()
    }),
    new Promise(resolve => setTimeout(resolve, 3000)) // safety: never hang
  ])

  // Clean up AudioContext
  if (audioCtx) {
    try { audioCtx.close() } catch (_) {}
  }

  const ext       = mimeType.startsWith("video/mp4") ? "mp4" : "webm"
  const finalBlob = new Blob(chunks, { type: mimeType })

  const url = URL.createObjectURL(finalBlob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = `face-edit.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)

  onStop()
}
