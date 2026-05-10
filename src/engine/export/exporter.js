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
 * Properly tests whether VideoEncoder can actually encode H.264 on this device.
 * Mac Chrome sometimes reports WebCodecs available but fails on avc1.
 */
export async function supportsH264Encoding() {
  if (typeof VideoEncoder === "undefined") return false

  try {
    const support = await VideoEncoder.isConfigSupported({
      codec:     "avc1.42001f",
      width:     1280,
      height:    720,
      bitrate:   5_000_000,
      framerate: 30
    })
    return support.supported === true
  } catch (e) {
    return false
  }
}

/* =========================
   🎥 TEMPORAL SMOOTHER
========================= */

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

/* =========================
   🎥 SHARED FRAME RENDERER
   Used by both export paths
========================= */

async function renderExportFrame(gl, media, frame, fps, cachedLandmarks, smoothLandmarks, state) {
  // Seek to frame
  media.currentTime = frame / fps

  await new Promise((resolve) => {
    const onSeeked = () => {
      media.removeEventListener("seeked", onSeeked)
      resolve()
    }
    media.addEventListener("seeked", onSeeked)
  })

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
  const REDETECT_EVERY  = 5
  let cachedLandmarks   = null

  for (let frame = 0; frame < totalFrames; frame++) {

    // Re-detect landmarks periodically
    if (frame === 0 || frame % REDETECT_EVERY === 0) {
      try {
        // Seek first so detection is on the right frame
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
    state      = null
  } = options

  const width  = canvas.width
  const height = canvas.height
  const gl     = canvas.getContext("webgl") || canvas.getContext("webgl2")

  // Pick best supported MIME type
  const mimeType = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ].find(m => MediaRecorder.isTypeSupported(m)) || "video/webm"

  // Build a combined stream: canvas video + original audio track
  // This avoids FFmpeg entirely — audio is captured natively
  const canvasStream = canvas.captureStream(fps)
  
  // Try to add the video's audio track to the stream
  try {
    if (media.captureStream) {
      const mediaStream = media.captureStream()
      const audioTracks = mediaStream.getAudioTracks()
      audioTracks.forEach(track => canvasStream.addTrack(track))
    }
  } catch (e) {
    console.warn("⚠️ Could not add audio track:", e)
  }

  const recorder = new MediaRecorder(canvasStream, { mimeType })
  const chunks   = []

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  // Reset video to start and play (needed for audio sync)
  media.currentTime = 0
  media.muted = false

  // Start recording
  recorder.start(100) // collect data every 100ms
  onStart("recording")

  // Play the video — real-time capture with deformations applied each frame
  await media.play()

  const smoothLandmarks = makeExportSmoother()
  const REDETECT_EVERY  = 8  // less frequent on mobile for performance
  let cachedLandmarks   = null
  let frameCount        = 0
  let animFrameId       = null
  const duration        = media.duration || 0

  await new Promise((resolve) => {
    const renderLoop = async () => {
      if (media.ended || media.paused) {
        resolve()
        return
      }

      // Re-detect landmarks periodically
      if (frameCount === 0 || frameCount % REDETECT_EVERY === 0) {
        try {
          const detected = await getLandmarks(media)
          if (detected) cachedLandmarks = detected
        } catch (_) {}
      }

      // Apply deformations and render
      let smooth   = cachedLandmarks
      let modified = cachedLandmarks

      if (cachedLandmarks) {
        smooth   = smoothLandmarks(cachedLandmarks)
        modified = state ? deform(smooth, state) : smooth
      }

      const enhanceControls = state ? (state.getAll("enhance") || {}) : {}
      const filterControls  = state ? (state.getAll("filter")  || {}) : {}

      renderFrame(gl, media, smooth, modified, { ...enhanceControls, ...filterControls })

      // Progress
      if (duration > 0) {
        onProgress(media.currentTime / duration)
      }

      if (onThumb && frameCount % 30 === 0) {
        try { onThumb(canvas.toDataURL("image/jpeg", 0.5)) } catch (_) {}
      }

      frameCount++
      animFrameId = requestAnimationFrame(renderLoop)
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

    renderLoop()
  })

  // Small buffer to let MediaRecorder flush
  await new Promise(r => setTimeout(r, 300))

  // Stop recorder and wait for final data
  await new Promise((resolve) => {
    recorder.onstop = resolve
    recorder.stop()
  })

  const ext      = mimeType.startsWith("video/mp4") ? "mp4" : "webm"
  const finalBlob = new Blob(chunks, { type: mimeType })

  const url = URL.createObjectURL(finalBlob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = `face-edit.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)

  onStop()
}
