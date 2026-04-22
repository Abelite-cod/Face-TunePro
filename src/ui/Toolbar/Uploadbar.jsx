import { useRef } from "react"
import media from "../../engine/core/media"

export default function UploadBar(){

  const inputRef = useRef()

  const processFile = (file) => {

    const url = URL.createObjectURL(file)

    if (file.type.startsWith("image")) {
      const img = new Image()
      img.src = url

      img.onload = () => {
        media.image(img)
      }
    }

    if (file.type.startsWith("video")) {
      const video = document.createElement("video")
      video.src = url
      video.autoplay = true
      video.loop = true
      video.muted = true
      video.playsInline = true

      video.onloadeddata = () => {
        media.video(video)
      }
    }
  }

  return (
    <div className="uploadBar">

      <button
        className="uploadBtn"
        onClick={()=>inputRef.current.click()}
      >
        Upload
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={(e)=>processFile(e.target.files[0])}
        hidden
      />

    </div>
  )
}