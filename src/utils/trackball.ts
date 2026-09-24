export type Vector3 = { x: number; y: number; z: number }
export type Quaternion = { x: number; y: number; z: number; w: number }

export const identityQuaternion = (): Quaternion => ({ x: 0, y: 0, z: 0, w: 1 })

export function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

export function normalizeQuaternion(quaternion: Quaternion): Quaternion {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w) || 1
  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  }
}

export function multiplyQuaternions(first: Quaternion, second: Quaternion): Quaternion {
  return normalizeQuaternion({
    x: first.w * second.x + first.x * second.w + first.y * second.z - first.z * second.y,
    y: first.w * second.y - first.x * second.z + first.y * second.w + first.z * second.x,
    z: first.w * second.z + first.x * second.y - first.y * second.x + first.z * second.w,
    w: first.w * second.w - first.x * second.x - first.y * second.y - first.z * second.z,
  })
}

export function conjugateQuaternion(quaternion: Quaternion): Quaternion {
  return { x: -quaternion.x, y: -quaternion.y, z: -quaternion.z, w: quaternion.w }
}

export function quaternionFromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const normalizedAxis = normalizeVector(axis)
  const halfAngle = angle / 2
  const sine = Math.sin(halfAngle)
  return normalizeQuaternion({
    x: normalizedAxis.x * sine,
    y: normalizedAxis.y * sine,
    z: normalizedAxis.z * sine,
    w: Math.cos(halfAngle),
  })
}

export function quaternionBetweenVectors(from: Vector3, to: Vector3): Quaternion {
  const start = normalizeVector(from)
  const end = normalizeVector(to)
  const dot = Math.max(-1, Math.min(1, start.x * end.x + start.y * end.y + start.z * end.z))

  if (dot < -0.999999) {
    const helper = Math.abs(start.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    return quaternionFromAxisAngle({
      x: start.y * helper.z - start.z * helper.y,
      y: start.z * helper.x - start.x * helper.z,
      z: start.x * helper.y - start.y * helper.x,
    }, Math.PI)
  }

  return normalizeQuaternion({
    x: start.y * end.z - start.z * end.y,
    y: start.z * end.x - start.x * end.z,
    z: start.x * end.y - start.y * end.x,
    w: 1 + dot,
  })
}

export function rotateVector(vector: Vector3, quaternion: Quaternion): Vector3 {
  const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y)
  const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z)
  const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x)
  return {
    x: vector.x + quaternion.w * tx + quaternion.y * tz - quaternion.z * ty,
    y: vector.y + quaternion.w * ty + quaternion.z * tx - quaternion.x * tz,
    z: vector.z + quaternion.w * tz + quaternion.x * ty - quaternion.y * tx,
  }
}

export function interpolateQuaternions(from: Quaternion, to: Quaternion, amount: number): Quaternion {
  const dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w
  const target = dot < 0 ? { x: -to.x, y: -to.y, z: -to.z, w: -to.w } : to
  return normalizeQuaternion({
    x: from.x + (target.x - from.x) * amount,
    y: from.y + (target.y - from.y) * amount,
    z: from.z + (target.z - from.z) * amount,
    w: from.w + (target.w - from.w) * amount,
  })
}

export function pointOnTrackball(x: number, y: number, radius: number): Vector3 {
  const safeRadius = Math.max(radius, 1)
  const normalizedX = x / safeRadius
  const normalizedY = y / safeRadius
  const distance = Math.hypot(normalizedX, normalizedY)
  const sphereEdge = Math.SQRT1_2

  // Continue onto a hyperbolic sheet outside the sphere so diagonal drags
  // keep changing the mapped point instead of sticking to the rim.
  const z = distance <= sphereEdge
    ? Math.sqrt(Math.max(0, 1 - distance * distance))
    : (sphereEdge * sphereEdge) / Math.max(distance, Number.EPSILON)

  return normalizeVector({ x: normalizedX, y: normalizedY, z })
}
