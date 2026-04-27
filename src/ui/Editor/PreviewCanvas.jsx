import { useEffect, useRef, useState } from "react"
import { useEditor } from "../../state/editorState"
import { initFaceMesh, getLandmarks } from "../../engine/vision/facemesh"
import { runPipeline } from "../../engine/pipeline/pipeline.js"
import { downloadImage, recordCanvasVideo, fallbackRecord } from "../../engine/export/exporter"



export default function PreviewCanvas(){

  const state = useEditor()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const mediaRef = useRef(null)
  const pendingFileRef = useRef(null)

  const landmarksRef = useRef(null)
  const detectingRef = useRef(false)

  const [scale,setScale] = useState(1)
  const [offset,setOffset] = useState({x:0,y:0})
  const [flash,setFlash] = useState(null)

  const [homePos, setHomePos] = useState({ x: 16, y: 16 })
  const draggingHomeRef = useRef(false)
  const homeStartRef = useRef({ x: 0, y: 0 })
  const homeStartPosRef = useRef({ x: 0, y: 0 })

  /* editing */
  const editingRef = useRef(false)
  const startRef = useRef({x:0,y:0})
  const startValueRef = useRef(0)

  const cancelledRef = useRef(false)
  const recorderRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0)
  const stopPipelineRef = useRef(null)
  const [exportStatus, setExportStatus] = useState(null)
