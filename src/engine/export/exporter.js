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

  // 🎧 ADD AUDIO (if available)
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

  // 🎥 FORMAT SELECTION
  let mimeType = ""

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    mimeType = "video/webm;codecs=vp9"
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    mimeType = "video/webm;codecs=vp8"
  } else if (MediaRecorder.isTypeSupported("video/webm")) {
    mimeType = "video/webm"
  } else if (MediaRecorder.isTypeSupported("video/mp4")) {
    mimeType = "video/mp4" // ⚠️ limited support
  } else {
    alert("❌ No supported format")
    return
  }

  const recorder = new MediaRecorder(finalStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000
  })

  const chunks = []
  let startTime = null

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  recorder.onstart = () => {
    startTime = Date.now()
    onStart()
    
  }

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = mimeType.includes("mp4")
      ? "face-edit.mp4"
      : "face-edit.webm"

    a.click()
    URL.revokeObjectURL(url)

    onStop()
    
  }

  recorder.start()

  // 🎯 EXACT DURATION (SYNC WITH VIDEO)
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