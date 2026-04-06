<template>
    <TresGroup>
        <TresMesh :scale="[1000, 800, height]" :material="material" :rotateX="-Math.PI / 2"
            :position-y="1">
            <TresPlaneGeometry :args="[1, 1, 529, 420]" />
        </TresMesh>
    </TresGroup>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { computed, watch } from 'vue'
import { useTexture } from 'PLS/basic'

const DEFAULT_IMAGE_URL = `${process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn'}/images/simpleGIS/SATE_L1_F2G_VISSR_MWB_NOM_FDI-201906171300.HDF.png`

const props = withDefaults(
    defineProps<{
        imageUrl?: string
        height?: number
        color?: string
        opacity?: number
    }>(),
    {
        height: 10,
        color: '#cccccc',
        opacity: 0.6,
    },
)

const textureUrl = computed(() => props.imageUrl || DEFAULT_IMAGE_URL)

const placeholderTexture = new THREE.Texture()
const material = new THREE.MeshPhongMaterial({
    map: placeholderTexture,
    displacementMap: placeholderTexture,
    transparent: true,
    side: THREE.DoubleSide,
    opacity: props.opacity,
    color: new THREE.Color(props.color),
})

material.onBeforeCompile = (shader: any) => {
    shader.vertexShader = `uniform sampler2D map;
		` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
        '#include <displacementmap_vertex>',
        'transformed += normalize( objectNormal ) * ( texture2D(map, vMapUv ).a * 0.5 + 0.0 );',
    )
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphamap_fragment>',
        `
            #include <alphamap_fragment>
            float h = texture2D(map, vMapUv ).a;
            diffuseColor.rgb *= h;
            diffuseColor.a = clamp(diffuseColor.a * 2.0, 0.0, 1.0);
            `,
    )
}

watch(
    textureUrl,
    async (imageUrl) => {
        const texture = (await useTexture(imageUrl)) as THREE.Texture
        texture.colorSpace = THREE.SRGBColorSpace
        material.map = texture
        material.needsUpdate = true
    },
    { immediate: true },
)

watch(
    () => [props.color, props.opacity],
    ([color, opacity]) => {
        material.color.setStyle(color)
        material.opacity = opacity
    },
)
</script>
