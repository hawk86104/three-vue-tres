/** Fit a measured HTML layout into the output viewport without changing its layout. */
export function fitContent(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.min(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight))
  return {
    scale,
    x: (width - sourceWidth * scale) / 2,
    y: (height - sourceHeight * scale) / 2,
  }
}

export function containLayout(layout: HTMLElement, width: number, height: number) {
  const rect = layout.getBoundingClientRect()
  // Keep the intrinsic layout stable when the output viewport changes.
  layout.style.width = `${rect.width}px`
  layout.style.height = `${rect.height}px`
  let left = 0
  let top = 0
  let right = Math.max(rect.width, layout.scrollWidth)
  let bottom = Math.max(rect.height, layout.scrollHeight)
  for (const child of Array.from(layout.querySelectorAll('*'))) {
    const bounds = child.getBoundingClientRect()
    if (!bounds.width && !bounds.height) { continue }
    left = Math.min(left, bounds.left - rect.left)
    top = Math.min(top, bounds.top - rect.top)
    right = Math.max(right, bounds.right - rect.left)
    bottom = Math.max(bottom, bounds.bottom - rect.top)
  }
  const fit = fitContent(right - left, bottom - top, width, height)
  layout.style.transformOrigin = '0 0'
  layout.style.transform = `translate(${fit.x - left * fit.scale}px, ${fit.y - top * fit.scale}px) scale(${fit.scale})`
  return fit.scale
}