// null | "preparing" | "recording" | "done"
  const forceRenderFrame = () => {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
    })
  }

  const [cameraLoading, setCameraLoading] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [bootStage, setBootStage] = useState("loading") 
  // "loading" | "ready"

  const [mediaLoading, setMediaLoading] = useState(false)
  // null | "image" | "video"


  const movedRef = useRef(false)
  const movedHomeRef = useRef(false)

  const onHomeDown = (e) => {
    draggingHomeRef.current = true
    movedHomeRef.current = false

    homeStartRef.current = { x: e.clientX, y: e.clientY }
    homeStartPosRef.current = homePos
  }

  const onHomeMove = (e) => {
    if (!draggingHomeRef.current) return

    const dx = e.clientX - homeStartRef.current.x
    const dy = e.clientY - homeStartRef.current.y

    // detect drag vs click
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedHomeRef.current = true
    }

    setHomePos({
      x: homeStartPosRef.current.x + dx,
      y: homeStartPosRef.current.y + dy
    })
  }

  const onHomeUp = () => {
    draggingHomeRef.current = false
  }


  const btnStyle = {
    padding: "10px 18px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "white",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s ease"
  }

  const startPipeline = (media) => {
    if (!engineReady) {
      console.warn("⏳ Engine not ready")
      return
    }
    const canvas = canvasRef.current
    if (!canvas || !media) return

    
    // 🛑 STOP OLD PIPELINE
    if (stopPipelineRef.current) {
      try {
        stopPipelineRef.current()
      } catch (e) {
        console.warn("⚠️ Stop failed:", e)
      }
      stopPipelineRef.current = null
    }

    // 🧼 RESET GLOBAL STATE
    window.__landmarks = null
    window.__lastDetect = null

    // 🚀 START NEW PIPELINE
    const stop = runPipeline(media, canvas, state)

    // 🛡️ Wrap safely
    stopPipelineRef.current = () => {
      try {
        if (typeof stop === "function") {
          stop()
        }
      } catch (e) {
        console.warn("⚠️ Safe stop prevented crash:", e)
      }
    }
  }
  useEffect(() => {

    const boot = async () => {
      try {
        setBootStage("loading")

        await initFaceMesh()   // 🔥 wait properly

        await new Promise(r => setTimeout(r, 200)) // small buffer

        setEngineReady(true)
        // 🔥 process queued file
        if (pendingFileRef.current) {
          const file = pendingFileRef.current

          if (file.type.startsWith("image")) {
            loadImage(file)
          } else {
            loadVideo(file)
          }

          pendingFileRef.current = null
        }

        setTimeout(() => {
          setBootStage("ready")
        }, 300)

      } catch (e) {
        console.error("❌ Engine failed:", e)
      }
    }

    boot()

    const open = () => {
      if (!engineReady) return
      startCamera()
    }

    window.addEventListener("open-camera", open)

    return () => window.removeEventListener("open-camera", open)

  }, [engineReady])


  // useEffect(() => {
  //   const ping = async () => {
  //     try {
  //       console.log("🏓 pinging server...")

  //       const res = await fetch("https://face-tunepro.onrender.com", {
  //         method: "GET",
  //         cache: "no-store"
  //       })

  //       console.log("✅ server awake:", res.status)
  //     } catch (e) {
  //       console.log("❌ ping failed")
  //     }
  //   }

  //   ping()
  //   const id = setInterval(ping, 10 * 60 * 1000)

  //   return () => clearInterval(id)
  // }, [])
  
  /* ---------- CAMERA (FIXED) ---------- */

  const getStream = async () => {

    const configs = [
      {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      },
      {
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ]

    for (let config of configs) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(config)
        return stream
      } catch (e) {
        console.warn("❌ failed:", e.name)
      }
    }

    throw new Error("No camera config worked")
  }

  const cleanupMedia = () => {
    console.log("🧹 cleaning previous media...")

    // 🛑 stop pipeline
    if (stopPipelineRef.current) {
      try {
        stopPipelineRef.current()
      } catch (e) {
        console.warn("pipeline stop error", e)
      }
      stopPipelineRef.current = null
    }

    // 🛑 stop recorder
    if (recorderRef.current?.stop) {
      try {
        recorderRef.current.stop()
      } catch (e) {
        console.warn("recorder stop error", e)
      }
      recorderRef.current = null   // 🔥 ADD THIS
    }

    // 🛑 stop camera stream
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }

    // 🛑 stop HTML video playback (uploaded videos)
    if (mediaRef.current) {
      try {
        mediaRef.current.pause?.()
        mediaRef.current.src = ""
      } catch {}
    }

    // 🧼 reset refs
    mediaRef.current = null
    landmarksRef.current = null

    // 🧼 reset UI states
    setRecording(false)
    setProgress(0)
    setExportStatus(null)
  }

  const goHome = () => {
    console.log("🏠 GO HOME")

    // stop everything
    cleanupMedia()

    // clear canvas
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    // reset UI state
    setRecording(false)
    setProgress(0)
    setExportStatus(null)
    setMediaLoading(null)
    setFlash(null)

    // clear refs
    mediaRef.current = null
    landmarksRef.current = null
    recorderRef.current = null

    // reset editor values (important)
    state.reset?.()
  }

  const startCamera = async () => {
    cleanupMedia()
    setCameraLoading(true)
    try{

      const stream = await getStream()

      const video = videoRef.current
      const canvas = canvasRef.current

      if (!video || !canvas) {
        console.warn("video/canvas not ready")
        return
      }

      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      video.autoplay = true

      const track = stream.getVideoTracks()[0]

      video.onloadedmetadata = async () => {
        await video.play()
        setCameraLoading(false)

        // 🔥 allow resolution to stabilize
        await new Promise(r => setTimeout(r, 120))

        
        const updatedTrack = stream.getVideoTracks()[0]
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            startPipeline(video)
          })
        })
      }

      mediaRef.current = video
      landmarksRef.current = null

    }catch(e){
      console.warn("camera blocked",e)
    }
  }

  /* ---------- IMAGE ---------- */

  const loadImage = (file) => {
    if (!engineReady) {
      console.warn("⏳ Engine not ready")
      return
    }

    cleanupMedia()
    setMediaLoading(true) // 🔥 START LOADING

    const img = new Image()
    img.src = URL.createObjectURL(file)

    img.onload = () => {
      mediaRef.current = img
      landmarksRef.current = null

      startPipeline(img)

      setMediaLoading(false) // ✅ DONE
    }

    img.onerror = () => {
      console.warn("❌ image load failed")
      setMediaLoading(null)
    }
  }

  /* ---------- VIDEO ---------- */

  const loadVideo = (file) => {

    if (!engineReady) {
      console.warn("⏳ Engine not ready")
      return
    }

    cleanupMedia()
    setMediaLoading(true) // 🔥 START LOADING

    const vid = document.createElement("video")
    vid.src = URL.createObjectURL(file)
    vid.loop = false
    vid.muted = true
    vid.playsInline = true
    vid.autoplay = true

    vid.onloadeddata = () => {
      vid.play()
      mediaRef.current = vid
      landmarksRef.current = null

      startPipeline(vid)

      setMediaLoading(false) // ✅ DONE

      const enableAudio = () => {
        vid.muted = false
        vid.play()
      }
      const unlockAudio = () => {
        vid.muted = false
        vid.play()
        window.removeEventListener("click", unlockAudio)
      }

      window.addEventListener("click", unlockAudio)
    }

    vid.onerror = () => {
      console.warn("❌ video load failed")
      setMediaLoading(null)
    }
  }

  /* ---------- DOWNLOAD ---------- */

  const download = async () => {

    function supportsWebCodecs() {
      return (
        "VideoEncoder" in window &&
        "AudioEncoder" in window
      )
    }
    
    function isIOS() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    }

    if (recording) return

    const canvas = canvasRef.current
    const media = mediaRef.current

    if (!canvas || !media) return

    setExportStatus("preparing")

    await forceRenderFrame()

    if (media.tagName === "VIDEO" && !media.srcObject) {
      media.muted = false
      const wasLooping = media.loop
      media.loop = false

      media.currentTime = 0
      await media.play()
      await forceRenderFrame()
      
      let lastProgress = 0
      const handlers = {
        onStart: (state) => {
          if (state) {
            setExportStatus(state)
            return
          }

          setRecording(true)
          setExportStatus("recording")
        },

        onProgress: (p) => {
          const next = Math.round(p * 100)

          if (next !== lastProgress) {
            lastProgress = next
            setProgress(next)
          }
        },

        onStop: () => {
          console.log("🛑 RECORD STOP")

          media.loop = wasLooping
          setRecording(false)
          setProgress(0)

          if (cancelledRef.current) {
            cancelledRef.current = false
            setExportStatus(null)
            return
          }

          setTimeout(() => setExportStatus(null), 1500)
        }
      }


      // 🔥 HYBRID SWITCH
      if (!isIOS() && supportsWebCodecs()) {
        // 🟢 Desktop / Android
        recorderRef.current = recordCanvasVideo(canvas, media, handlers)
      } else {
        console.warn("🍎 Using iPhone fallback")

        try {
          fallbackRecord(canvas, media, handlers)
        } catch (e) {
          console.error("Fallback crashed:", e)
          setExportStatus(null)
        }

        recorderRef.current = null
      }
    } else {
      downloadImage(canvas)
      setExportStatus("done")
      setTimeout(() => setExportStatus(null), 1200)
    }
  }
  /* ---------- PLAY / PAUSE ---------- */

  const togglePlay = async () => {
    const media = mediaRef.current

    if (!media || media.tagName !== "VIDEO") return

    try {
      if (media.paused) {
        await media.play()
        setFlash("play")
      } else {
        media.pause()
        setFlash("pause")
      }
    } catch (e) {
      console.warn("⚠️ play/pause error:", e)
    }

    setTimeout(() => setFlash(null), 500)
  }

  /* ---------- DRAG EDIT ---------- */

  const onDown = (e) => {

    if(!state.category || !state.control) return

    editingRef.current = true
    movedRef.current = false

    startRef.current = {
      x: e.clientX,
      y: e.clientY
    }

    startValueRef.current = state.getValue()
  }

  const onMove = (e) => {

    if(!editingRef.current) return

    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y

    // 🔥 detect actual drag
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedRef.current = true
    }

    let delta = 0

    if(
      state.control === "width" ||
      state.control === "distance" ||
      state.control === "narrow"
    ){
      delta = dx * 0.005
    }
    else{
      delta = -dy * 0.005
    }

    const next = startValueRef.current + delta

    const clamped = Math.max(-1, Math.min(1, next))

    state.setValue(clamped)

    // 🔥 FORCE immediate UI update (important)
    startValueRef.current = clamped
  }

  const onUp = () => {
    editingRef.current = false
    startValueRef.current = state.getValue()
  }

  /* ---------- TOUCH ---------- */

  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    onDown({ clientX: t.clientX, clientY: t.clientY })
  }

  const onTouchMove = (e) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    onMove({ clientX: t.clientX, clientY: t.clientY })
  }

  const onTouchEnd = ()=> onUp()
  const isCategoryOpen = !!state.category
  
  useEffect(() => {
    console.log("📦 exportStatus:", exportStatus)
  }, [exportStatus])

  useEffect(() => {
    console.log("🎥 recording:", recording)
  }, [recording])
  
  return (

    <div
      className="preview"
      style={{
        position: "relative",
        flex: 1,              // 🔥 THIS FIXES EVERYTHING
        width: "100%",
        overflow: "hidden",
        background: "black"
      }}
    >

      <button
        onMouseDown={onHomeDown}
        onMouseMove={onHomeMove}
        onMouseUp={onHomeUp}
        onMouseLeave={onHomeUp}

        onTouchStart={(e)=>{
          const t = e.touches[0]
          onHomeDown({ clientX:t.clientX, clientY:t.clientY })
        }}
        onTouchMove={(e)=>{
          const t = e.touches[0]
          onHomeMove({ clientX:t.clientX, clientY:t.clientY })
        }}
        onTouchEnd={onHomeUp}

        onClick={() => {
          if (!movedHomeRef.current) {
            goHome()
          }
        }}

        style={{
          position: "absolute",
          left: homePos.x,
          top: homePos.y,
          zIndex: 9999,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "white",
          cursor: "grab",
          fontSize: "10px"
        }}
      >
        🏠
      </button>

      {bootStage !== "ready" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 999,
            background: "black",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            transition: "opacity 0.4s ease",
            opacity: bootStage === "loading" ? 1 : 0,
            pointerEvents: "all"
          }}
        >
          <div style={{
            fontSize: "22px",
            fontWeight: "600",
            marginBottom: "12px"
          }}>
            Face Editor
          </div>

          <div style={{
            fontSize: "13px",
            opacity: 0.7
          }}>
            Initializing engine...
          </div>

          <div style={{
            marginTop: "20px",
            width: "28px",
            height: "28px",
            border: "3px solid rgba(255,255,255,0.2)",
            borderTop: "3px solid white",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
        </div>
      )}

      {/* 🎥 CANVAS */}
      <canvas
        ref={canvasRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (movedRef.current) return  // prevents drag-triggered click
          togglePlay()
        }}
        style={{
          position: "absolute",
          touchAction: "none",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "black",
          zIndex: 1,
          cursor: editingRef.current ? "grabbing" : "grab"
        }}
      />

      {/* 🌫 TOP GRADIENT */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "120px",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)",
          pointerEvents: "none",
          zIndex: 2
        }}
      />

      {/* 🌫 BOTTOM GRADIENT */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "160px",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
          pointerEvents: "none",
          zIndex: 2
        }}
      />

      {/* 🔝 TOP BAR */}
      <div
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 30
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            padding: "8px 10px",
            borderRadius: "999px",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(12px)"
          }}
        >

          {/* Upload */}
          <label style={btnStyle}>
            Upload
            <input
              type="file"
              hidden
              accept="image/*,video/*"
              onChange={(e) => {
                const file = e.target.files[0]
                if (!file) return

                // 🔥 queue if engine not ready
                if (!engineReady) {
                  pendingFileRef.current = file
                  return
                }

                file.type.startsWith("image")
                  ? loadImage(file)
                  : loadVideo(file)
              }}
            />
          </label>

          {/* Download */}
          <button
            onClick={download}
            disabled={exportStatus === "preparing" || exportStatus === "recording"}
            style={{
              ...btnStyle,
              opacity: exportStatus ? 0.6 : 1
            }}
          >
            {exportStatus === "recording"
              ? `${progress}%`
              : exportStatus === "preparing"
              ? "Preparing..."
              : "Download"}
          </button>

          {/* Cancel */}
          {(recording || exportStatus === "preparing" || mediaLoading) && (
            <button
              onClick={() => {
                console.log("❌ CANCEL CLICKED")

                cancelledRef.current = true

                // 🛑 cancel export
                if (recorderRef.current?.stop) {
                  recorderRef.current.stop()
                }

                // 🛑 cancel loading
                if (mediaLoading) {
                  cleanupMedia()
                  setMediaLoading(null)
                }

                if (exportStatus === "preparing") {
                  setExportStatus(null)
                }
              }}
              style={btnStyle}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ⏳ CAMERA LOADING */}
      {cameraLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            background: "rgba(0,0,0,0.4)",
            zIndex: 15
          }}
        >
          Opening camera...
        </div>
      )}

      {/* 📂 MEDIA LOADING */}
      {mediaLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            background: "rgba(0,0,0,0.5)",
            zIndex: 15,
            animation: "spin 0.3s linear infinite"
          }}
        >
          ....
        </div>
      )}

      {/* ▶️ PLAY/PAUSE */}
      {flash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "60px",
            color: "white",
            opacity: 0.85,
            pointerEvents: "none",
            zIndex: 15
          }}
        >
          {flash === "play" ? "▶️" : "⏸"}
        </div>
      )}

      {/* 📦 EXPORT OVERLAY */}
      {exportStatus && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            zIndex: 20,
            pointerEvents: "none"
          }}
        >
          <div style={{ pointerEvents: "auto", textAlign: "center" }}>
            
            <div style={{ fontSize: "16px", marginBottom: "10px" }}>
              {exportStatus === "preparing" && "Preparing file..."}
              {exportStatus === "recording" && "Recording video"}
              {exportStatus === "uploading" && "Uploading video..."}
              {exportStatus === "processing" && "Processing video..."}
              {exportStatus === "downloading" && "Downloading file..."}
              {exportStatus === "done" && "Saved successfully"}
            </div>

            {exportStatus === "recording" && (
              <>
                <div style={{
                  width: "200px",
                  height: "6px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "10px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "white"
                  }} />
                </div>

                <div style={{ marginTop: "6px", fontSize: "12px" }}>
                  {progress}%
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* 🔢 VALUE DISPLAY */}
      {state.control && (
        <div
          style={{
            position: "absolute",
            top: "max(70px, env(safe-area-inset-top) + 50px)",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: "999px",
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
            color: "white",
            fontSize: "13px",
            zIndex: 10
          }}
        >
          {state.control.toUpperCase()} · {Math.round(state.getValue() * 100)}%
        </div>
      )}

      {/* 📹 HIDDEN VIDEO */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: "1px",
          height: "1px"
        }}
      />

    </div>
  )
}