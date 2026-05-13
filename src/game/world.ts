import * as THREE from 'three'
import { gameStore, UNIT_COST, type UnitType } from './gameStore'

const SEGMENT_COUNT = 6
const SEGMENT_SPACING = 2.0
const BEAST_SPEED = 0.6
const HEART_HP = 40

type ChunkSize = 'small' | 'medium' | 'large'

const CHUNK_HP: Record<ChunkSize, number> = { small: 6, medium: 10, large: 14 }
const CHUNK_DIMS: Record<ChunkSize, [number, number, number]> = {
  small: [0.5, 0.5, 0.5],
  medium: [0.85, 0.65, 0.85],
  large: [1.3, 0.8, 0.85],
}
const CHUNK_LAYOUT: { size: ChunkSize; offset: [number, number, number] }[] = [
  { size: 'large', offset: [0, 0.0, -0.35] },
  { size: 'medium', offset: [0, 0.35, 0.3] },
  { size: 'small', offset: [0.5, -0.15, 0.2] },
  { size: 'small', offset: [-0.5, -0.15, 0.2] },
]

const DEBRIS_GRAVITY = 14
const DEBRIS_BOUNCE = 0.45
const DEBRIS_FRICTION = 0.78
const DEBRIS_LIFE = 8
const DEBRIS_REST_VEL = 0.4
const SINK_DURATION = 1.2
const GROUND_Y = -0.5
const CATAPULT_COOLDOWN = 4
const CATAPULT_DAMAGE = 8
const CATAPULT_AOE_RADIUS = 1.6
const CATAPULT_RANGE = 12
const CATAPULT_MIN_RANGE = 3
const BOMB_FLIGHT_TIME = 1.5
const BOMB_PEAK_HEIGHT = 4
const ARM_PIVOT_Y = 0.7
const CATAPULT_ARM_REST = -Math.PI / 6
const CATAPULT_ARM_PEAK = (-2 * Math.PI) / 3
const HARD_PITCH_DURATION = 0.12
const SOFT_RESET_DURATION = 0.55
const IMPACT_FLASH_DURATION = 0.35
const IMPACT_FLASH_START = 0.3
const IMPACT_FLASH_END = 1.6
const IMPACT_WAVE_DURATION = 0.55
const IMPACT_WAVE_END_SCALE = CATAPULT_AOE_RADIUS / 0.5
const HIRELING_SPEED = 2.2
const HIRELING_LEASH = 5
const HIRELING_AGGRO = 10
const HIRELING_ATTACK_RANGE = 1.0
const HIRELING_ATTACK_RANGE_HOLD = 1.5
const HIRELING_ATTACK_INTERVAL = 0.55
const HIRELING_ATTACK_COMMIT = 0.9
const HIRELING_DAMAGE = 4
const HIRELING_PATH_BUFFER = 0.85
const HIRELING_HIRELING_BUFFER = 0.4
const TOWER_OBSTACLE_RADIUS = 0.55
const HIRELING_HOP_PER_SEC = 3
const HIRELING_HOP_HEIGHT = 0.12
const HIRELING_SWING_DURATION = 0.3
const DAGGER_REST_Z = 0.12
const DAGGER_STAB_REACH = 0.28
const RECOIL_DURATION = 0.18
const RECOIL_DISTANCE = 0.07
const GUN_RANGE = 9
const GUN_COOLDOWN = 2.5
const GUN_DAMAGE = 6
const TOWER_GROUND_Y = -0.5
const ARCHER_LOCAL_Y = 1.1
const ARCHER_WORLD_Y = TOWER_GROUND_Y + ARCHER_LOCAL_Y
const MUZZLE_LOCAL_Y = 0.3
const MUZZLE_LOCAL_Z = 0.2
const ARROW_SPEED = 8
const ARROW_MAX_AGE = 3
const HEART_HIT_RADIUS = 0.5
const CHUNK_HIT_RADIUS: Record<ChunkSize, number> = {
  small: 0.35,
  medium: 0.5,
  large: 0.65,
}
const SEGMENT_BROAD_RADIUS = 2.5

const GRID_SIZE = 40
const HALF_GRID = GRID_SIZE / 2
const PATH_BLOCK_RADIUS = 2.2

interface Chunk {
  mesh: THREE.Mesh
  hp: number
  alive: boolean
  size: ChunkSize
  localOffset: THREE.Vector3
}

interface Debris {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  angVel: THREE.Vector3
  age: number
  halfHeight: number
  meltTimer: number
}

interface Segment {
  group: THREE.Group
  chunks: Chunk[]
  heart: THREE.Mesh
  heartHp: number
  heartAlive: boolean
  position: THREE.Vector3
  tangent: THREE.Vector3
}

interface Gun {
  origin: THREE.Vector3
  archer: THREE.Group
  cooldown: number
  recoilT: number
}

interface Hireling {
  home: THREE.Vector3
  position: THREE.Vector3
  group: THREE.Group
  body: THREE.Group
  leftDagger: THREE.Mesh
  rightDagger: THREE.Mesh
  state: 'idle' | 'chasing' | 'attacking' | 'returning'
  targetSeg: Segment | null
  targetChunk: Chunk | null
  attackCooldown: number
  commitTimer: number
  runPhase: number
  swingT: number
}

interface Catapult {
  origin: THREE.Vector3
  group: THREE.Group
  arm: THREE.Group
  swing: THREE.Group
  bucket: THREE.Mesh
  targetPos: THREE.Vector3
  cooldown: number
  swingT: number
  hasFired: boolean
  pendingFirstTarget: boolean
}

interface Bomb {
  mesh: THREE.Mesh
  age: number
  totalFlight: number
  startPos: THREE.Vector3
  target: THREE.Vector3
}

interface ImpactFx {
  mesh: THREE.Mesh
  age: number
  maxAge: number
  startScale: number
  endScale: number
  startOpacity: number
}

interface ImpactLight {
  light: THREE.PointLight
  age: number
  maxAge: number
  peakIntensity: number
}

interface Arrow {
  group: THREE.Group
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  firingTower: Gun | null
}

interface AimTarget {
  seg: Segment
  chunk: Chunk | null
  aimPoint: THREE.Vector3
}

export interface WorldOpts {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
}

export interface World {
  tick(dt: number): void
  dispose(): void
}

const UP = new THREE.Vector3(0, 1, 0)

