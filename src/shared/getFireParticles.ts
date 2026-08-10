import * as THREE from 'three'

export type Sparks = {
  points: THREE.Points
  update: (delta: number) => void
  geometry: THREE.BufferGeometry
  material: THREE.PointsMaterial
}

export type Spark = {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  lifetime: number
}

const SPARK_COUNT = 8

/** A spark starting near the base of the flame with a mostly-upward
 *  velocity — respawned in place whenever a spark ages past its lifetime,
 *  so the point cloud reads as a continuous rising shower instead of a
 *  handful of sparks that fly off once and vanish. */
function spawnSpark(scale: number): Spark {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * 0.08 * scale
  return {
    position: new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.35 * scale,
      (0.7 + Math.random() * 0.5) * scale,
      (Math.random() - 0.5) * 0.35 * scale,
    ),
    age: Math.random() * 0.8,
    lifetime: 0.7 + Math.random() * 0.6,
  }
}

function createSparks(scale: number): Sparks {
  const sparks: Spark[] = Array.from({ length: SPARK_COUNT }, () => spawnSpark(scale))

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(new Float32Array(sparks.length * 3), 3)
  geometry.setAttribute('position', positionAttribute)

  const material = new THREE.PointsMaterial({
    color: 0xffb347,
    size: 0.05 * scale,
    transparent: true,
    depthWrite: false,
  })

  function updateSparks(delta: number) {
    for (let i = 0; i < sparks.length; i++) {
      const spark = sparks[i]
      spark.age += delta

      if (spark.age >= spark.lifetime) {
        sparks[i] = spawnSpark(scale)
      } else {
        spark.position.addScaledVector(spark.velocity, delta)
      }

      const p = sparks[i].position
      positionAttribute.setXYZ(i, p.x, p.y, p.z)
    }

    positionAttribute.needsUpdate = true
  }

  const points = new THREE.Points(geometry, material)

  return {
    points,
    update: updateSparks,
    geometry,
    material,
  }
}

export { createSparks }
