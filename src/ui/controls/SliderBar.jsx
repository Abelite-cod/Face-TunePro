import { useEditor } from "../../state/editorState"

export default function SliderBar(){

  const state = useEditor()

  const value = state.getValue()

  const change = (e)=>{
    const v = parseFloat(e.target.value)
    state.setValue(v)
  }

  return (
    <div className="sliderWrap">

      <button
        className="undoBtn"
        onClick={()=>state.undo()}
      >
        ↺
      </button>

      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={change}
      />

      <button
        className="undoBtn"
        onClick={()=>state.redo()}
      >
        ↻
      </button>

    </div>
  )
}