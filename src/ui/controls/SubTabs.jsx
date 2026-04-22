import { useEffect } from "react"
import { useEditor } from "../../state/editorState"
import { CONTROL_CONFIG } from "./controlConfig"

export default function SubTabs(){

  const state = useEditor()
  const category = state.category
  const config = category ? CONTROL_CONFIG[category] : null

  /* ✅ ALWAYS run hook */
  useEffect(()=>{
    if(!category || !config) return

    if(!state.control || !config.tools.includes(state.control)){
      state.setControl(config.tools[0])
    }
  },[category, config])

  /* ✅ AFTER hooks → safe to return */
  if(!category || !config) return null

  return (
    <div className="subTabs">

      {config.tools.map(tool => {

        const active = state.control === tool

        return (
          <button
            key={tool}
            className={active ? "active" : ""}
            onClick={()=>state.setControl(tool)}
          >
            <ToolIcon name={tool}/>
            <span>{tool}</span>
          </button>
        )

      })}

    </div>
  )
}


/* ---------- TOOL ICONS ---------- */

function ToolIcon({name}){

switch(name){

case "width":
return <svg viewBox="0 0 24 24"><path d="M3 12H21"/><path d="M7 8L3 12L7 16"/><path d="M17 8L21 12L17 16"/></svg>

case "height":
return <svg viewBox="0 0 24 24"><path d="M12 3V21"/><path d="M8 7L12 3L16 7"/><path d="M8 17L12 21L16 17"/></svg>

case "size":
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>

case "tilt":
return <svg viewBox="0 0 24 24"><path d="M4 16L20 8"/></svg>

case "distance":
return <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>

case "narrow":
return <svg viewBox="0 0 24 24"><path d="M8 12H16"/></svg>

case "lift":
return <svg viewBox="0 0 24 24"><path d="M12 18V6"/></svg>

case "tip":
return <svg viewBox="0 0 24 24"><path d="M12 6L18 18H6Z"/></svg>

case "round":
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>

case "full":
return <svg viewBox="0 0 24 24"><path d="M4 12C8 9 16 9 20 12"/></svg>

case "thick":
return <svg viewBox="0 0 24 24"><path d="M4 12H20"/></svg>

case "shape":
return <svg viewBox="0 0 24 24"><path d="M4 14C8 10 16 18 20 10"/></svg>

case "arch":
return <svg viewBox="0 0 24 24"><path d="M4 14C8 6 16 6 20 14"/></svg>

case "chin":
return <svg viewBox="0 0 24 24"><path d="M4 14C8 6 16 6 20 14"/></svg>

case "sharpness":
return <svg viewBox="0 0 24 24"><path d="M12 3L15 9L21 12L15 15L12 21"/></svg>

case "smooth":
return <svg viewBox="0 0 24 24"><path d="M4 14C8 12 16 12 20 14"/></svg>

case "clarity":
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>

case "detail":
return <svg viewBox="0 0 24 24"><path d="M3 12H21"/></svg>

case "grayscale":
return <svg viewBox="0 0 24 24"><path d="M3 3H21V21H3Z"/></svg>

case "hue":
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>

case "bw":
return <svg viewBox="0 0 24 24"><path d="M12 3V21"/></svg>

case "brightness":
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>

case "contrast":
return <svg viewBox="0 0 24 24"><path d="M12 3V21"/></svg>

default:
return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>

}
}