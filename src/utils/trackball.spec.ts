import { describe, expect, it } from 'vitest'
import {
  conjugateQuaternion,
  identityQuaternion,
  multiplyQuaternions,
  pointOnTrackball,
  quaternionBetweenVectors,
  rotateVector,
} from './trackball'

function expectVectorClose(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 6)
  expect(actual.y).toBeCloseTo(expected.y, 6)
  expect(actual.z).toBeCloseTo(expected.z, 6)
}

describe('virtual trackball', () => {
  it('maps diagonal dragging to a single free three-dimensional rotation', () => {
    const start = pointOnTrackball(0, 0, 100)
    const end = pointOnTrackball(50, 50, 100)
    const rotation = quaternionBetweenVectors(start, end)

    expectVectorClose(rotateVector(start, rotation), end)
  })

  it('keeps a grabbed point following the pointer after an inverted orientation', () => {
    const inverted = quaternionBetweenVectors({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })
    const start = pointOnTrackball(-35, -20, 100)
    const end = pointOnTrackball(45, 30, 100)
    const drag = quaternionBetweenVectors(start, end)
    const orientation = multiplyQuaternions(drag, inverted)
    const modelPoint = rotateVector(start, conjugateQuaternion(inverted))

    expectVectorClose(rotateVector(modelPoint, orientation), end)
  })

  it('keeps diagonal movement responsive beyond the visible sphere edge', () => {
    const first = pointOnTrackball(120, 120, 100)
    const second = pointOnTrackball(180, 180, 100)
    const rotation = quaternionBetweenVectors(first, second)

    expect(first).not.toEqual(second)
    expect(Math.abs(rotation.w)).toBeLessThan(1)
    expectVectorClose(rotateVector(first, rotation), second)
  })
})
