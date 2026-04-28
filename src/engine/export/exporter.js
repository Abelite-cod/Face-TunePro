// /src/engine/export/exporter.js
import { Muxer, ArrayBufferTarget } from "mp4-muxer"

/* =========================
   📸 IMAGE EXPORT
========================= */

export async function fallbackRecord(canvas, media, { onStart, onStop, onProgress } = {}) {
  let recorder = null

  try {
    // 🎥 Canvas video stream
    const canvasStream = canvas.captureStream(30)

    // 🔊 Setup audio
    const audioCtx = new AudioContext()
    await audioCtx.resume()

    let source
    try {
      source = audioCtx.createMediaElementSource(media)
    } catch (e) {
      console.warn("⚠️ media source already connected", e)
    }
    const dest = audioCtx.createMediaStreamDestination()

    if (source) {
      source.connect(dest)
      source.connect(audioCtx.destination)
    }
    // 🎯 Merge video + audio
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ])

    // 🎬 Keep your original recorder behavior (no forced mp4)
    recorder = new MediaRecorder(combinedStream)
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
      try {
        audioCtx.close()
      } catch {}
      setTimeout(() => URL.revokeObjectURL(url), 2000)

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

  const target = new ArrayBufferTarget()

  

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
    bitrate: 3_000_000,
    framerate: fps
  })


  /* =========================
     🔊 AUDIO SETUP
  ========================= */

  let audioEncoder = null
  let audioCtx = null
  let workletNode = null
  let stopped = false
  // 🔥 SAMPLE-ACCURATE CLOCK
  let audioTimestamp = 0

  try {
    const stream = media.captureStream()

    audioCtx = new AudioContext({ sampleRate: 48000 })

    await audioCtx.audioWorklet.addModule("/audioProcessor.js")

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
      if (stopped) return

      const channels = e.data

      const frame = new AudioData({
        format: "f32",
        sampleRate: 48000,
        numberOfFrames: channels[0].length,
        numberOfChannels: channels.length,
        timestamp: audioTimestamp,
        data: interleave(channels)
      })

      audioEncoder.encode(frame)
      frame.close()

      audioTimestamp += (channels[0].length / 48000) * 1_000_000
    }

  } catch (e) {
    console.warn("⚠️ audio pipeline failed, continuing without audio", e)
  }


  /* =========================
    🎥 VIDEO LOOP
  ========================= */

  let running = true
  let encoding = false

  const frameDuration = 1000 / fps

  // 🔥 stable realtime clock
  const exportStart = performance.now()

  onStart()

  const draw = async () => {
    if (!running) return
    if (encoding) {
      setTimeout(draw, frameDuration)
      return
    }

    encoding = true

    const frameStart = performance.now()

    const bitmap = await createImageBitmap(canvas)

    const timestamp = Math.round(
      (performance.now() - exportStart) * 1000
    )

    const videoFrame = new VideoFrame(bitmap, {
      timestamp
    })

    videoEncoder.encode(videoFrame)

    videoFrame.close()
    bitmap.close()

    // 🔥 maintain stable pacing
    const elapsed = performance.now() - frameStart
    const delay = Math.max(0, frameDuration - elapsed)

    encoding = false
    setTimeout(draw, delay)
  }

  draw()
  /* =========================
     🛑 STOP
  ========================= */

  const stop = async () => {
    running = false
    stopped = true
    // 🛑 STOP AUDIO FIRST (critical)
    if (workletNode) {
      workletNode.port.onmessage = null
      try { workletNode.disconnect() } catch {}
    }

    if (audioCtx) {
      try { await audioCtx.close() } catch {}
    }

    // small delay to let pipeline drain
    await new Promise(r => setTimeout(r, 50))

    // 🧼 flush encoders AFTER stopping input
    await videoEncoder.flush()
    if (audioEncoder) await audioEncoder.flush()

    // ✅ NOW finalize safely
    muxer.finalize()

    const buffer = target.buffer
    const blob = new Blob([buffer], { type: "video/mp4" })

    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "face-edit.mp4"
    a.click()

    setTimeout(() => URL.revokeObjectURL(url), 2000)

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