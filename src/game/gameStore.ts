export type UnitType = 'archer' | 'catapult' | 'hireling'

export const UNIT_COST: Record<UnitType, number> = {
  archer: 20,
  catapult: 40,
  hireling: 15,
}

export const STARTING_GOLD = 100

interface GameState {
  gold: number
  selectedUnit: UnitType | null
}

const state: GameState = {
  gold: STARTING_GOLD,
  selectedUnit: null,
}

type Listener = (state: Readonly<GameState>) => void
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l(state)
}

export const gameStore = {
  get(): Readonly<GameState> {
    return state
  },
  getGold(): number {
    return state.gold
  },
  getSelectedUnit(): UnitType | null {
    return state.selectedUnit
  },
  spendGold(amount: number): boolean {
    if (state.gold < amount) return false
    state.gold -= amount
    notify()
    return true
  },
  setSelectedUnit(unit: UnitType | null) {
    if (state.selectedUnit === unit) return
    state.selectedUnit = unit
    notify()
  },
  subscribe(cb: Listener): () => void {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },
}
