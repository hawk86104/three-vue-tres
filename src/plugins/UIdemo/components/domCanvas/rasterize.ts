import { toCanvas } from 'html-to-image'
import { containLayout } from './fitContent'

export interface RasterOptions {
  domContent: string
  pixelWidth: number
  pixelHeight: number
  pixelRatio: number
}

export interface RasterResult {
  content: HTMLCanvasElement
  mask: HTMLCanvasElement
  hasGlass: boolean
  contentScale: number
  warnings: string[]
}

// Each job owns its nodes. Disposing a component can remove even an in-flight job.
export function createRasterizer() {
  const hosts = new Set<HTMLElement>()
  let disposed = false

  async function render(options: RasterOptions): Promise<RasterResult> {
    if (disposed) { throw new Error('dom-canvas rasterizer is disposed') }
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;contain:layout style paint;'
    host.setAttribute('aria-hidden', 'true')
    host.inert = true
    hosts.add(host)
    const shadow = host.attachShadow({ mode: 'closed' })
    const root = document.createElement('div')
    root.style.cssText = `width:${options.pixelWidth}px;height:${options.pixelHeight}px;overflow:hidden;position:relative;background:transparent;color:black;font:16px Arial,sans-serif;`
    const layout = document.createElement('div')
    layout.style.cssText = 'display:flow-root;position:relative;width:max-content;height:auto;'
    // This is a presentation API for trusted HTML, not a full HTML sanitizer.
    const template = document.createElement('template')
    template.innerHTML = options.domContent
    template.content.querySelectorAll('script,iframe,object,embed,link,base,meta').forEach(node => node.remove())
    template.content.querySelectorAll('*').forEach((node) => {
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name)) { node.removeAttribute(attribute.name) }
      }
    })
    layout.append(template.content)
    root.append(layout)
    shadow.append(root)
    document.body.append(host)
    try {
      root.getBoundingClientRect()
      await Promise.all(Array.from(root.querySelectorAll('img'), image => image.decode()))
      await document.fonts.ready
      if (disposed) { throw new Error('dom-canvas rasterizer is disposed') }
      const contentScale = containLayout(layout, options.pixelWidth, options.pixelHeight)

      const warnings = new Set<string>()
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
      const maskRoot = root.cloneNode(true) as HTMLElement
      const maskNodes = [maskRoot, ...Array.from(maskRoot.querySelectorAll<HTMLElement>('*'))]
      let hasGlass = false
      // Freeze computed styles before stripping paint. Layout, transforms, clipping
      // and ancestor opacity stay identical to the content snapshot.
      nodes.forEach((node, index) => {
        const style = getComputedStyle(node)
        const maskNode = maskNodes[index]
        if (!maskNode.style) { return }
        for (const property of Array.from(style)) { maskNode.style.setProperty(property, style.getPropertyValue(property)) }
        const filter = style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter')
        const match = /^blur\(([\d.]+)px\)$/.exec(filter.trim())
        const radius = match ? Math.min(64, Number(match[1])) : 0
        if (filter && filter !== 'none' && !match) { warnings.add('仅支持普通元素的 backdrop-filter: blur(px)，其他背景滤镜未复刻。') }
        for (const pseudo of ['::before', '::after']) {
          const pseudoFilter = getComputedStyle(node, pseudo).getPropertyValue('backdrop-filter')
          if (pseudoFilter && pseudoFilter !== 'none') { warnings.add('伪元素的毛玻璃请迁移到普通 HTML 元素。') }
        }
        hasGlass ||= radius > 0
        const paint = {
          'background': radius > 0 ? `rgb(${Math.round(radius / 64 * 255)},0,0)` : 'transparent',
          'background-clip': 'padding-box',
          'color': 'transparent',
          '-webkit-text-fill-color': 'transparent',
          'border-color': 'transparent',
          'border-image': 'none',
          'box-shadow': 'none',
          'text-shadow': 'none',
          'outline-color': 'transparent',
          'backdrop-filter': 'none',
          '-webkit-backdrop-filter': 'none',
          'fill': 'transparent',
          'stroke': 'transparent',
          'caret-color': 'transparent',
        }
        for (const [property, value] of Object.entries(paint)) { maskNode.style.setProperty(property, value, 'important') }
        if (/^(?:IMG|VIDEO|CANVAS|SVG|INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) { maskNode.style.setProperty('visibility', 'hidden', 'important') }
        // Background blur is handled in the scene shader, never baked into text.
        node.style?.setProperty('backdrop-filter', 'none', 'important')
        node.style?.setProperty('-webkit-backdrop-filter', 'none', 'important')
      })

      const snapshotOptions = {
        width: options.pixelWidth,
        height: options.pixelHeight,
        pixelRatio: options.pixelRatio,
      }
      const content = await toCanvas(root, snapshotOptions)
      if (disposed) { throw new Error('dom-canvas rasterizer is disposed') }
      root.replaceWith(maskRoot)
      // Remove cloned style rules after computed styles have been frozen.
      maskRoot.querySelectorAll('style').forEach(node => node.remove())
      const maskStyle = document.createElement('style')
      maskStyle.textContent = '*::before,*::after { visibility:hidden !important; }'
      shadow.append(maskStyle)
      const mask = hasGlass ? await toCanvas(maskRoot, snapshotOptions) : document.createElement('canvas')
      return { content, mask, hasGlass, contentScale, warnings: [...warnings] }
    }
    finally {
      host.remove()
      hosts.delete(host)
    }
  }

  return {
    render,
    dispose() {
      disposed = true
      hosts.forEach(host => host.remove())
      hosts.clear()
    },
  }
}
