import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection"
import "@tensorflow/tfjs-backend-webgl"
import * as tf from "@tensorflow/tfjs"

const offscreen = document.createElement("canvas")

const ctx = offscreen.getContext("2d", {
  willReadFrequently: false
})


let detector = null
let initializing = null // ✅ prevents recursion

export async function initFaceMesh() {
  // ✅ already ready
  if (detector) return detector

  // ✅ already initializing → WAIT instead of re-calling
  if (initializing) return initializing

  initializing = (async () => {

    if (tf.getBackend() !== "webgl") {
      await tf.setBackend("webgl")
    }

    await tf.ready()
    detector = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: "tfjs",
        refineLandmarks: false,
        maxFaces: 1
      }
    )

    return detector
  })()

  return initializing
}

export async function getLandmarks(media) {
  // ✅ SAFE INIT (no recursion now)
  if (!detector) {
    await initFaceMesh()
  }

  if (!detector) {
    console.warn("⚠️ detector not ready")
    return null
  }

  const width =
    media.videoWidth ||
    media.naturalWidth ||
    media.width

  const height =
    media.videoHeight ||
    media.naturalHeight ||
    media.height

  if (!width || !height) return null

  try {
    
    offscreen.width = width
    offscreen.height = height

    ctx.drawImage(media, 0, 0, width, height)

    const faces = await detector.estimateFaces(offscreen, {
      flipHorizontal: false
    })

    if (!faces || faces.length === 0) return null

    return faces[0].keypoints

  } catch (e) {
    console.error("❌ detection error", e)
    return null
  }
} 