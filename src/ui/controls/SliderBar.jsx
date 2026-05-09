import { useRef } from "react"
import { useEditor } from "../../state/editorState"

export default function SliderBar() {

  const state = useEditor()
  const value = state.getValue()

  // Double-tap detection for reset
  const lastTapRef = useRef(0)

  const handleSliderTap = () => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      // Double-tap → reset to zero
      state.setValue(0)
    }
    lastTapRef.current = now
  }

  const change = (e) => {
    const v = parseFloat(e.target.value)
    state.setValue(v)
  }

  const hasValue = value !== 0

  return (
    <div className="sliderWrap">

      <button
        className="undoBtn"
        onClick={() => state.undo()}
        title="Undo"
      >
        ↺
      </button>

      <div style={{ flex: 1, position: "relative" }}>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={value}
          onChange={change}
          onClick={handleSliderTap}
          style={{ width: "100%" }}
        />

        {/* Center tick mark */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "2px",
          height: "8px",
          background: "rgba(255,255,255,0.25)",
          borderRadius: "1px",
          pointerEvents: "none"
        }} />
      </div>

      {/* Reset button — only visible when value is non-zero */}
      {hasValue && (
        <button
          className="undoBtn"
          onClick={() => state.setValue(0)}
          title="Reset to zero"
          style={{
            fontSize: "11px",
            opacity: 0.7,
            padding: "2px 6px",
            borderRadius: "6px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white",
            cursor: "pointer"
          }}
        >
          ✕
        </button>
      )}

      <button
        className="undoBtn"
        onClick={() => state.redo()}
        title="Redo"
      >
        ↻
      </button>

    </div>
  )
}
