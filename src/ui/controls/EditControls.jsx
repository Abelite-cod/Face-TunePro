import { CONTROL_CONFIG } from "../controls/controlConfig"
import { useEditor } from "../../state/editorState"

export default function EditControls(){

  const state = useEditor()
  const { category, setCategory, setControl } = state

  const tools = CONTROL_CONFIG[category]?.tools || []

  return (
    <div className="editControls">

      {/* SUB CONTROLS */}
      <div className="subControls">
        {tools.map(tool=>(
          <button
            key={tool}
            onClick={()=>setControl(tool)}
          >
            {tool}
          </button>
        ))}
      </div>

      {/* CATEGORY TABS */}
      <div className="categoryTabs">
        {Object.keys(CONTROL_CONFIG).map(cat=>(
          <button
            key={cat}
            className={category===cat?"active":""}
            onClick={()=>setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

    </div>
  )
}