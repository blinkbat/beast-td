import { useEffect, useState } from 'react'
import { gameStore, UNIT_COST, type UnitType } from './game/gameStore'

interface UnitInfo {
  type: UnitType
  name: string
  role: 'Tower' | 'Unit'
  hotkey: string
  description: string
}

const UNITS: UnitInfo[] = [
  {
    type: 'archer',
    name: 'Archer',
    role: 'Tower',
    hotkey: '1',
    description: 'Attacks nearest part of the Beast. Effective vs flesh and hearts.',
  },
  {
    type: 'catapult',
    name: 'Catapult',
    role: 'Tower',
    hotkey: '2',
    description: 'Flings bombs that do area damage.',
  },
  {
    type: 'hireling',
    name: 'Hireling',
    role: 'Unit',
    hotkey: '3',
    description: 'Cleaves flesh readily, but cannot reach the Beast hearts.',
  },
]

export default function Hud() {
  const [gold, setGold] = useState(gameStore.getGold())
  const [selected, setSelected] = useState<UnitType | null>(gameStore.getSelectedUnit())

  useEffect(() => {
    return gameStore.subscribe((s) => {
      setGold(s.gold)
      setSelected(s.selectedUnit)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') gameStore.setSelectedUnit('archer')
      else if (e.key === '2') gameStore.setSelectedUnit('catapult')
      else if (e.key === '3') gameStore.setSelectedUnit('hireling')
      else if (e.key === 'Escape') gameStore.setSelectedUnit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hud">
      <div className="gold">{gold}g</div>
      <div className="unit-bar">
        {UNITS.map((u) => {
          const cost = UNIT_COST[u.type]
          const canAfford = gold >= cost
          const isSelected = selected === u.type
          const classes = [
            'unit-card',
            isSelected && 'selected',
            !canAfford && 'cant-afford',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={u.type}
              className={classes}
              onClick={() => gameStore.setSelectedUnit(isSelected ? null : u.type)}
              title={u.description}
            >
              <div className="unit-name">
                {u.name} <span className="unit-role">[{u.role}]</span>
              </div>
              <div className="unit-cost">
                {cost}g <span className="unit-hotkey">{u.hotkey}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
