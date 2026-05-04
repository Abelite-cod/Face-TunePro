// /src/engine/export/exporter.js
import { Muxer, ArrayBufferTarget } from "mp4-muxer"
import { renderFrame } from "../gpu/renderer"
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
      if (e.data && e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    recorder.onstart = () => {
      console.log("🎬 Fallback recording started")
      onStart?.("recording")
    }

    recorder.onstop = () => {
      console.log("🛑 Fallback recording stopped")

      const blob = new Blob(chunks)
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = "face-edit.mov"
      a.click()

      URL.revokeObjectURL(url)

      onStop?.()
    }

    recorder.start()

    // ✅ ONLY ONE PROGRESS SYSTEM
    if (media && media.tagName === "VIDEO") {
      const duration = media.duration || 0

      const interval = setInterval(() => {
        if (!duration) return

        const p = media.currentTime / duration
        onProgress?.(p)

        if (p >= 0.999) {
          clearInterval(interval)
          if (recorder && recorder.state !== "inactive") {
            recorder.stop()
          }
        }
      }, 100)
    }

  } catch (err) {
    console.error("❌ fallbackRecord failed:", err)
    onStop?.()
  }

  return {
    stop: () => {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop()
      }
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

    // wait for GPU to finish
    if (gl) gl.finish()

    requestAnimationFrame(() => {
      try {
        const dataUrl = canvas.toDataURL("image/png")

        if (!dataUrl || dataUrl === "data:,") {
          console.warn("⚠️ empty canvas export")
          return
        }

        const link = document.createElement("a")
        link.download = "face-edit.png"
        link.href = dataUrl
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

export async function recordCanvasVideo(canvas, media, options = {}) {
  const {
    fps = 30,
    onProgress = () => {},
    onStart = () => {},
    onStop = () => {}
  } = options

  const width = canvas.width
  const height = canvas.height

  const gl =
    canvas.getContext("webgl") ||
    canvas.getContext("webgl2")

  const target = new ArrayBufferTarget()

  

  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height
    },
    fastStart: "in-memory",

    // 🔥 prevents non-zero timestamp crash
    firstTimestampBehavior: "offset"
  })

  /* =========================
     🎥 VIDEO ENCODER
  ========================= */

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("video encoder error:", e)
  })

  videoEncoder.configure({
    codec: "avc1.42001f",
    width,
    height,
    bitrate: 5_000_000,
    framerate: fps
  })


  /* =========================
     🔊 AUDIO SETUP
  ========================= */

  

  /* =========================
     🎥 VIDEO LOOP
  ========================= */

 

  onStart()

  const totalFrames = Math.floor(media.duration * fps)

  for (let frame = 0; frame < totalFrames; frame++) {

    media.currentTime = frame / fps

    await new Promise((resolve) => {
      const seek = () => {
        media.removeEventListener("seeked", seek)
        resolve()
      }

      media.addEventListener("seeked", seek)
    })

    renderFrame(
      gl,
      media,
      window.__landmarks,
      window.__landmarks,
      {}
    )

    const bitmap = await createImageBitmap(canvas)

    const videoFrame = new VideoFrame(bitmap, {
      timestamp: frame * (1_000_000 / fps)
    })

    videoEncoder.encode(videoFrame)

    videoFrame.close()
    bitmap.close()

    onProgress?.(frame / totalFrames)
    
  }
  await stop()


  /* =========================
     🛑 STOP
  ========================= */

  async function stop() {
    
    
    // small delay to let pipeline drain
    await new Promise(r => setTimeout(r, 50))

    // 🧼 flush encoders AFTER stopping input
    await videoEncoder.flush()
    
    // ✅ NOW finalize safely
    muxer.finalize()

    const buffer = target.buffer
    const blob = new Blob([buffer], { type: "video/mp4" })
    const finalBlob =
      media.tagName === "VIDEO"
        ? await muxAudio(blob, media)
        : blob
    const url = URL.createObjectURL(finalBlob)

    const a = document.createElement("a")
    a.href = url
    a.download = "face-edit.mp4"
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 2000)

    onStop()
  }
}
  