// /src/engine/export/exporter.js

export function downloadImage(canvas) {
  if (!canvas) {
    console.warn("❌ no canvas")
    return
  }

  try {
    const link = document.createElement("a")
    link.download = "face-edit.png"

    // 🔥 FORCE canvas snapshot (fix blank image)
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
          ...audioTracks
        ])
      }
    } catch (e) {
      console.warn("⚠️ audio capture failed", e)
    }
  }

  // 🎥 FORMAT
  let mimeType = ""

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    mimeType = "video/webm;codecs=vp9"
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    mimeType = "video/webm;codecs=vp8"
  } else {
    mimeType = "video/webm"
  }

  const recorder = new MediaRecorder(finalStream, {
    mimeType,
    videoBitsPerSecond: 3_000_000 // ✅ LOWER = faster + stable
  })

  let chunks = []
  let startTime = null

  // ✅ STREAM chunks continuously (CRITICAL FIX)
  recorder.ondataavailable = (e) => {
    console.log("📦 chunk:", e.data.size)

    if (e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  recorder.onstart = () => {
    console.log("🟢 recorder STARTED")
    startTime = Date.now()
    onStart()
  }

  recorder.onstop = () => {

    console.log("🔴 recorder STOPPED")
    console.log("📦 total chunks:", chunks.length)

    const blob = new Blob(chunks, { type: mimeType })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "face-edit.webm"
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 2000)

    chunks = [] // ✅ free memory
    onStop()
  }

  // ✅ KEY FIX: timeslice = flush every 1 second
  recorder.start(1000)

  // 🎯 PROGRESS SYNC
  if (media && media.tagName === "VIDEO") {
    const duration = media.duration

    if (!isNaN(duration)) {
      const interval = setInterval(() => {
        const current = media.currentTime
        const progress = current / duration

        onProgress(progress)

        if (progress >= 0.999) {
          clearInterval(interval)
          recorder.stop()
        }
      }, 100)
    }
  }

  return recorder
}