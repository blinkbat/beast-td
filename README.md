# Beast TD

A small 3D tower-defense prototype: place archers, catapults, and hirelings to chew through a multi-segmented beast that crawls along a path.

## Stack

- React 19 (HUD only)
- TypeScript
- Vite
- three.js (scene + game loop)

## Architecture

The game loop is raw three.js in [src/game/world.ts](src/game/world.ts), driven every frame by `requestAnimationFrame` in [src/GameCanvas.tsx](src/GameCanvas.tsx). React is used only for the HUD; HUD state lives in a tiny pub/sub store in [src/game/gameStore.ts](src/game/gameStore.ts) so React re-renders happen only when gold or selection changes — never inside the tick.

## Run

```
npm install
npm run dev
```

## Build / preview / lint

```
npm run build
npm run preview
npm run lint
```

## Controls

- Arrow keys — pan camera
- Mouse wheel — zoom (street view → bird's-eye)
- `1` / `2` / `3` — select archer / catapult / hireling
- `Esc` — cancel selection
- Left-click — place the selected unit on a buildable cell (catapult: then click again to confirm aim)
- Right-click — cancel pending placement / catapult retarget
- Left-click an existing catapult — retarget it
