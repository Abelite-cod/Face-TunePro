// /src/engine/export/exporter.js
import { Muxer, ArrayBufferTarget } from "mp4-muxer"

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

  const target = new ArrayBufferTarget()

  // 🔥 GLOBAL CLOCK (shared)
  const startTime = performance.now()

  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height
    },
    audio: {
      codec: "aac",
      sampleRate: 48000,
      numberOfChannels: 2
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

  let audioEncoder = null
  let audioCtx = null
  let workletNode = null

  // 🔥 SAMPLE-ACCURATE CLOCK
  let audioTimestamp = 0

  try {
    const stream = media.captureStream()

    audioCtx = new AudioContext({ sampleRate: 48000 })

    await audioCtx.audioWorklet.addModule("/src/engine/export/audioProcessor.js")

    const source = audioCtx.createMediaStreamSource(stream)
    workletNode = new AudioWorkletNode(audioCtx, "pcm-processor")

    source.connect(workletNode)
    workletNode.connect(audioCtx.destination)

    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error("audio encoder error:", e)
    })

    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128000
    })

    workletNode.port.onmessage = (e) => {
      const channels = e.data

      const frame = new AudioData({
        format: "f32",
        sampleRate: 48000,
        numberOfFrames: channels[0].length,
        numberOfChannels: channels.length,
        timestamp: audioTimestamp, // ✅ always starts at 0
        data: interleave(channels)
      })

      audioEncoder.encode(frame)
      frame.close()

      // advance timestamp correctly (microseconds)
      audioTimestamp += (channels[0].length / 48000) * 1_000_000
    }

  } catch (e) {
    console.warn("⚠️ audio pipeline failed, continuing without audio", e)
  }


  /* =========================
     🎥 VIDEO LOOP
  ========================= */

  let running = true
  let lastTime = 0
  const frameInterval = 1000 / fps

  onStart()

  const draw = async (now) => {
    if (!running) return

    if (now - lastTime < frameInterval) {
      requestAnimationFrame(draw)
      return
    }

    lastTime = now

    const bitmap = await createImageBitmap(canvas)

    const videoFrame = new VideoFrame(bitmap, {
      timestamp: (now - startTime) * 1000 // microseconds
    })

    videoEncoder.encode(videoFrame)

    videoFrame.close()
    bitmap.close()

    requestAnimationFrame(draw)
  }

  requestAnimationFrame(draw)


  /* =========================
     🛑 STOP
  ========================= */

  const stop = async () => {
    running = false

    await new Promise(r => setTimeout(r, 50))

    await videoEncoder.flush()
    if (audioEncoder) await audioEncoder.flush()

    muxer.finalize()

    const buffer = target.buffer
    const blob = new Blob([buffer], { type: "video/mp4" })

    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "face-edit.mp4"
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 2000)

    // cleanup
    if (audioCtx) audioCtx.close()

    onStop()
  }


  /* =========================
     📊 PROGRESS TRACKING
  ========================= */

  if (media.tagName === "VIDEO") {
    const duration = media.duration

    const interval = setInterval(() => {
      const progress = media.currentTime / duration
      onProgress(progress)

      if (progress >= 0.999) {
        clearInterval(interval)
        stop()
      }
    }, 100)
  }

  return { stop }
}


/* =========================
   🔧 INTERLEAVE AUDIO
========================= */

function interleave(channels) {
  const length = channels[0].length
  const result = new Float32Array(length * channels.length)

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels.length; ch++) {
      result[i * channels.length + ch] = channels[ch][i]
    }
  }

  return result
}