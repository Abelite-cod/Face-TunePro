import { useEffect, useState } from "react"
import editorState from "../../state/editorState"
import { CONTROL_CONFIG } from "./controlConfig"

export default function CategoryTabs() {

  const [, update] = useState(0)

  useEffect(() => {
    const unsub = editorState.subscribe(() => update(n => n + 1))
    return unsub
  }, [])

  const categories = Object.keys(CONTROL_CONFIG)

  return (
    <div className="categoryTabs">

      {categories.map(cat => {

        const active  = editorState.category === cat
        const hasEdit = editorState.hasEdits(cat)

        return (
          <button
            key={cat}
            className={active ? "active" : ""}
            onClick={() => {
              editorState.setCategory(cat)

              if (cat === "camera") {
                window.dispatchEvent(new Event("open-camera"))
              }
            }}
            style={{ position: "relative" }}
          >
            <CategoryIcon name={CONTROL_CONFIG[cat].icon} />
            <span>{cat}</span>

            {/* 🔵 Edit indicator dot */}
            {hasEdit && (
              <span style={{
                position: "absolute",
                top: "2px",
                right: "8px",
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: active ? "white" : "rgba(255,255,255,0.55)",
                boxShadow: active ? "0 0 4px rgba(255,255,255,0.6)" : "none",
                pointerEvents: "none"
              }} />
            )}
          </button>
        )

      })}

    </div>
  )
}

function CategoryIcon({ name }) {

  switch (name) {

    case "camera":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4 7H7L9 5H15L17 7H20V19H4Z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      )

    case "eye":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M2 12C5 6 19 6 22 12C19 18 5 18 2 12" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )

    case "nose":
      return <svg viewBox="0 0 24 24"><path d="M12 3C8 9 8 15 12 21C16 15 16 9 12 3Z" /></svg>

    case "lips":
      return <svg viewBox="0 0 24 24"><path d="M2 12C6 9 18 9 22 12C18 15 6 15 2 12Z" /></svg>

    case "jaw":
      return <svg viewBox="0 0 24 24"><path d="M4 8C4 18 20 18 20 8" /></svg>

    case "face":
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>

    case "spark":
      return <svg viewBox="0 0 24 24"><path d="M12 2L14 8L22 12L14 16L12 22L10 16L2 12L10 8Z" /></svg>

    case "filter":
      return <svg viewBox="0 0 24 24"><path d="M3 5H21L14 13V20L10 18V13Z" /></svg>

    case "eyebrows":
      return <svg viewBox="0 0 24 24"><path d="M3 10C7 6 17 6 21 10" /></svg>

    default:
      return null
  }
}
