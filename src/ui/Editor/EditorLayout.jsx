import PreviewCanvas from "./PreviewCanvas"
import BottomPanel from "../controls/BottomPanel"
import Timeline from "./Timeline"

export default function EditorLayout(){
  return (
    <div className="editor">

      <PreviewCanvas />

      <Timeline />

      <BottomPanel />

    </div>
  )
}