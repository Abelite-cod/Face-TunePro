import express from "express"
import multer from "multer"
import ffmpeg from "fluent-ffmpeg"
import ffmpegPath from "@ffmpeg-installer/ffmpeg"
import fs from "fs"
import path from "path"
import cors from "cors"

ffmpeg.setFfmpegPath(ffmpegPath.path)
const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())

/* =========================
   📁 DIRECTORIES
========================= */

const uploadDir = "uploads"
const outputDir = "outputs"

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

/* =========================
   📦 MULTER (UPLOAD)
========================= */

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
})

/* =========================
   🎥 EXPORT ROUTE
========================= */

app.post("/export", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded")
    }

    const inputPath = req.file.path
    const outputPath = path.join(
      outputDir,
      `output-${Date.now()}.mp4`
    )

    console.log("🎬 processing:", inputPath)

    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-preset ultrafast",        // 🔥 lower memory
        "-crf 28",                  // slightly smaller file
        "-threads 1",               // 🔥 prevent RAM spike
        "-movflags +faststart",
        "-pix_fmt yuv420p"
      ])
      .on("start", (cmd) => {
        console.log("🎬 ffmpeg start")
        console.log(cmd)
      })
      .on("progress", (p) => {
        if (p.percent) {
          console.log(`⏳ ${p.percent.toFixed(1)}%`)
        }
      })
      .on("end", () => {
        console.log("✅ finished:", outputPath)

        res.setHeader("Content-Type", "video/mp4")
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=face-edit.mp4"
        )

        const stream = fs.createReadStream(outputPath)
        stream.pipe(res)

        stream.on("close", () => {
          fs.unlink(inputPath, () => {})
          fs.unlink(outputPath, () => {})
        })
      })
      .on("error", (err) => {
        console.error("❌ ffmpeg error:", err)

        fs.unlink(inputPath, () => {})
        res.status(500).send("Processing failed")
      })
      .save(outputPath)
      
  } catch (err) {
    console.error("❌ server error:", err)
    res.status(500).send("Server error")
  }
})

/* =========================
   🧹 FALLBACK CLEANER
========================= */

setInterval(() => {
  const now = Date.now()

  const cleanDir = (dir) => {
    fs.readdir(dir, (err, files) => {
      if (err) return

      files.forEach(file => {
        const filePath = path.join(dir, file)

        fs.stat(filePath, (err, stat) => {
          if (err) return

          // delete files older than 5 minutes
          if (now - stat.mtimeMs > 5 * 60 * 1000) {
            fs.unlink(filePath, () => {
              console.log("🧹 cleaned:", filePath)
            })
          }
        })
      })
    })
  }

  cleanDir(uploadDir)
  cleanDir(outputDir)

}, 60 * 1000)

/* =========================
   ❤️ HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.send("✅ Face Pro Server Running")
})

/* =========================
   🚀 START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 running on ${PORT}`)
})