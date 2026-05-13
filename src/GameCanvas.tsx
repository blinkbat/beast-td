import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createWorld } from './game/world'

const STREET_OFFSET = new THREE.Vector3(0, 4, 12)
const BIRDS_OFFSET = new THREE.Vector3(0, 50, 5)
const INITIAL_ZOOM = 0.4
const ZOOM_WHEEL_SENSITIVITY = 0.0008
const ZOOM_DAMP_LAMBDA = 8
const CAM_SPEED = 14
const CAM_LIMIT = 15
const PANNABLE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0c10)

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000,
    )
    const camTarget = new THREE.Vector3(0, 0, 0)
    const camOffset = new THREE.Vector3()
    let zoomTarget = INITIAL_ZOOM
    let zoomCurrent = INITIAL_ZOOM

    const applyCamera = () => {
      camOffset.copy(STREET_OFFSET).lerp(BIRDS_OFFSET, zoomCurrent)
      camera.position.copy(camTarget).add(camOffset)
      camera.lookAt(camTarget)
    }
    applyCamera()

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    let world = createWorld({ scene, camera, canvas: renderer.domElement })

    let alive = true
    if (import.meta.hot) {
      import.meta.hot.accept('./game/world', (newModule) => {
        if (!alive || !newModule) return
        world.dispose()
        world = (newModule as unknown as typeof import('./game/world')).createWorld({
          scene,
          camera,
          canvas: renderer.domElement,
        })
      })
    }

    const keys = new Set<string>()
    const onKeyDown = (e: KeyboardEvent) => {
      if (PANNABLE_KEYS.has(e.key)) {
        e.preventDefault()
        keys.add(e.key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTarget = THREE.MathUtils.clamp(
        zoomTarget + e.deltaY * ZOOM_WHEEL_SENSITIVITY,
        0,
        1,
      )
    }
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let dx = 0
      let dz = 0
      if (keys.has('ArrowLeft')) dx -= 1
      if (keys.has('ArrowRight')) dx += 1
      if (keys.has('ArrowUp')) dz -= 1
      if (keys.has('ArrowDown')) dz += 1
      if (dx !== 0 || dz !== 0) {
        const len = Math.hypot(dx, dz)
        camTarget.x = THREE.MathUtils.clamp(
          camTarget.x + (dx / len) * CAM_SPEED * dt,
          -CAM_LIMIT,
          CAM_LIMIT,
        )
        camTarget.z = THREE.MathUtils.clamp(
          camTarget.z + (dz / len) * CAM_SPEED * dt,
          -CAM_LIMIT,
          CAM_LIMIT,
        )
      }

      zoomCurrent = THREE.MathUtils.damp(zoomCurrent, zoomTarget, ZOOM_DAMP_LAMBDA, dt)
      applyCamera()

      world.tick(dt)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onResize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      world.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="game-canvas" />
}
