import { useEffect, useState } from "react"

class EditorState {

  category = null
  control  = null

  /* GLOBAL EDIT VALUES */
  values = {}

  /* HISTORY */
  history = []
  future  = []

  listeners = []

  /* ---------- subscribe ---------- */

  subscribe(fn) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  notify() {
    this.listeners.forEach(l => l())
  }

  /* ---------- category ---------- */

  setCategory(category) {
    this.category = category
    this.notify()
  }

  /* ---------- control ---------- */

  setControl(control) {
    this.control = control
    this.notify()
  }

  /* ---------- VALUE ---------- */

  setValue(value) {
    if (!this.category || !this.control) return

    const key  = `${this.category}.${this.control}`
    const prev = this.values[key] ?? 0
    if (prev === value) return

    /* save history */
    this.history.push(JSON.stringify(this.values))
    this.future = []

    this.values[key] = value

    this.notify()
  }

  getValue() {
    if (!this.category || !this.control) return 0

    const key = `${this.category}.${this.control}`
    return this.values[key] ?? 0
  }

  /* ---------- HAS EDITS FOR CATEGORY ---------- */

  hasEdits(category) {
    if (!category) return false
    for (let key in this.values) {
      const [cat] = key.split(".")
      if (cat === category && this.values[key] !== 0) return true
    }
    return false
  }

  /* ---------- GET ALL CONTROLS FOR CATEGORY ---------- */

  getAll(category) {
    if (!category) return {}

    const controls = {}

    for (let key in this.values) {
      const [cat, control] = key.split(".")
      if (cat === category) {
        controls[control] = this.values[key]
      }
    }

    return controls
  }

  /* ---------- UNDO ---------- */

  undo() {
    if (!this.history.length) return

    this.future.push(JSON.stringify(this.values))
    this.values = JSON.parse(this.history.pop())

    this.notify()
  }

  /* ---------- REDO ---------- */

  redo() {
    if (!this.future.length) return

    this.history.push(JSON.stringify(this.values))
    this.values = JSON.parse(this.future.pop())

    this.notify()
  }

  /* ---------- RESET ---------- */

  reset() {
    this.category = null
    this.control  = null
    this.values   = {}
    this.history  = []
    this.future   = []
    this.notify()
  }

}

const editorState = new EditorState()
export default editorState


/* ---------- REACT HOOK ---------- */

export function useEditor() {

  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = editorState.subscribe(() => {
      setTick(t => t + 1)
    })
    return unsub
  }, [])

  return editorState
}
