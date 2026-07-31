export interface SketchbookUiState {
  available: boolean
  open: boolean
}

let state: SketchbookUiState = { available: false, open: false }
const listeners = new Set<() => void>()

function publish(next: SketchbookUiState) {
  if (next.available === state.available && next.open === state.open) return
  state = next
  for (const listener of listeners) listener()
}

export const sketchbookUi = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return state
  },
  setAvailable(available: boolean) {
    publish({ available, open: available ? state.open : false })
  },
  open() {
    if (state.available) publish({ available: true, open: true })
  },
  close() {
    publish({ ...state, open: false })
  },
}
