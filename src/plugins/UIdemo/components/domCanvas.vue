<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core'
import { CanvasTexture, DoubleSide, LinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector2, Vector4, WebGLRenderer } from 'three'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { createSceneCapture, DOM_CANVAS_MARKER } from './domCanvas/captureScene'
import { bounded, DOM_CANVAS_DEFAULTS } from './domCanvas/defaults'
import type { DomCanvasProps } from './domCanvas/defaults'
import { createRasterizer } from './domCanvas/rasterize'
import fragmentShader from '../shaders/domCanvas/panel.frag?raw'
import vertexShader from '../shaders/domCanvas/panel.vert?raw'

const props = withDefaults(defineProps<DomCanvasProps>(), DOM_CANVAS_DEFAULTS)
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{
  ready: []
  error: [error: Error]
  warning: [message: string]
}>()
const { invalidate } = useTres()
const settings = computed(() => {
  const pixelWidth = Math.round(bounded(props.pixelWidth, 16, 2048, 512))
  const pixelHeight = Math.round(bounded(props.pixelHeight, 16, 2048, 256))
  return {
    domContent: props.domContent,
    pixelWidth,
    pixelHeight,
    pixelRatio: Math.min(bounded(props.pixelRatio, 0.5, 4, 2), 4096 / Math.max(pixelWidth, pixelHeight)),
    width: bounded(props.width, 0.01, 10000, 4),
  }
})

const rasterizer = createRasterizer()
const capture = createSceneCapture()
let contentTexture: CanvasTexture | null = null
let maskTexture: CanvasTexture | null = null
let hasGlass = false
let mounted = false
let disposed = false
let running = false
let revision = 0
const viewport = new Vector4()
const material = new ShaderMaterial({
  vertexShader,
  fragmentShader,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  side: DoubleSide,
  forceSinglePass: true,
  uniforms: {
    contentMap: { value: null },
    glassMap: { value: null },
    sceneMap: { value: capture.target.texture },
    viewportOrigin: { value: new Vector2() },
    viewportSize: { value: new Vector2(1, 1) },
    pixelSize: { value: new Vector2(512, 256) },
    contentScale: { value: 1 },
    opacity: { value: 1 },
    glassEnabled: { value: false },
  },
})
const mesh = new Mesh(new PlaneGeometry(1, 1), material)
mesh.userData[DOM_CANVAS_MARKER] = true
// Hide just the material while loading so the user's visible attribute is intact.
material.visible = false
mesh.onBeforeRender = (renderer) => {
  renderer.getCurrentViewport(viewport)
  material.uniforms.viewportOrigin.value.set(viewport.x, viewport.y)
  material.uniforms.viewportSize.value.set(viewport.z, viewport.w)
}

function makeTexture(canvas: HTMLCanvasElement, color = false) {
  const texture = new CanvasTexture(canvas)
  if (color) { texture.colorSpace = SRGBColorSpace }
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

async function drainRefreshes() {
  if (running || !mounted || disposed) { return }
  running = true
  try {
    let completed = -1
    while (completed !== revision) {
      if (disposed) { break }
      const current = revision
      const snapshot = { ...settings.value }
      try {
        const result = await rasterizer.render(snapshot)
        if (!disposed && current === revision) {
          const nextContent = makeTexture(result.content, true)
          const nextMask = makeTexture(result.mask)
          contentTexture?.dispose()
          maskTexture?.dispose()
          contentTexture = nextContent
          maskTexture = nextMask
          material.uniforms.contentMap.value = nextContent
          material.uniforms.glassMap.value = nextMask
          material.uniforms.pixelSize.value.set(snapshot.pixelWidth, snapshot.pixelHeight)
          material.uniforms.contentScale.value = result.contentScale
          hasGlass = result.hasGlass
          material.visible = true
          result.warnings.forEach(message => emit('warning', message))
          invalidate()
          emit('ready')
        }
      }
      catch (error) {
        if (!disposed && current === revision) { emit('error', error instanceof Error ? error : new Error(String(error))) }
      }
      completed = current
    }
  }
  finally {
    running = false
  }
}

function refresh() {
  revision++
  void drainRefreshes()
}
defineExpose({ root: mesh, material, refresh })

watch(() => [props.domContent, props.pixelWidth, props.pixelHeight, props.pixelRatio, props.refreshKey], refresh)
watch(() => [settings.value.width, settings.value.pixelWidth, settings.value.pixelHeight], () => {
  const { width, pixelWidth, pixelHeight } = settings.value
  const previous = mesh.geometry
  mesh.geometry = new PlaneGeometry(width, width * pixelHeight / pixelWidth)
  previous.dispose()
  invalidate()
}, { immediate: true })
watch(() => props.opacity, () => {
  material.uniforms.opacity.value = bounded(props.opacity, 0, 1, 1)
  invalidate()
}, { immediate: true })
watch(() => [props.glass, props.captureScale], () => invalidate())

const { onBeforeRender } = useLoop()
const { off } = onBeforeRender(({ renderer, scene, camera }) => {
  material.uniforms.glassEnabled.value = false
  if (disposed || !hasGlass || !props.glass || !camera.value || !material.visible || props.opacity <= 0) { return }
  for (let ancestor: typeof mesh.parent = mesh; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible) { return }
  }
  if (!(renderer instanceof WebGLRenderer)) { return }
  capture.capture(renderer, scene.value, camera.value, mesh, bounded(props.captureScale, 0.1, 1, 0.5))
  material.uniforms.glassEnabled.value = true
})

onMounted(() => {
  mounted = true
  refresh()
})
onBeforeUnmount(() => {
  disposed = true
  revision++
  off()
  rasterizer.dispose()
  capture.dispose()
  contentTexture?.dispose()
  maskTexture?.dispose()
  mesh.geometry.dispose()
  material.dispose()
})
</script>

<template>
  <!-- 编辑器导出的 Object3D 属性与三维指针事件直接绑定到面板网格。 -->
  <primitive v-bind="$attrs" :object="mesh" :dispose="null" />
</template>
