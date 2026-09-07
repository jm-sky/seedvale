import fs from 'node:fs'
import path from 'node:path'
import { DOCS_DIR } from '../docs/config.js'

const dir = path.resolve('public/models/characters')

function readGlbAnimations(filePath: string): string[] {
  const buffer = fs.readFileSync(filePath)

  if (buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB file')
  }

  let offset = 12

  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    offset += 8

    // JSON chunk: 0x4E4F534A ("JSON")
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(
        buffer
          .subarray(offset, offset + chunkLength)
          .toString('utf8')
          .replace(/\0+$/, ''),
      ) as {
        animations?: Array<{ name?: string }>
      }

      return (json.animations ?? []).map(
        (animation, index) => animation.name ?? `<unnamed-${index}>`,
      )
    }

    offset += chunkLength
  }

  return []
}


function main() {
  const output: string[] = []
  const animationModelMatrix: Record<string, string[]> = {}

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith('.glb'))
    .sort()

  const totalModels = files.length
  const allModels = files.map((file) => file.split('.')[0])

  output.push('# Character Animations')
  output.push('')

  output.push('## Models')
  output.push('')

  for (const file of files) {
    try {
      const animations = readGlbAnimations(path.join(dir, file))
      const model = file.split('.')[0]

      for (const animation of animations) {
        animationModelMatrix[animation] = [...(animationModelMatrix[animation] ?? []), model]
        // output.push(`| ${model.padEnd(20)} | ${animation.padEnd(30)} |`)
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      console.error(`\n${file}`)
      console.error(`  ERROR: ${message}`)
    }
  }

  output.push('| Model                | Stats        | Has              | Has not          |')
  output.push('|----------------------|--------------|------------------|------------------|')

  for (const [animation, models] of Object.entries(animationModelMatrix)) {
    const stats = `${models.length} / ${totalModels}`
    const has = models.at(0) ?? '-'
    const hasNot = allModels.filter((model) => !models.includes(model)).join(', ')
    output.push(`| ${animation.padEnd(20)} | ${stats.padStart(12)} | ${has.padEnd(16)} | ${hasNot.padEnd(16)} |`)
  }

  const outputPath = path.resolve(DOCS_DIR, 'assets/character-animations.md')

  fs.writeFileSync(outputPath, output.join('\n'))

  console.log(`Output written to ${outputPath}`)
}

main()
