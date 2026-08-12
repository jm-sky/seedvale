export async function captureSnapshot(
  canvas: HTMLCanvasElement,
  reportText: string,
): Promise<Blob> {
  const out = document.createElement('canvas')
  const panelHeight = Math.min(320, Math.max(160, reportText.split('\n').length * 14 + 24))
  out.width = canvas.width
  out.height = canvas.height + panelHeight
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.fillStyle = '#14181c'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)

  const scale = out.width / canvas.clientWidth
  const y0 = canvas.height
  ctx.fillStyle = '#0e1216'
  ctx.fillRect(0, y0, out.width, panelHeight)
  ctx.fillStyle = '#d8e0ea'
  ctx.font = `${Math.round(11 * scale)}px monospace`
  let y = y0 + 16 * scale
  for (const line of reportText.split('\n').slice(0, 24)) {
    ctx.fillText(line, 12 * scale, y)
    y += 14 * scale
  }

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('snapshot failed'))
    }, 'image/png')
  })
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