export function createWorld(opts: WorldOpts): World {
  const { scene, camera, canvas } = opts
  const disposables: { dispose(): void }[] = []
  const sceneObjects: THREE.Object3D[] = []

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.35 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.5
  ground.receiveShadow = true
  scene.add(ground)
  sceneObjects.push(ground)
  disposables.push(ground.geometry, ground.material)

  function enableShadowsOnGroup(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat: unknown = obj.material
      if (!Array.isArray(mat) && mat instanceof THREE.Material && mat.transparent) return
      obj.castShadow = true
      obj.receiveShadow = true
    })
  }

  const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x2c3138, 0x2c3138)
  grid.position.y = -0.49
  grid.material.transparent = true
  grid.material.opacity = 0.6
  scene.add(grid)
  sceneObjects.push(grid)
  disposables.push(grid.geometry, grid.material)

  scene.add(new THREE.AmbientLight(0xb8c8e8, 0.4))
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.4)
  sun.position.set(10, 16, 8)
  sun.target.position.set(0, 0, 0)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 60
  sun.shadow.camera.left = -22
  sun.shadow.camera.right = 22
  sun.shadow.camera.top = 22
  sun.shadow.camera.bottom = -22
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  scene.add(sun.target)
  sceneObjects.push(sun)
  sceneObjects.push(sun.target)

  const pathPoints = [
    new THREE.Vector3(-12, 0, -3),
    new THREE.Vector3(-6, 0, 3),
    new THREE.Vector3(0, 0, -3),
    new THREE.Vector3(6, 0, 3),
    new THREE.Vector3(12, 0, -2),
  ]
  const path = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.5)
  const pathLength = path.getLength()

  const pathGeom = new THREE.BufferGeometry().setFromPoints(path.getPoints(80))
  const pathMat = new THREE.LineBasicMaterial({ color: 0x3a3f47 })
  const pathLine = new THREE.Line(pathGeom, pathMat)
  scene.add(pathLine)
  sceneObjects.push(pathLine)
  disposables.push(pathGeom, pathMat)

  const blocked = new Set<string>()
  const samples = path.getSpacedPoints(300)
  for (const p of samples) {
    const ci = Math.floor(p.x + HALF_GRID)
    const cj = Math.floor(p.z + HALF_GRID)
    for (let di = -3; di <= 3; di++) {
      for (let dj = -3; dj <= 3; dj++) {
        const ni = ci + di
        const nj = cj + dj
        if (ni < 0 || ni >= GRID_SIZE || nj < 0 || nj >= GRID_SIZE) continue
        const cx = ni - HALF_GRID + 0.5
        const cz = nj - HALF_GRID + 0.5
        const dx = cx - p.x
        const dz = cz - p.z
        if (dx * dx + dz * dz <= PATH_BLOCK_RADIUS * PATH_BLOCK_RADIUS) {
          blocked.add(`${ni},${nj}`)
        }
      }
    }
  }

  const cellNearestPath = new Float32Array(GRID_SIZE * GRID_SIZE * 2)
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const cx = i - HALF_GRID + 0.5
      const cz = j - HALF_GRID + 0.5
      let bestX = samples[0].x
      let bestZ = samples[0].z
      let bestDistSq = Infinity
      for (const p of samples) {
        const dx = cx - p.x
        const dz = cz - p.z
        const dSq = dx * dx + dz * dz
        if (dSq < bestDistSq) {
          bestDistSq = dSq
          bestX = p.x
          bestZ = p.z
        }
      }
      const idx = (i * GRID_SIZE + j) * 2
      cellNearestPath[idx] = bestX
      cellNearestPath[idx + 1] = bestZ
    }
  }

  const overlayGeom = new THREE.PlaneGeometry(0.96, 0.96)
  overlayGeom.rotateX(-Math.PI / 2)
  const blockedMat = new THREE.MeshBasicMaterial({
    color: 0x884450,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  const blockedMesh = new THREE.InstancedMesh(overlayGeom, blockedMat, blocked.size)
  const tmpMat4 = new THREE.Matrix4()
  let bi = 0
  for (const key of blocked) {
    const [i, j] = key.split(',').map(Number)
    tmpMat4.setPosition(i - HALF_GRID + 0.5, -0.495, j - HALF_GRID + 0.5)
    blockedMesh.setMatrixAt(bi++, tmpMat4)
  }
  blockedMesh.instanceMatrix.needsUpdate = true
  scene.add(blockedMesh)
  sceneObjects.push(blockedMesh)
  disposables.push(overlayGeom, blockedMat)

  const hoverGeom = new THREE.PlaneGeometry(0.96, 0.96)
  hoverGeom.rotateX(-Math.PI / 2)
  const hoverMat = new THREE.MeshBasicMaterial({
    color: 0x40ff60,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const hoverMesh = new THREE.Mesh(hoverGeom, hoverMat)
  hoverMesh.position.y = -0.485
  hoverMesh.visible = false
  scene.add(hoverMesh)
  sceneObjects.push(hoverMesh)
  disposables.push(hoverGeom, hoverMat)

  const chunkGeomBySize: Record<ChunkSize, THREE.BoxGeometry> = {
    small: new THREE.BoxGeometry(...CHUNK_DIMS.small),
    medium: new THREE.BoxGeometry(...CHUNK_DIMS.medium),
    large: new THREE.BoxGeometry(...CHUNK_DIMS.large),
  }
  const chunkMat = new THREE.MeshStandardMaterial({
    color: 0xb84a5a,
    roughness: 0.3,
    metalness: 0.35,
  })
  const heartGeom = new THREE.IcosahedronGeometry(0.4, 0)
  const heartLiveMat = new THREE.MeshStandardMaterial({
    color: 0xff3050,
    emissive: 0x801020,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.4,
  })
  const heartDeadMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.4,
    metalness: 0.5,
  })
  disposables.push(
    chunkGeomBySize.small,
    chunkGeomBySize.medium,
    chunkGeomBySize.large,
    chunkMat,
    heartGeom,
    heartLiveMat,
    heartDeadMat,
  )

  const beastGroup = new THREE.Group()
  scene.add(beastGroup)
  sceneObjects.push(beastGroup)

  const segments: Segment[] = []
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const group = new THREE.Group()
    const chunks: Chunk[] = []
    for (const tmpl of CHUNK_LAYOUT) {
      const mesh = new THREE.Mesh(chunkGeomBySize[tmpl.size], chunkMat)
      mesh.position.set(tmpl.offset[0], tmpl.offset[1], tmpl.offset[2])
      group.add(mesh)
      chunks.push({
        mesh,
        hp: CHUNK_HP[tmpl.size],
        alive: true,
        size: tmpl.size,
        localOffset: new THREE.Vector3(tmpl.offset[0], tmpl.offset[1], tmpl.offset[2]),
      })
    }
    const heart = new THREE.Mesh(heartGeom, heartLiveMat)
    heart.visible = false
    group.add(heart)
    enableShadowsOnGroup(group)
    beastGroup.add(group)
    segments.push({
      group,
      chunks,
      heart,
      heartHp: HEART_HP,
      heartAlive: true,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
    })
  }

  let headDistance = (SEGMENT_COUNT - 1) * SEGMENT_SPACING
  let beastFinished = false

  const towerBaseGeom = new THREE.BoxGeometry(0.7, 0.4, 0.7)
  const towerBaseMat = new THREE.MeshStandardMaterial({
    color: 0x4a4248,
    roughness: 0.35,
    metalness: 0.5,
  })
  const towerTrunkGeom = new THREE.BoxGeometry(0.45, 0.7, 0.45)
  const towerTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x6a6058,
    roughness: 0.35,
    metalness: 0.5,
  })
  const archerBodyGeom = new THREE.CylinderGeometry(0.13, 0.16, 0.4, 8)
  const archerBodyMats: Record<UnitType, THREE.MeshStandardMaterial> = {
    archer: new THREE.MeshStandardMaterial({
      color: 0x3a5040,
      roughness: 0.35,
      metalness: 0.4,
    }),
    catapult: new THREE.MeshStandardMaterial({
      color: 0x6a4838,
      roughness: 0.35,
      metalness: 0.4,
    }),
    hireling: new THREE.MeshStandardMaterial({
      color: 0x803838,
      roughness: 0.35,
      metalness: 0.4,
    }),
  }
  const archerHeadGeom = new THREE.SphereGeometry(0.11, 10, 8)
  const archerHeadMat = new THREE.MeshStandardMaterial({
    color: 0xc0a080,
    roughness: 0.3,
    metalness: 0.15,
  })
  const bowGeom = new THREE.TorusGeometry(0.14, 0.015, 4, 14, Math.PI)
  bowGeom.rotateX(Math.PI / 2)
  bowGeom.rotateZ(Math.PI / 2)
  const bowMat = new THREE.MeshStandardMaterial({
    color: 0x6a4830,
    roughness: 0.3,
    metalness: 0.45,
  })
  disposables.push(
    towerBaseGeom,
    towerBaseMat,
    towerTrunkGeom,
    towerTrunkMat,
    archerBodyGeom,
    archerBodyMats.archer,
    archerBodyMats.catapult,
    archerBodyMats.hireling,
    archerHeadGeom,
    archerHeadMat,
    bowGeom,
    bowMat,
  )

  const catapultBaseGeom = new THREE.BoxGeometry(0.8, 0.4, 0.8)
  const catapultPillarGeom = new THREE.BoxGeometry(0.4, 0.8, 0.4)
  const catapultArmGeom = new THREE.BoxGeometry(0.18, 0.12, 0.9)
  const catapultBucketGeom = new THREE.BoxGeometry(0.22, 0.18, 0.22)
  const catapultMat = new THREE.MeshStandardMaterial({
    color: 0x6a4830,
    roughness: 0.3,
    metalness: 0.45,
  })
  const bombGeom = new THREE.SphereGeometry(0.18, 10, 8)
  const bombMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.15,
    metalness: 0.85,
  })
  const impactFlashGeom = new THREE.SphereGeometry(0.5, 14, 10)
  const impactWaveGeom = new THREE.RingGeometry(0.42, 0.5, 32)
  impactWaveGeom.rotateX(-Math.PI / 2)
  const impactFlashMat = new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  const impactWaveMat = new THREE.MeshBasicMaterial({
    color: 0xff8030,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  disposables.push(
    catapultBaseGeom,
    catapultPillarGeom,
    catapultArmGeom,
    catapultBucketGeom,
    catapultMat,
    bombGeom,
    bombMat,
    impactFlashGeom,
    impactWaveGeom,
    impactFlashMat,
    impactWaveMat,
  )

  const rangeRingGeom = new THREE.RingGeometry(CATAPULT_MIN_RANGE, CATAPULT_RANGE, 64)
  rangeRingGeom.rotateX(-Math.PI / 2)
  const rangeRingMat = new THREE.MeshBasicMaterial({
    color: 0x4a90c8,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const rangeRing = new THREE.Mesh(rangeRingGeom, rangeRingMat)
  rangeRing.position.y = -0.48
  rangeRing.visible = false
  scene.add(rangeRing)
  sceneObjects.push(rangeRing)
  disposables.push(rangeRingGeom, rangeRingMat)

  const aoeRingGeom = new THREE.RingGeometry(
    CATAPULT_AOE_RADIUS - 0.06,
    CATAPULT_AOE_RADIUS + 0.04,
    48,
  )
  aoeRingGeom.rotateX(-Math.PI / 2)
  const aoeRingMat = new THREE.MeshBasicMaterial({
    color: 0xffa040,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const aoeRing = new THREE.Mesh(aoeRingGeom, aoeRingMat)
  aoeRing.position.y = -0.475
  aoeRing.visible = false
  scene.add(aoeRing)
  sceneObjects.push(aoeRing)
  disposables.push(aoeRingGeom, aoeRingMat)

  const occupied = new Set<string>()
  const guns: Gun[] = []
  const catapults: Catapult[] = []
  const bombs: Bomb[] = []
  const impactFxs: ImpactFx[] = []
  const impactLights: ImpactLight[] = []
  const hirelings: Hireling[] = []
  let pendingCatapult: Catapult | null = null

  const daggerGeom = new THREE.BoxGeometry(0.03, 0.03, 0.2)
  const daggerMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0,
    roughness: 0.15,
    metalness: 0.9,
  })
  const homeMarkerGeom = new THREE.PlaneGeometry(0.8, 0.8)
  homeMarkerGeom.rotateX(-Math.PI / 2)
  const homeMarkerMat = new THREE.MeshBasicMaterial({
    color: 0x803838,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  disposables.push(daggerGeom, daggerMat, homeMarkerGeom, homeMarkerMat)

  function cellOf(x: number, z: number) {
    const i = Math.floor(x + HALF_GRID)
    const j = Math.floor(z + HALF_GRID)
    return {
      i,
      j,
      cx: i - HALF_GRID + 0.5,
      cz: j - HALF_GRID + 0.5,
      key: `${i},${j}`,
      inBounds: i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE,
    }
  }

  function addGunAt(cx: number, cz: number, key: string, unitType: UnitType) {
    const origin = new THREE.Vector3(cx, 0, cz)

    const tower = new THREE.Group()
    tower.position.set(cx, TOWER_GROUND_Y, cz)

    const base = new THREE.Mesh(towerBaseGeom, towerBaseMat)
    base.position.y = 0.2
    tower.add(base)

    const trunk = new THREE.Mesh(towerTrunkGeom, towerTrunkMat)
    trunk.position.y = 0.75
    tower.add(trunk)

    const archer = new THREE.Group()
    archer.position.y = ARCHER_LOCAL_Y
    tower.add(archer)

    const body = new THREE.Mesh(archerBodyGeom, archerBodyMats[unitType])
    body.position.y = 0.2
    archer.add(body)

    const head = new THREE.Mesh(archerHeadGeom, archerHeadMat)
    head.position.y = 0.5
    archer.add(head)

    const bow = new THREE.Mesh(bowGeom, bowMat)
    bow.position.set(0, MUZZLE_LOCAL_Y, MUZZLE_LOCAL_Z)
    archer.add(bow)

    enableShadowsOnGroup(tower)
    scene.add(tower)
    sceneObjects.push(tower)

    guns.push({ origin, archer, cooldown: Math.random() * GUN_COOLDOWN, recoilT: -1 })
    occupied.add(key)
  }

  function addCatapultAt(cx: number, cz: number, key: string): Catapult {
    const origin = new THREE.Vector3(cx, 0, cz)

    const group = new THREE.Group()
    group.position.set(cx, TOWER_GROUND_Y, cz)

    const base = new THREE.Mesh(catapultBaseGeom, catapultMat)
    base.position.y = 0.2
    group.add(base)

    const pillar = new THREE.Mesh(catapultPillarGeom, catapultMat)
    pillar.position.y = 0.8
    group.add(pillar)

    const arm = new THREE.Group()
    arm.position.y = ARM_PIVOT_Y + 0.5
    group.add(arm)

    const swing = new THREE.Group()
    swing.rotation.x = CATAPULT_ARM_REST
    arm.add(swing)

    const armBeam = new THREE.Mesh(catapultArmGeom, catapultMat)
    armBeam.position.z = 0.35
    swing.add(armBeam)

    const bucket = new THREE.Mesh(catapultBucketGeom, catapultMat)
    bucket.position.set(0, 0.06, 0.72)
    swing.add(bucket)

    enableShadowsOnGroup(group)
    scene.add(group)
    sceneObjects.push(group)

    const cat: Catapult = {
      origin,
      group,
      arm,
      swing,
      bucket,
      targetPos: origin.clone(),
      cooldown: 0,
      swingT: -1,
      hasFired: false,
      pendingFirstTarget: true,
    }
    catapults.push(cat)
    occupied.add(key)
    return cat
  }

  function addHirelingAt(cx: number, cz: number, key: string) {
    const home = new THREE.Vector3(cx, GROUND_Y, cz)
    const position = home.clone()

    const group = new THREE.Group()
    group.position.copy(home)

    const body = new THREE.Group()
    group.add(body)

    const bodyMesh = new THREE.Mesh(archerBodyGeom, archerBodyMats.hireling)
    bodyMesh.position.y = 0.2
    body.add(bodyMesh)

    const head = new THREE.Mesh(archerHeadGeom, archerHeadMat)
    head.position.y = 0.5
    body.add(head)

    const leftDagger = new THREE.Mesh(daggerGeom, daggerMat)
    leftDagger.position.set(-0.18, 0.22, DAGGER_REST_Z)
    body.add(leftDagger)

    const rightDagger = new THREE.Mesh(daggerGeom, daggerMat)
    rightDagger.position.set(0.18, 0.22, DAGGER_REST_Z)
    body.add(rightDagger)

    enableShadowsOnGroup(group)
    scene.add(group)

    const marker = new THREE.Mesh(homeMarkerGeom, homeMarkerMat)
    marker.position.set(cx, GROUND_Y + 0.008, cz)
    scene.add(marker)
    sceneObjects.push(marker)

    hirelings.push({
      home,
      position,
      group,
      body,
      leftDagger,
      rightDagger,
      state: 'idle',
      targetSeg: null,
      targetChunk: null,
      attackCooldown: 0,
      commitTimer: 0,
      runPhase: 0,
      swingT: -1,
    })
    occupied.add(key)
  }

  function findNearestFleshChunkInRange(
    from: THREE.Vector3,
    range: number,
  ): { seg: Segment; chunk: Chunk } | null {
    let bestSeg: Segment | null = null
    let bestChunk: Chunk | null = null
    let bestDistSq = range * range
    const probe = new THREE.Vector3()
    for (const seg of segments) {
      if (!seg.group.visible) continue
      for (const c of seg.chunks) {
        if (!c.alive) continue
        chunkWorldPos(seg, c, probe)
        const dx = probe.x - from.x
        const dz = probe.z - from.z
        const dSq = dx * dx + dz * dz
        if (dSq < bestDistSq) {
          bestDistSq = dSq
          bestSeg = seg
          bestChunk = c
        }
      }
    }
    if (bestSeg && bestChunk) return { seg: bestSeg, chunk: bestChunk }
    return null
  }

  function moveHirelingToward(h: Hireling, tx: number, tz: number, dt: number) {
    const dx = tx - h.position.x
    const dz = tz - h.position.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.001) return
    const step = Math.min(dist, HIRELING_SPEED * dt)
    h.position.x += (dx / dist) * step
    h.position.z += (dz / dist) * step
    h.group.rotation.y = Math.atan2(dx, dz)
    pushHirelingFromPath(h)
    pushHirelingFromTowers(h)
    h.group.position.x = h.position.x
    h.group.position.z = h.position.z
  }

  function pushAwayPoint(pos: THREE.Vector3, cx: number, cz: number, minDist: number) {
    const dx = pos.x - cx
    const dz = pos.z - cz
    const dSq = dx * dx + dz * dz
    if (dSq >= minDist * minDist) return
    if (dSq < 0.0001) {
      pos.x = cx + minDist
      return
    }
    const d = Math.sqrt(dSq)
    pos.x = cx + (dx / d) * minDist
    pos.z = cz + (dz / d) * minDist
  }

  function pushHirelingFromPath(h: Hireling) {
    const i = Math.floor(h.position.x + HALF_GRID)
    const j = Math.floor(h.position.z + HALF_GRID)
    if (i < 0 || i >= GRID_SIZE || j < 0 || j >= GRID_SIZE) return
    const idx = (i * GRID_SIZE + j) * 2
    const bestX = cellNearestPath[idx]
    const bestZ = cellNearestPath[idx + 1]
    const dx = h.position.x - bestX
    const dz = h.position.z - bestZ
    if (dx * dx + dz * dz < HIRELING_PATH_BUFFER * HIRELING_PATH_BUFFER) {
      pushAwayPoint(h.position, bestX, bestZ, HIRELING_PATH_BUFFER)
    }
  }

  function pushHirelingFromTowers(h: Hireling) {
    for (const g of guns) {
      pushAwayPoint(h.position, g.origin.x, g.origin.z, TOWER_OBSTACLE_RADIUS)
    }
    for (const cat of catapults) {
      pushAwayPoint(h.position, cat.origin.x, cat.origin.z, TOWER_OBSTACLE_RADIUS)
    }
  }

  function isInsideAnyTower(x: number, z: number, except: Gun | null): boolean {
    const rSq = TOWER_OBSTACLE_RADIUS * TOWER_OBSTACLE_RADIUS
    for (const g of guns) {
      if (g === except) continue
      const dx = x - g.origin.x
      const dz = z - g.origin.z
      if (dx * dx + dz * dz < rSq) return true
    }
    for (const cat of catapults) {
      const dx = x - cat.origin.x
      const dz = z - cat.origin.z
      if (dx * dx + dz * dz < rSq) return true
    }
    return false
  }

  function pushHirelingsApart() {
    const minDist = HIRELING_HIRELING_BUFFER
    for (let i = 0; i < hirelings.length; i++) {
      for (let j = i + 1; j < hirelings.length; j++) {
        const a = hirelings[i]
        const b = hirelings[j]
        const dx = b.position.x - a.position.x
        const dz = b.position.z - a.position.z
        const dSq = dx * dx + dz * dz
        if (dSq >= minDist * minDist) continue
        if (dSq < 0.0001) {
          a.position.x -= 0.01
          b.position.x += 0.01
          continue
        }
        const d = Math.sqrt(dSq)
        const half = (minDist - d) * 0.5
        const nx = dx / d
        const nz = dz / d
        a.position.x -= nx * half
        a.position.z -= nz * half
        b.position.x += nx * half
        b.position.z += nz * half
      }
    }
  }

  function tickHirelings(dt: number) {
    const tmpPos = new THREE.Vector3()
    for (const h of hirelings) {
      let moving = false
      h.attackCooldown -= dt

      if (h.state === 'attacking') {
        h.commitTimer -= dt
        const target = h.targetChunk
        if (target && target.alive) {
          chunkWorldPos(h.targetSeg!, target, tmpPos)
          const dx = tmpPos.x - h.position.x
          const dz = tmpPos.z - h.position.z
          h.group.rotation.y = Math.atan2(dx, dz)
          const distSq = dx * dx + dz * dz
          if (
            distSq < HIRELING_ATTACK_RANGE_HOLD * HIRELING_ATTACK_RANGE_HOLD &&
            h.attackCooldown <= 0
          ) {
            target.hp -= HIRELING_DAMAGE
            h.swingT = 0
            if (target.hp <= 0) {
              target.alive = false
              detachChunk(h.targetSeg!, target)
              h.targetSeg = null
              h.targetChunk = null
            }
            h.attackCooldown = HIRELING_ATTACK_INTERVAL
            h.commitTimer = HIRELING_ATTACK_COMMIT
          }
        }
        if (h.commitTimer <= 0) {
          h.state = 'chasing'
          if (!h.targetChunk || !h.targetChunk.alive) {
            h.targetSeg = null
            h.targetChunk = null
          }
        }
      } else if (h.state === 'returning') {
        const dxH = h.home.x - h.position.x
        const dzH = h.home.z - h.position.z
        if (dxH * dxH + dzH * dzH < 0.0025) {
          h.state = 'idle'
          h.group.rotation.y = 0
        } else {
          moveHirelingToward(h, h.home.x, h.home.z, dt)
          moving = true
        }
      } else {
        if (h.state === 'idle' || !h.targetChunk || !h.targetChunk.alive) {
          const found = findNearestFleshChunkInRange(h.position, HIRELING_AGGRO)
          if (found) {
            h.targetSeg = found.seg
            h.targetChunk = found.chunk
            h.state = 'chasing'
          } else if (h.state === 'chasing') {
            h.state = 'returning'
            h.targetSeg = null
            h.targetChunk = null
          }
        }

        if (h.state === 'chasing' && h.targetSeg && h.targetChunk) {
          const dxH = h.position.x - h.home.x
          const dzH = h.position.z - h.home.z
          if (dxH * dxH + dzH * dzH > HIRELING_LEASH * HIRELING_LEASH) {
            h.state = 'returning'
            h.targetSeg = null
            h.targetChunk = null
          } else {
            chunkWorldPos(h.targetSeg, h.targetChunk, tmpPos)
            const dx = tmpPos.x - h.position.x
            const dz = tmpPos.z - h.position.z
            const distSq = dx * dx + dz * dz
            if (distSq < HIRELING_ATTACK_RANGE * HIRELING_ATTACK_RANGE) {
              h.state = 'attacking'
              h.commitTimer = HIRELING_ATTACK_COMMIT
              h.attackCooldown = 0
              h.group.rotation.y = Math.atan2(dx, dz)
            } else {
              moveHirelingToward(h, tmpPos.x, tmpPos.z, dt)
              moving = true
            }
          }
        }
      }

      if (moving) {
        h.runPhase += dt
        const hopY =
          Math.max(0, Math.sin(h.runPhase * Math.PI * 2 * HIRELING_HOP_PER_SEC)) *
          HIRELING_HOP_HEIGHT
        h.body.position.y = hopY
      } else {
        h.runPhase = 0
        h.body.position.y = 0
      }

      if (h.swingT >= 0) {
        h.swingT += dt
        const t = h.swingT / HIRELING_SWING_DURATION
        if (t >= 1) {
          h.swingT = -1
          h.leftDagger.position.z = DAGGER_REST_Z
          h.rightDagger.position.z = DAGGER_REST_Z
        } else if (t < 0.5) {
          const subT = t * 2
          h.leftDagger.position.z = DAGGER_REST_Z + Math.sin(subT * Math.PI) * DAGGER_STAB_REACH
          h.rightDagger.position.z = DAGGER_REST_Z
        } else {
          const subT = (t - 0.5) * 2
          h.leftDagger.position.z = DAGGER_REST_Z
          h.rightDagger.position.z = DAGGER_REST_Z + Math.sin(subT * Math.PI) * DAGGER_STAB_REACH
        }
      }
    }
    pushHirelingsApart()
    for (const h of hirelings) {
      h.group.position.x = h.position.x
      h.group.position.z = h.position.z
    }
  }

  function tickArcherRecoil(dt: number) {
    for (const g of guns) {
      if (g.recoilT < 0) continue
      g.recoilT += dt
      if (g.recoilT >= RECOIL_DURATION) {
        g.archer.position.x = 0
        g.archer.position.z = 0
        g.recoilT = -1
        continue
      }
      const t = g.recoilT / RECOIL_DURATION
      const offset = Math.sin(t * Math.PI) * RECOIL_DISTANCE
      const yaw = g.archer.rotation.y
      g.archer.position.x = -Math.sin(yaw) * offset
      g.archer.position.z = -Math.cos(yaw) * offset
    }
  }

  function aimCatapult(cat: Catapult) {
    const dx = cat.targetPos.x - cat.origin.x
    const dz = cat.targetPos.z - cat.origin.z
    cat.arm.rotation.y = Math.atan2(-dx, -dz)
  }

  function bucketWorldPos(cat: Catapult, out: THREE.Vector3): THREE.Vector3 {
    cat.group.updateMatrixWorld(true)
    return cat.bucket.getWorldPosition(out)
  }

  function tickCatapultSwing(cat: Catapult, dt: number) {
    if (cat.swingT < 0) return
    cat.swingT += dt
    if (cat.swingT < HARD_PITCH_DURATION) {
      const t = cat.swingT / HARD_PITCH_DURATION
      cat.swing.rotation.x =
        CATAPULT_ARM_REST + (CATAPULT_ARM_PEAK - CATAPULT_ARM_REST) * t
    } else if (cat.swingT < HARD_PITCH_DURATION + SOFT_RESET_DURATION) {
      if (!cat.hasFired) {
        spawnBomb(cat)
        cat.hasFired = true
      }
      const t = (cat.swingT - HARD_PITCH_DURATION) / SOFT_RESET_DURATION
      cat.swing.rotation.x =
        CATAPULT_ARM_PEAK + (CATAPULT_ARM_REST - CATAPULT_ARM_PEAK) * t
    } else {
      cat.swing.rotation.x = CATAPULT_ARM_REST
      cat.swingT = -1
      cat.hasFired = false
    }
  }

  function spawnBomb(cat: Catapult) {
    const startPos = bucketWorldPos(cat, new THREE.Vector3())
    const mesh = new THREE.Mesh(bombGeom, bombMat)
    mesh.position.copy(startPos)
    mesh.castShadow = true
    scene.add(mesh)
    bombs.push({
      mesh,
      age: 0,
      totalFlight: BOMB_FLIGHT_TIME,
      startPos: startPos.clone(),
      target: cat.targetPos.clone(),
    })
  }

  function spawnImpactFx(position: THREE.Vector3) {
    const flashMat = impactFlashMat.clone()
    const flashMesh = new THREE.Mesh(impactFlashGeom, flashMat)
    flashMesh.position.set(position.x, GROUND_Y + 0.4, position.z)
    flashMesh.scale.setScalar(IMPACT_FLASH_START)
    scene.add(flashMesh)
    impactFxs.push({
      mesh: flashMesh,
      age: 0,
      maxAge: IMPACT_FLASH_DURATION,
      startScale: IMPACT_FLASH_START,
      endScale: IMPACT_FLASH_END,
      startOpacity: 0.9,
    })

    const waveMat = impactWaveMat.clone()
    const waveMesh = new THREE.Mesh(impactWaveGeom, waveMat)
    waveMesh.position.set(position.x, GROUND_Y + 0.02, position.z)
    waveMesh.scale.setScalar(0.3)
    scene.add(waveMesh)
    impactFxs.push({
      mesh: waveMesh,
      age: 0,
      maxAge: IMPACT_WAVE_DURATION,
      startScale: 0.3,
      endScale: IMPACT_WAVE_END_SCALE,
      startOpacity: 0.9,
    })
  }

  function spawnImpactLight(position: THREE.Vector3) {
    const peakIntensity = 6
    const light = new THREE.PointLight(0xffb060, peakIntensity, 5, 2)
    light.position.set(position.x, GROUND_Y + 0.6, position.z)
    scene.add(light)
    impactLights.push({ light, age: 0, maxAge: 0.45, peakIntensity })
  }

  function updateImpactLights(dt: number) {
    for (let i = impactLights.length - 1; i >= 0; i--) {
      const il = impactLights[i]
      il.age += dt
      if (il.age >= il.maxAge) {
        scene.remove(il.light)
        impactLights.splice(i, 1)
        continue
      }
      const t = il.age / il.maxAge
      il.light.intensity = il.peakIntensity * (1 - t)
    }
  }

  function updateImpactFx(dt: number) {
    for (let i = impactFxs.length - 1; i >= 0; i--) {
      const fx = impactFxs[i]
      fx.age += dt
      if (fx.age >= fx.maxAge) {
        scene.remove(fx.mesh)
        ;(fx.mesh.material as THREE.Material).dispose()
        impactFxs.splice(i, 1)
        continue
      }
      const t = fx.age / fx.maxAge
      fx.mesh.scale.setScalar(fx.startScale + (fx.endScale - fx.startScale) * t)
      ;(fx.mesh.material as THREE.MeshBasicMaterial).opacity = fx.startOpacity * (1 - t)
    }
  }

  function bombImpact(target: THREE.Vector3) {
    spawnImpactFx(target)
    spawnImpactLight(target)
    const probe = new THREE.Vector3()
    const aoeSq = CATAPULT_AOE_RADIUS * CATAPULT_AOE_RADIUS
    for (const seg of segments) {
      if (!seg.group.visible) continue
      const segDx = seg.position.x - target.x
      const segDz = seg.position.z - target.z
      if (segDx * segDx + segDz * segDz > (CATAPULT_AOE_RADIUS + 2) ** 2) continue
      if (!isFleshAlive(seg) && seg.heartAlive) {
        if (segDx * segDx + segDz * segDz < aoeSq) {
          seg.heartHp -= CATAPULT_DAMAGE
          if (seg.heartHp <= 0) {
            seg.heartAlive = false
            seg.heart.material = heartDeadMat
          }
        }
      }
      for (const c of seg.chunks) {
        if (!c.alive) continue
        chunkWorldPos(seg, c, probe)
        const dx = probe.x - target.x
        const dz = probe.z - target.z
        if (dx * dx + dz * dz < aoeSq) {
          c.hp -= CATAPULT_DAMAGE
          if (c.hp <= 0) {
            c.alive = false
            detachChunk(seg, c)
          }
        }
      }
    }
  }

  function updateBombs(dt: number) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i]
      b.age += dt
      if (b.age >= b.totalFlight) {
        bombImpact(b.target)
        scene.remove(b.mesh)
        bombs.splice(i, 1)
        continue
      }
      const t = b.age / b.totalFlight
      b.mesh.position.x = b.startPos.x + (b.target.x - b.startPos.x) * t
      b.mesh.position.z = b.startPos.z + (b.target.z - b.startPos.z) * t
      const endY = GROUND_Y
      b.mesh.position.y =
        b.startPos.y + (endY - b.startPos.y) * t + 4 * BOMB_PEAK_HEIGHT * t * (1 - t)
    }
  }


  const shaftGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6)
  shaftGeom.translate(0, 0.125, 0)
  const tipGeom = new THREE.ConeGeometry(0.07, 0.1, 6)
  tipGeom.translate(0, 0.3, 0)
  const fletchGeom = new THREE.ConeGeometry(0.08, 0.08, 4)
  fletchGeom.translate(0, 0.04, 0)
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a3a,
    roughness: 0.3,
    metalness: 0.45,
  })
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xd0c090,
    roughness: 0.15,
    metalness: 0.85,
  })
  const fletchMat = new THREE.MeshStandardMaterial({
    color: 0xffd960,
    roughness: 0.25,
    metalness: 0.4,
  })
  disposables.push(shaftGeom, tipGeom, fletchGeom, shaftMat, tipMat, fletchMat)

  const arrows: Arrow[] = []

  function makeArrowMesh(): THREE.Group {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(shaftGeom, shaftMat))
    g.add(new THREE.Mesh(tipGeom, tipMat))
    g.add(new THREE.Mesh(fletchGeom, fletchMat))
    return g
  }

  function isFleshAlive(seg: Segment): boolean {
    for (const c of seg.chunks) if (c.alive) return true
    return false
  }

  function updateSegments() {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const s = headDistance - i * SEGMENT_SPACING
      if (s < 0 || s > pathLength) {
        seg.group.visible = false
        continue
      }
      seg.group.visible = true
      const t = s / pathLength
      path.getPointAt(t, seg.position)
      seg.position.y = 0.45
      path.getTangentAt(t, seg.tangent)
      const yaw = Math.atan2(seg.tangent.x, seg.tangent.z)
      seg.group.position.copy(seg.position)
      seg.group.rotation.y = yaw
      seg.heart.visible = !isFleshAlive(seg)
    }
  }

  function chunkWorldPos(seg: Segment, chunk: Chunk, out: THREE.Vector3): THREE.Vector3 {
    const yaw = seg.group.rotation.y
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const lx = chunk.localOffset.x
    const ly = chunk.localOffset.y
    const lz = chunk.localOffset.z
    out.set(
      seg.position.x + lx * cos + lz * sin,
      seg.position.y + ly,
      seg.position.z + -lx * sin + lz * cos,
    )
    return out
  }

  function pickTarget(gun: Gun): AimTarget | null {
    let bestHeartSeg: Segment | null = null
    let bestHeartDist = GUN_RANGE
    for (const seg of segments) {
      if (!seg.group.visible || isFleshAlive(seg) || !seg.heartAlive) continue
      const dist = gun.origin.distanceTo(seg.position)
      if (dist < bestHeartDist) {
        bestHeartDist = dist
        bestHeartSeg = seg
      }
    }
    if (bestHeartSeg) {
      return { seg: bestHeartSeg, chunk: null, aimPoint: bestHeartSeg.position.clone() }
    }
    let bestSeg: Segment | null = null
    let bestChunk: Chunk | null = null
    let bestChunkDist = GUN_RANGE
    const probe = new THREE.Vector3()
    for (const seg of segments) {
      if (!seg.group.visible) continue
      for (const c of seg.chunks) {
        if (!c.alive) continue
        chunkWorldPos(seg, c, probe)
        const dist = gun.origin.distanceTo(probe)
        if (dist < bestChunkDist) {
          bestChunkDist = dist
          bestSeg = seg
          bestChunk = c
        }
      }
    }
    if (bestSeg && bestChunk) {
      return {
        seg: bestSeg,
        chunk: bestChunk,
        aimPoint: chunkWorldPos(bestSeg, bestChunk, new THREE.Vector3()),
      }
    }
    return null
  }

  function predictAim(
    targetPos: THREE.Vector3,
    tangent: THREE.Vector3,
    gunPos: THREE.Vector3,
  ): THREE.Vector3 {
    const dist = gunPos.distanceTo(targetPos)
    const flightTime = dist / ARROW_SPEED
    return targetPos.clone().addScaledVector(tangent, BEAST_SPEED * flightTime)
  }

  function aimGun(gun: Gun, targetPos: THREE.Vector3) {
    const dx = targetPos.x - gun.origin.x
    const dz = targetPos.z - gun.origin.z
    gun.archer.rotation.y = Math.atan2(dx, dz)
  }

  function muzzleWorld(gun: Gun, out: THREE.Vector3): THREE.Vector3 {
    const a = gun.archer.rotation.y
    const sin = Math.sin(a)
    const cos = Math.cos(a)
    out.set(
      gun.origin.x + MUZZLE_LOCAL_Z * sin,
      ARCHER_WORLD_Y + MUZZLE_LOCAL_Y,
      gun.origin.z + MUZZLE_LOCAL_Z * cos,
    )
    return out
  }

  function spawnArrow(gun: Gun, target: AimTarget) {
    const spawn = muzzleWorld(gun, new THREE.Vector3())
    const aim = predictAim(target.aimPoint, target.seg.tangent, spawn)
    const dir = aim.sub(spawn).normalize()
    const mesh = makeArrowMesh()
    mesh.position.copy(spawn)
    mesh.quaternion.setFromUnitVectors(UP, dir)
    scene.add(mesh)
    arrows.push({
      group: mesh,
      position: spawn.clone(),
      velocity: dir.multiplyScalar(ARROW_SPEED),
      age: 0,
      firingTower: gun,
    })
  }

  const debris: Debris[] = []

  function detachChunk(seg: Segment, chunk: Chunk) {
    const yaw = seg.group.rotation.y
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const lx = chunk.localOffset.x
    const lz = chunk.localOffset.z
    const worldPos = chunkWorldPos(seg, chunk, new THREE.Vector3())

    seg.group.remove(chunk.mesh)
    scene.add(chunk.mesh)
    chunk.mesh.position.copy(worldPos)
    chunk.mesh.rotation.set(0, yaw, 0)

    let outX = lx * cos + lz * sin
    let outZ = -lx * sin + lz * cos
    const horizLen = Math.hypot(outX, outZ)
    if (horizLen < 0.01) {
      outX = Math.random() - 0.5
      outZ = Math.random() - 0.5
    } else {
      outX /= horizLen
      outZ /= horizLen
    }
    const speed = 2 + Math.random() * 2
    const vel = new THREE.Vector3(
      outX * speed + (Math.random() - 0.5) * 1.5,
      3 + Math.random() * 2.5,
      outZ * speed + (Math.random() - 0.5) * 1.5,
    )
    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    )
    const halfHeight = CHUNK_DIMS[chunk.size][1] / 2

    debris.push({ mesh: chunk.mesh, vel, angVel, age: 0, halfHeight, meltTimer: 0 })
  }

  function updateDebris(dt: number) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]
      d.age += dt

      if (d.meltTimer === 0) {
        d.vel.y -= DEBRIS_GRAVITY * dt
        d.mesh.position.addScaledVector(d.vel, dt)
        d.mesh.rotation.x += d.angVel.x * dt
        d.mesh.rotation.y += d.angVel.y * dt
        d.mesh.rotation.z += d.angVel.z * dt

        const restY = GROUND_Y + d.halfHeight
        if (d.mesh.position.y < restY) {
          d.mesh.position.y = restY
          if (d.vel.y < 0) d.vel.y = -d.vel.y * DEBRIS_BOUNCE
          d.vel.x *= DEBRIS_FRICTION
          d.vel.z *= DEBRIS_FRICTION
          d.angVel.multiplyScalar(0.7)
          if (Math.abs(d.vel.y) < DEBRIS_REST_VEL) d.vel.y = 0
        }

        const grounded = d.mesh.position.y <= restY + 0.02
        const slow =
          Math.abs(d.vel.y) < DEBRIS_REST_VEL &&
          d.vel.x * d.vel.x + d.vel.z * d.vel.z < 0.8
        if (grounded && slow) {
          d.meltTimer = 0.0001
          d.vel.set(0, 0, 0)
          d.angVel.set(0, 0, 0)
        }
      } else {
        d.meltTimer += dt
        const t = Math.min(1, d.meltTimer / SINK_DURATION)
        d.mesh.position.y = GROUND_Y + d.halfHeight - 2 * d.halfHeight * t
        if (t >= 1) {
          scene.remove(d.mesh)
          debris.splice(i, 1)
          continue
        }
      }

      if (d.age > DEBRIS_LIFE) {
        scene.remove(d.mesh)
        debris.splice(i, 1)
      }
    }
  }

  function damageHeart(seg: Segment) {
    if (!seg.heartAlive) return
    seg.heartHp -= GUN_DAMAGE
    if (seg.heartHp <= 0) {
      seg.heartAlive = false
      seg.heart.material = heartDeadMat
    }
  }

  function damageChunk(seg: Segment, chunk: Chunk) {
    if (!chunk.alive) return
    chunk.hp -= GUN_DAMAGE
    if (chunk.hp <= 0) {
      chunk.alive = false
      detachChunk(seg, chunk)
    }
  }

  const collisionProbe = new THREE.Vector3()
  function checkArrowCollision(
    arrowPos: THREE.Vector3,
  ): { seg: Segment; chunk: Chunk | null; isHeart: boolean } | null {
    for (const seg of segments) {
      if (!seg.group.visible) continue
      if (arrowPos.distanceTo(seg.position) > SEGMENT_BROAD_RADIUS) continue
      if (!isFleshAlive(seg) && seg.heartAlive) {
        if (arrowPos.distanceTo(seg.position) < HEART_HIT_RADIUS) {
          return { seg, chunk: null, isHeart: true }
        }
      }
      for (const c of seg.chunks) {
        if (!c.alive) continue
        chunkWorldPos(seg, c, collisionProbe)
        if (arrowPos.distanceTo(collisionProbe) < CHUNK_HIT_RADIUS[c.size]) {
          return { seg, chunk: c, isHeart: false }
        }
      }
    }
    return null
  }

  function removeArrow(index: number) {
    const a = arrows[index]
    scene.remove(a.group)
    arrows.splice(index, 1)
  }

  function updateArrows(dt: number) {
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]
      a.age += dt
      a.position.addScaledVector(a.velocity, dt)
      a.group.position.copy(a.position)
      const hit = checkArrowCollision(a.position)
      if (hit) {
        if (hit.isHeart) damageHeart(hit.seg)
        else if (hit.chunk) damageChunk(hit.seg, hit.chunk)
        removeArrow(i)
        continue
      }
      if (isInsideAnyTower(a.position.x, a.position.z, a.firingTower)) {
        removeArrow(i)
        continue
      }
      if (a.age > ARROW_MAX_AGE) removeArrow(i)
    }
  }

  const raycaster = new THREE.Raycaster()
  const buildPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5)
  const ndc = new THREE.Vector2()
  const cellHit = new THREE.Vector3()
  const cursorWorld = new THREE.Vector3()

  function pickCellFromEvent(ev: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(buildPlane, cellHit)) return null
    const c = cellOf(cellHit.x, cellHit.z)
    if (!c.inBounds) return null
    const buildable = !blocked.has(c.key) && !occupied.has(c.key)
    return { ...c, buildable }
  }

  function isTargetInRange(cat: Catapult, x: number, z: number): boolean {
    const dx = x - cat.origin.x
    const dz = z - cat.origin.z
    const distSq = dx * dx + dz * dz
    return (
      distSq >= CATAPULT_MIN_RANGE * CATAPULT_MIN_RANGE &&
      distSq <= CATAPULT_RANGE * CATAPULT_RANGE
    )
  }

  function cursorWorldPos(ev: PointerEvent): boolean {
    const rect = canvas.getBoundingClientRect()
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    return raycaster.ray.intersectPlane(buildPlane, cursorWorld) !== null
  }

  function confirmCatapultTarget() {
    if (!pendingCatapult) return
    if (pendingCatapult.pendingFirstTarget) {
      pendingCatapult.pendingFirstTarget = false
      pendingCatapult.cooldown = CATAPULT_COOLDOWN * 0.4
    }
    pendingCatapult = null
    rangeRing.visible = false
    aoeRing.visible = false
    gameStore.setSelectedUnit(null)
  }

  function findCatapultNear(point: THREE.Vector3, radius: number): Catapult | null {
    const radiusSq = radius * radius
    let best: Catapult | null = null
    let bestDist = radiusSq
    for (const cat of catapults) {
      const dx = cat.origin.x - point.x
      const dz = cat.origin.z - point.z
      const dSq = dx * dx + dz * dz
      if (dSq < bestDist) {
        bestDist = dSq
        best = cat
      }
    }
    return best
  }

  function beginRetarget(cat: Catapult) {
    pendingCatapult = cat
    rangeRing.position.x = cat.origin.x
    rangeRing.position.z = cat.origin.z
    rangeRing.visible = true
    aoeRing.position.set(cat.targetPos.x, -0.475, cat.targetPos.z)
    aoeRing.visible = true
    hoverMesh.visible = false
  }

  function onPointerMove(ev: PointerEvent) {
    if (pendingCatapult) {
      if (!cursorWorldPos(ev)) return
      aoeRing.position.x = cursorWorld.x
      aoeRing.position.z = cursorWorld.z
      const valid = isTargetInRange(pendingCatapult, cursorWorld.x, cursorWorld.z)
      aoeRing.material.color.setHex(valid ? 0xffa040 : 0xff4040)
      if (valid) {
        pendingCatapult.targetPos.set(cursorWorld.x, GROUND_Y, cursorWorld.z)
        aimCatapult(pendingCatapult)
      }
      return
    }
    if (!gameStore.getSelectedUnit()) {
      hoverMesh.visible = false
      return
    }
    const c = pickCellFromEvent(ev)
    if (!c) {
      hoverMesh.visible = false
      return
    }
    hoverMesh.visible = true
    hoverMesh.position.set(c.cx, -0.485, c.cz)
    hoverMat.color.setHex(c.buildable ? 0x40ff60 : 0xff4040)
  }

  function onPointerDown(ev: PointerEvent) {
    if (ev.button !== 0) return
    if (pendingCatapult) {
      if (!cursorWorldPos(ev)) return
      if (!isTargetInRange(pendingCatapult, cursorWorld.x, cursorWorld.z)) return
      pendingCatapult.targetPos.set(cursorWorld.x, GROUND_Y, cursorWorld.z)
      aimCatapult(pendingCatapult)
      confirmCatapultTarget()
      return
    }
    const unitType = gameStore.getSelectedUnit()
    if (!unitType) {
      if (cursorWorldPos(ev)) {
        const cat = findCatapultNear(cursorWorld, 0.6)
        if (cat) beginRetarget(cat)
      }
      return
    }
    const c = pickCellFromEvent(ev)
    if (!c || !c.buildable) return
    if (!gameStore.spendGold(UNIT_COST[unitType])) return
    if (unitType === 'catapult') {
      const cat = addCatapultAt(c.cx, c.cz, c.key)
      beginRetarget(cat)
    } else if (unitType === 'hireling') {
      addHirelingAt(c.cx, c.cz, c.key)
    } else {
      addGunAt(c.cx, c.cz, c.key, unitType)
    }
  }

  function onPointerLeave() {
    hoverMesh.visible = false
  }

  function onContextMenu(ev: MouseEvent) {
    ev.preventDefault()
    if (pendingCatapult) {
      confirmCatapultTarget()
      return
    }
    gameStore.setSelectedUnit(null)
  }

  const unsubscribeStore = gameStore.subscribe((s) => {
    if (!s.selectedUnit) hoverMesh.visible = false
  })

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('contextmenu', onContextMenu)

  function tick(dt: number) {
    if (!beastFinished) {
      const anyHeartAlive = segments.some((s) => s.heartAlive)
      if (anyHeartAlive) headDistance += BEAST_SPEED * dt
      const lastSegmentArc = headDistance - (SEGMENT_COUNT - 1) * SEGMENT_SPACING
      if (lastSegmentArc > pathLength || !anyHeartAlive) beastFinished = true
      updateSegments()
    }

    for (const gun of guns) {
      gun.cooldown -= dt
      const target = pickTarget(gun)
      if (target) aimGun(gun, target.aimPoint)
      if (gun.cooldown > 0 || !target) continue
      spawnArrow(gun, target)
      gun.cooldown = GUN_COOLDOWN
      gun.recoilT = 0
    }
    tickArcherRecoil(dt)
    tickHirelings(dt)

    for (const cat of catapults) {
      if (cat === pendingCatapult) continue
      aimCatapult(cat)
      cat.cooldown -= dt
      if (cat.cooldown <= 0 && cat.swingT < 0) {
        cat.swingT = 0
        cat.hasFired = false
        cat.cooldown = CATAPULT_COOLDOWN
      }
      tickCatapultSwing(cat, dt)
    }

    updateArrows(dt)
    updateBombs(dt)
    updateImpactFx(dt)
    updateImpactLights(dt)
    updateDebris(dt)
  }

  function dispose() {
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('contextmenu', onContextMenu)
    unsubscribeStore()
    for (const a of arrows) scene.remove(a.group)
    arrows.length = 0
    for (const b of bombs) scene.remove(b.mesh)
    bombs.length = 0
    for (const fx of impactFxs) {
      scene.remove(fx.mesh)
      ;(fx.mesh.material as THREE.Material).dispose()
    }
    impactFxs.length = 0
    for (const il of impactLights) scene.remove(il.light)
    impactLights.length = 0
    for (const h of hirelings) scene.remove(h.group)
    hirelings.length = 0
    for (const d of debris) scene.remove(d.mesh)
    debris.length = 0
    for (const obj of sceneObjects) scene.remove(obj)
    for (const d of disposables) d.dispose()
  }

  return { tick, dispose }
}
