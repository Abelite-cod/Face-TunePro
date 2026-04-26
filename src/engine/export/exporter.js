// /src/engine/export/exporter.js
import { uploadToServer } from "./uploadToServer"

export function downloadImage(canvas) {
  if (!canvas) {
    console.warn("❌ no canvas")
    return
  }

  try {
    const link = document.createElement("a")
    link.download = "face-edit.png"

    const dataUrl = canvas.toDataURL("image/png")

    if (!dataUrl || dataUrl === "data:,") {
      console.warn("⚠️ empty canvas export")
      return
    }

    link.href = dataUrl
    link.click()

  } catch (err) {
    console.error("❌ image export failed:", err)
  }
}

export function recordCanvasVideo(canvas, media, options = {}) {
  const {
    fps = 30,
    withAudio = true,
    onProgress = () => {},
    onStart = () => {},
    onStop = () => {}
  } = options

  const canvasStream = canvas.captureStream(fps)
  let finalStream = canvasStream

  // 🎧 AUDIO
  if (withAudio && media && media.captureStream) {
    try {
      const audioStream = media.captureStream()
      const audioTracks = audioStream.getAudioTracks()

      if (audioTracks.length > 0) {
        finalStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          audioTracks[0] // 🔥 ONLY FIRST TRACK
        ])
      }
    } catch (e) {
      console.warn("⚠️ audio capture failed", e)
    }
  }

  /* =========================
     🎥 FORMAT (OPTION A)
  ========================= */

  let mimeType = "video/webm;codecs=vp8,opus"

  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm"
  }

  console.log("🎥 recording format:", mimeType)

  const recorder = new MediaRecorder(finalStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000 // 🔥 slightly higher for better quality
  })

  let chunks = []
  let startTime = null

  // ✅ STREAM chunks
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  recorder.onstart = () => {
    startTime = Date.now()
    onStart()
  }

  recorder.onstop = async () => {
    if (chunks.length === 0) {
      console.warn("⚠️ no chunks recorded")
      return
    }
    try {
      const blob = new Blob(chunks, { type: mimeType })

      console.log("⬆️ sending to server...", blob.size)

      onProgress(1)

      await uploadToServer(blob, {
        onStage: (stage) => {
          onStart?.(stage)
        }
      })

    } catch (err) {
      console.error("❌ export failed:", err)
    }

    chunks = []
    onStop()
  }
  recorder.start(250)

  /* =========================
     🎯 PROGRESS
  ========================= */

  if (media && media.tagName === "VIDEO") {
    const duration = media.duration

    if (!isNaN(duration)) {
      let lastProgress = 0

      const interval = setInterval(() => {
        const current = media.currentTime
        let progress = current / duration

        // clamp
        progress = Math.max(0, Math.min(1, progress))

        // 🧠 prevent tiny jumps (flicker fix)
        if (Math.abs(progress - lastProgress) > 0.01) {
          lastProgress = progress
          onProgress(progress)
        }

        if (progress >= 0.999) {
          clearInterval(interval)
          recorder.stop()
        }
      }, 100)
    }
  }

  return recorder
}