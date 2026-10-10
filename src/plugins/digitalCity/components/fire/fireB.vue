<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-08-24 22:59:23
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-01-28 08:55:44
-->
<script setup lang="ts">
import { watch, shallowRef, toRaw, useAttrs } from 'vue'
import { useTexture } from '@tresjs/cientos'
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'
import { default as SPE } from '../../common/ShaderParticleEngine/build/SPE'

const props = withDefaults(defineProps<{
  color?: string
  particleCount?: number
}>(), {
  color: "#ff0000",
  particleCount: 150,
})

type Vec3Array = [number, number, number]
type Vec3Object = { x: number; y: number; z: number }
type Vec3 = Vec3Array | Vec3Object
function normalizeVec3(
    value: Vec3 | number | undefined,
    defaultValue: Vec3Array = [0, 0, 0]
): Vec3Array {
    if (typeof value === 'number') {
        return [value, value, value]
    }

    if (Array.isArray(value)) {
        const [x = 0, y = 0, z = 0] = value
        return [x, y, z]
    }

    if (value && typeof value === 'object') {
        const { x = 0, y = 0, z = 0 } = value
        return [x, y, z]
    }

    return defaultValue
}
const { state: pTexture } = useTexture('./plugins/digitalCity/image/smokeparticle.png')

let particleGroup = null as any
const objCloud = shallowRef<THREE.Mesh | null>(null)

const makeEmitter = () => {
  const tempscale = normalizeVec3(attrs?.scale, [1, 1, 1])
  const scaleX = tempscale[0]
  const scaleY = tempscale[1]
  const scaleZ = tempscale[2]

  const emitter = new SPE.Emitter({
    type: SPE.distributions.SPHERE,
    particleCount: props.particleCount,
    maxAge: { value: 3 },
    position: {
      value: new THREE.Vector3(0, 0, 0),
      spread: new THREE.Vector3(1, 1, 1),
      radius: 1,
    },
    velocity: {
      value: new THREE.Vector3(0, 20, 0),
      spread: new THREE.Vector3(12, 40, 12),
      distribution: SPE.distributions.BOX,
    },
    size: { value: [200 * scaleX, 100 * scaleY, 10 * scaleZ] },
    color: { value: new THREE.Color(props.color), spread: new THREE.Vector3(0.05, 0.05, 0.01) },
  })

  particleGroup.addEmitter(emitter)
}
watch(
  () => pTexture.value,
  (mapv) => {
    if (!mapv) return
    particleGroup = new SPE.Group({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      maxParticleCount: 1500,
      texture: {
        value: mapv
      },
    })
    makeEmitter()
    objCloud.value = particleGroup.mesh
  })

watch(
  () => [props.color, props.particleCount],
  () => {
    if (particleGroup?.emitters[0]) {
      particleGroup.emitters[0].remove()
      makeEmitter()
    }
  }
)

const attrs = useAttrs()
watch(
  () => attrs.scale,
  (obj) => {
    if (particleGroup?.emitters[0]) {
      particleGroup.emitters[0].remove()
      makeEmitter()
    }

  }, { deep: true }
)
const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  if (particleGroup) {
    particleGroup.tick()
  }
})
</script>

<template>
  <TresGroup>
    <primitive v-if="objCloud" :object="toRaw(objCloud)" :renderOrder="3001" />
  </TresGroup> 
</template>
