export const DOM_CANVAS_DEFAULTS = {
  domContent: `<div style="box-sizing:border-box;margin:20px;padding:28px;border:1px solid #ffffff66;border-radius:24px;background:linear-gradient(135deg,#16345c99,#397ba333);backdrop-filter:blur(12px);color:white;font-family:Arial,sans-serif">
  <div style="font-size:28px;font-weight:bold;margin-bottom:14px">DOM · Canvas</div>
  <div style="font-size:18px;line-height:1.7">HTML 进入三维场景<br>透明背景 · 圆角毛玻璃 · 深度遮挡</div>
</div>`,
  pixelWidth: 512,
  pixelHeight: 256,
  width: 4,
  pixelRatio: 2,
  opacity: 1,
  glass: true,
  captureScale: 0.5,
  refreshKey: 0,
}

export interface DomCanvasProps {
  domContent?: string
  pixelWidth?: number
  pixelHeight?: number
  width?: number
  pixelRatio?: number
  opacity?: number
  glass?: boolean
  captureScale?: number
  refreshKey?: number
}

export function bounded(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
