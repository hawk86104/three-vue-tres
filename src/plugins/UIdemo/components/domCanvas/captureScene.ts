import { Color, HalfFloatType, Matrix3, NoToneMapping, Plane, Vector2, Vector3, Vector4, WebGLRenderTarget } from 'three'
import type { Camera, Mesh, Scene, WebGLRenderer } from 'three'

export const DOM_CANVAS_MARKER = 'isDomCanvasPanel'

export function createSceneCapture() {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true })
  const size = new Vector2()
  const origin = new Vector3()
  const normal = new Vector3()
  const cameraPosition = new Vector3()
  const normalMatrix = new Matrix3()
  const clip = new Plane()
  const viewport = new Vector4()
  const scissor = new Vector4()
  const clearColor = new Color()

  function capture(renderer: WebGLRenderer, scene: Scene, camera: Camera, panel: Mesh, scale: number) {
    renderer.getDrawingBufferSize(size)
    const width = Math.max(1, Math.min(2048, Math.round(size.x * scale)))
    const height = Math.max(1, Math.min(2048, Math.round(size.y * scale)))
    if (target.width !== width || target.height !== height) { target.setSize(width, height) }

    panel.updateWorldMatrix(true, false)
    origin.setFromMatrixPosition(panel.matrixWorld)
    normal.set(0, 0, 1).applyMatrix3(normalMatrix.getNormalMatrix(panel.matrixWorld)).normalize()
    camera.getWorldPosition(cameraPosition)
    if (normal.dot(cameraPosition.sub(origin)) > 0) { normal.negate() }
    clip.setFromNormalAndCoplanarPoint(normal, origin)

    const hidden: Array<{ visible: boolean }> = []
    scene.traverse((object) => {
      if (object.userData[DOM_CANVAS_MARKER] && object.visible) {
        hidden.push(object)
        object.visible = false
      }
    })
    const previousTarget = renderer.getRenderTarget()
    const cubeFace = renderer.getActiveCubeFace()
    const mipLevel = renderer.getActiveMipmapLevel()
    renderer.getViewport(viewport)
    renderer.getScissor(scissor)
    renderer.getClearColor(clearColor)
    const clearAlpha = renderer.getClearAlpha()
    const scissorTest = renderer.getScissorTest()
    const clippingPlanes = renderer.clippingPlanes
    const autoClear = renderer.autoClear
    const toneMapping = renderer.toneMapping
    const xrEnabled = renderer.xr.enabled
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate
    try {
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      renderer.clippingPlanes = [...clippingPlanes, clip]
      renderer.toneMapping = NoToneMapping
      renderer.autoClear = true
      renderer.setRenderTarget(target)
      renderer.setViewport(0, 0, width, height)
      renderer.setScissorTest(false)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)
    }
    finally {
      hidden.forEach(object => object.visible = true)
      renderer.clippingPlanes = clippingPlanes
      renderer.toneMapping = toneMapping
      renderer.autoClear = autoClear
      renderer.xr.enabled = xrEnabled
      renderer.shadowMap.autoUpdate = shadowAutoUpdate
      renderer.setRenderTarget(previousTarget, cubeFace, mipLevel)
      renderer.setViewport(viewport)
      renderer.setScissor(scissor)
      renderer.setScissorTest(scissorTest)
      renderer.setClearColor(clearColor, clearAlpha)
    }
  }

  return { target, capture, dispose: () => target.dispose() }
}
