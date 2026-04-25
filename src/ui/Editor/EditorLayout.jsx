import PreviewCanvas from "./PreviewCanvas"
import BottomPanel from "../controls/BottomPanel"


export default function EditorLayout(){
  return (
    <div className="editor">

      <PreviewCanvas />

      <BottomPanel />

    </div>
  )
}