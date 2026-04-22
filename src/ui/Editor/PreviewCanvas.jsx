import { useEffect, useRef, useState } from "react"
import { useEditor } from "../../state/editorState"
import { initFaceMesh, getLandmarks } from "../../engine/vision/facemesh"
import { runPipeline } from "../../engine/pipeline/pipeline.js"
import { downloadImage, recordCanvasVideo } from "../../engine/export/exporter"



export default function PreviewCanvas(){

  const state = useEditor()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const mediaRef = useRef(null)

  const landmarksRef = useRef(null)
  const detectingRef = useRef(false)

  const [scale,setScale] = useState(1)
  const [offset,setOffset] = useState({x:0,y:0})
  const [flash,setFlash] = useState(null)

  /* editing */
  const editingRef = useRef(false)
  const startRef = useRef({x:0,y:0})
  const startValueRef = useRef(0)

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
  useEffect(()=>{
    initFaceMesh()

    const open = ()=> startCamera()
    window.addEventListener("open-camera", open)

    return ()=> window.removeEventListener("open-camera", open)

  },[])

  
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

  const startCamera = async () => {
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
    // 🛑 stop camera stream if running
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    const img = new Image()
    img.src = URL.createObjectURL(file)

    img.onload = () => {
      
      mediaRef.current = img
      landmarksRef.current = null

      startPipeline(img)
      
    }
  }

  /* ---------- VIDEO ---------- */

  const loadVideo = (file) => {
    // 🛑 stop camera stream if running
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    const vid = document.createElement("video")
    vid.src = URL.createObjectURL(file)
    vid.loop = true
    vid.muted = true
    vid.playsInline = true
    vid.autoplay = true

    vid.onloadeddata = () => {
      
      vid.play()
      mediaRef.current = vid
      landmarksRef.current = null

      startPipeline(vid)

      const enableAudio = () => {
        vid.muted = false
        vid.play()
      }
      document.addEventListener("click", enableAudio, { once: true })
    
      
    }
  }

  /* ---------- DOWNLOAD ---------- */

  const download = async () => {
    if (recording) {
      console.warn("⚠️ Already recording — blocked")
      return
    }
    const canvas = canvasRef.current
    const media = mediaRef.current

    if (!canvas || !media) {
      console.warn("❌ nothing to export")
      return
    }

    setExportStatus("preparing")

    // ✅ FORCE CLEAN FRAME
    await forceRenderFrame()

    
    // 🎬 VIDEO EXPORT
    if (media.tagName === "VIDEO" && !media.srcObject) {

      recorderRef.current = recordCanvasVideo(canvas, media, {
        withAudio: true,

        onStart: () => {
          setRecording(true)
          setExportStatus("recording")
        },

        onProgress: (p) => {
          const percent = Math.min(100, Math.round(p * 100))
          setProgress(percent)
        },

        onStop: () => {
          setRecording(true)
          setProgress(0)
          setExportStatus("done")

          setTimeout(() => setExportStatus(null), 1500)
        }
      })

    } else {
      // 🖼 IMAGE EXPORT
      downloadImage(canvas)

      setExportStatus("done")
      setTimeout(() => setExportStatus(null), 1200)
    }
  }
  /* ---------- PLAY / PAUSE ---------- */

  const togglePlay = () => {

    const media = mediaRef.current

    if(!media) return
    if(media.tagName !== "VIDEO") return

    if(media.paused){
      media.play()
      setFlash("play")
    }else{
      media.pause()
      setFlash("pause")
    }

    setTimeout(()=>setFlash(null),500)
  }

  /* ---------- DRAG EDIT ---------- */

  const onDown = (e) => {

    if(!state.category || !state.control) return

    editingRef.current = true

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
  return (
    <div
      className="preview"
      style={{
        position: "relative",
        width: "100vw",

        // 🔥 DYNAMIC HEIGHT (THIS IS THE FIX)
        height: isCategoryOpen
          ? "calc(100dvh - 180px)" // more space when open
          : "calc(100dvh - 110px)", // normal

        overflow: "hidden",
        background: "black",
        transition: "height 0.25s ease"
      }}
    >

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
          if (editingRef.current) return
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
          zIndex: 10
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
          {recording && (
            <button
              onClick={() => recorderRef.current?.stop?.()}
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
            zIndex: 20
          }}
        >
          <div style={{ fontSize: "16px", marginBottom: "10px" }}>
            {exportStatus === "preparing" && "Preparing file..."}
            {exportStatus === "recording" && "Recording video"}
            {exportStatus === "done" && "Saved successfully"}
          </div>

          {exportStatus === "recording" && (
            <>
              <div
                style={{
                  width: "200px",
                  height: "6px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "10px",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "white"
                  }}
                />
              </div>

              <div style={{ marginTop: "6px", fontSize: "12px" }}>
                {progress}%
              </div>
            </>
          )}
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