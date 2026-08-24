#!/usr/bin/env node
// Audits every GLB in public/models/settlement/furniture/: parses the GLB JSON
// chunk directly (no geometry decode) and derives per-file native world-space
// AABB from required POSITION accessor min/max, plus material names. Same
// technique as scripts/audit-megakit.mjs (plan 111), applied to the plan 169
// furniture pack instead of the MegaKit — not a second measurement tool.
// Output feeds src/assets/furnitureAudit.generated.json, which
// constructionCatalog.ts consumes alongside the MegaKit audit.
//
// Usage: node scripts/audit-furniture.mjs > src/assets/furnitureAudit.generated.json

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stdout } from 'node:process'

const FURNITURE_DIR = 'public/models/settlement/furniture'

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

function composeTRS(t, r, s) {
  const [x, y, z, w] = r
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  const [sx, sy, sz] = s
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ]
}

function nodeLocalMatrix(node) {
  if (node.matrix) return node.matrix
  const t = node.translation ?? [0, 0, 0]
  const r = node.rotation ?? [0, 0, 0, 1]
  const s = node.scale ?? [1, 1, 1]
  return composeTRS(t, r, s)
}

function transformPoint(m, p) {
  const [x, y, z] = p
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

function stripName(raw) {
  if (!raw) return raw
  return raw.replace(/\.\d+$/, '')
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB')
  let offset = 12
  let bin, json
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset)
    const chunkType = buf.readUInt32LE(offset + 4)
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength)
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunkData.toString('utf8'))
    else if (chunkType === 0x004e4942) bin = chunkData
    offset += 8 + chunkLength
  }
  return { bin, json }
}

function auditFile(path) {
  const buf = readFileSync(path)
  const { json } = parseGlb(buf)
  if (!json) return { error: 'no JSON chunk' }

  const nodes = json.nodes ?? []
  const meshes = json.meshes ?? []
  const accessors = json.accessors ?? []
  const materials = json.materials ?? []
  const sceneIdx = json.scene ?? 0
  const scene = json.scenes?.[sceneIdx]

  let worldMin = [Infinity, Infinity, Infinity]
  let worldMax = [-Infinity, -Infinity, -Infinity]
  const nodeNames = []
  const meshNodeInfo = []
  let missingBounds = false

  function visit(nodeIdx, parentMatrix) {
    const node = nodes[nodeIdx]
    if (!node) return
    if (node.name) nodeNames.push(stripName(node.name))
    const local = nodeLocalMatrix(node)
    const world = multiply(parentMatrix, local)

    if (node.mesh !== undefined) {
      const mesh = meshes[node.mesh]
      for (const prim of mesh.primitives ?? []) {
        const posAccessorIdx = prim.attributes?.POSITION
        if (posAccessorIdx === undefined) continue
        const acc = accessors[posAccessorIdx]
        if (!acc?.min || !acc?.max) { missingBounds = true; continue }
        const corners = []
        for (let cx = 0; cx < 2; cx++) {
          for (let cy = 0; cy < 2; cy++) {
            for (let cz = 0; cz < 2; cz++) {
              corners.push([
                cx ? acc.max[0] : acc.min[0],
                cy ? acc.max[1] : acc.min[1],
                cz ? acc.max[2] : acc.min[2],
              ])
            }
          }
        }
        for (const c of corners) {
          const wp = transformPoint(world, c)
          worldMin = [Math.min(worldMin[0], wp[0]), Math.min(worldMin[1], wp[1]), Math.min(worldMin[2], wp[2])]
          worldMax = [Math.max(worldMax[0], wp[0]), Math.max(worldMax[1], wp[1]), Math.max(worldMax[2], wp[2])]
        }
        if (prim.material !== undefined) {
          const mat = materials[prim.material]
          if (mat?.name) meshNodeInfo.push(mat.name)
        }
      }
    }

    for (const child of node.children ?? []) visit(child, world)
  }

  const roots = scene?.nodes ?? []
  for (const rootIdx of roots) visit(rootIdx, identity())

  const hasBounds = Number.isFinite(worldMin[0]) && Number.isFinite(worldMax[0])
  if (!hasBounds || missingBounds) return { error: 'no POSITION bounds' }

  const round = (v) => Math.round(v * 1000) / 1000
  const TOL = 0.05
  const symmetricX = Math.abs(worldMin[0] + worldMax[0]) < TOL
  const symmetricZ = Math.abs(worldMin[2] + worldMax[2]) < TOL
  const originAtBaseY = Math.abs(worldMin[1]) < TOL

  return {
    dimensions: [worldMax[0] - worldMin[0], worldMax[1] - worldMin[1], worldMax[2] - worldMin[2]].map(round),
    min: worldMin.map(round),
    max: worldMax.map(round),
    materials: [...new Set(meshNodeInfo)],
    symmetricX,
    symmetricZ,
    originAtBaseY,
  }
}

function main() {
  const files = readdirSync(FURNITURE_DIR).filter((f) => f.endsWith('.glb')).sort()
  const out = {}
  for (const file of files) {
    const name = file.replace(/\.glb$/, '')
    try {
      out[name] = auditFile(join(FURNITURE_DIR, file))
    } catch (err) {
      out[name] = { error: String(err) }
    }
  }
  stdout.write(JSON.stringify(out, null, 2))
}

main()
