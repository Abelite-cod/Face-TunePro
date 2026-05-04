// /src/engine/export/muxAudio.js

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

const ffmpeg = new FFmpeg()

let loaded = false

export async function muxAudio(videoBlob, media) {

  try {

    if (!loaded) {
      console.log("🟡 Loading FFmpeg core...")

      const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm"

      await ffmpeg.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`
      })
      console.log("🟢 FFmpeg loaded")
      loaded = true
    }

    // cleanup old temp files
    try { await ffmpeg.deleteFile("video.mp4") } catch {}
    try { await ffmpeg.deleteFile("audio.mp3") } catch {}
    try { await ffmpeg.deleteFile("output.mp4") } catch {}

    // write video
    console.log("📦 Writing rendered video...")
    await ffmpeg.writeFile(
      "video.mp4",
      await fetchFile(videoBlob)
    )

    console.log("✅ Rendered video written")

    // extract audio from original media
    console.log("🎵 Extracting original audio...")
    const audioBlob = await fetch(media.src).then(r => r.blob())
    console.log("✅ Original audio extracted")

    await ffmpeg.writeFile(
      "audio.mp3",
      await fetchFile(audioBlob)
    )
    console.log("✅ Audio file written")

    // mux audio + video
    console.log("🎬 Starting mux...")
    await ffmpeg.exec([
      "-i", "video.mp4",
      "-i", "audio.mp3",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      "output.mp4"
    ])
    console.log("✅ Mux complete")
    const data = await ffmpeg.readFile("output.mp4")

    console.log("📥 Final MP4 ready")
    return new Blob(
      [data.buffer],
      { type: "video/mp4" }
    )

  } catch (e) {

    console.error("❌ muxAudio failed:", e)
    console.error("❌ stack:", e?.stack)

    // fallback to silent video
    return videoBlob
  }
}