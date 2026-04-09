<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-09-01 09:14:44
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-09 11:12:19
-->
<template>
    <TresGroup ref="groupRef">
        <primitive :object="tiles.group" />
    </TresGroup>
</template>

<script lang="ts" setup>
import { useTres, useLoop } from '@tresjs/core'
import { FMessage } from '@fesjs/fes-design'
import { getActivePinia } from 'pinia'
import { TilesRenderer } from '3d-tiles-renderer'
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { watch, ref, onBeforeUnmount } from 'vue'
import { alignmentCenter, applyTransform } from '../common/utils'
import * as THREE from 'three'

declare global {
    interface Window {
        gisPlaneEditor_extendMeshes_group?: any
    }
}

const props = withDefaults(
    defineProps<{
        tilesUrl?: string
        isRotation?: boolean
        isRranslation?: boolean
        errorTarget?: number
    }>(),
    {
        tilesUrl: './plugins/geokit/tiles/tileset.json',
        isRotation: false,
        isRranslation: true,
        errorTarget: 16,
    },
)

const groupRef = ref(null as any)
const { camera, renderer, sizes } = useTres()
const LEGACY_BINARY_ERROR = 'Legacy binary file detected'

const getTilesNativeGeoPosition = () => {
    const box = new THREE.Box3()
    const sphere = new THREE.Sphere()
    let center = null as THREE.Vector3 | null

    if (tiles.getBoundingBox(box) && !box.isEmpty()) {
        center = box.getCenter(new THREE.Vector3())
    } else if (tiles.getBoundingSphere(sphere) && Number.isFinite(sphere.radius) && sphere.radius > 0) {
        center = sphere.center.clone()
    }

    if (!center) {
        throw new Error('倾斜摄影原始坐标尚未准备完成，请稍后再试')
    }

    const cartographic = { lat: 0, lon: 0, height: 0 }
    tiles.ellipsoid.getPositionToCartographic(center, cartographic)

    if (
        !Number.isFinite(cartographic.lon)
        || !Number.isFinite(cartographic.lat)
        || !Number.isFinite(cartographic.height)
    ) {
        throw new Error('倾斜摄影原始坐标解析失败')
    }

    return {
        lon: Number(THREE.MathUtils.radToDeg(cartographic.lon).toFixed(6)),
        lat: Number(THREE.MathUtils.radToDeg(cartographic.lat).toFixed(6)),
        height: Number(cartographic.height.toFixed(3)),
    }
}

const getGisPlaneEditorGeoPositionTarget = () => {
    if (!window.gisPlaneEditor_extendMeshes_group) {
        return null
    }

    const pinia = getActivePinia() as any
    const emxlist = pinia?.state?.value?.gisPlaneEditorExtendMeshList?.emxlist
    if (!emxlist) {
        return null
    }

    let current = tiles.group?.parent as any
    while (current) {
        const uuid = current.uuid
        if (uuid && emxlist[uuid]) {
            const mesh = emxlist[uuid]
            if (mesh?.object3D) {
                return mesh.object3D
            }
        }
        current = current.parent
    }

    return null
}

const applyNativeGeoPosition = () => {
    const target = getGisPlaneEditorGeoPositionTarget()
    if (!target) {
        return
    }

    const geoPosition = getTilesNativeGeoPosition()
    if (!target.geoPosition) {
        target.geoPosition = { lon: 0, lat: 0, height: 0 }
    }

    Object.assign(target.geoPosition, geoPosition)
    return geoPosition
}

class GLTFImplicitCompatibilityExtension {
    name = 'ICEGL_implicit_compatibility'
    parser

    constructor(parser: any) {
        this.parser = parser
        this.ensureImplicitExtensionsUsed()
    }

    ensureImplicitExtensionsUsed() {
        const json = this.parser?.json
        if (!json?.materials?.some((material: any) => material?.extensions?.KHR_materials_unlit)) {
            return
        }

        const extensionsUsed = Array.isArray(json.extensionsUsed) ? json.extensionsUsed : []
        if (!extensionsUsed.includes('KHR_materials_unlit')) {
            json.extensionsUsed = [...extensionsUsed, 'KHR_materials_unlit']
        }
    }

    loadTexture(textureIndex: number) {
        const json = this.parser.json
        const textureDef = json.textures?.[textureIndex]
        const sourceIndex = textureDef?.source
        const sourceDef = sourceIndex === undefined ? null : json.images?.[sourceIndex]
        const ktx2Loader = this.parser.options.ktx2Loader

        if (!sourceDef || sourceDef.mimeType !== 'image/ktx2' || textureDef?.extensions?.KHR_texture_basisu || !ktx2Loader) {
            return null
        }

        return this.parser.loadTextureImage(textureIndex, sourceIndex, ktx2Loader)
    }
}

const setCameraAndRenderer = (newTiles: any, camera: any, renderer: any) => {
    newTiles.setCamera(camera)
    newTiles.setResolutionFromRenderer(camera, renderer)
}
const syncTilesRuntimeOptions = (newTiles: any) => {
    newTiles.errorTarget = props.errorTarget
}
const makeNewTiles = () => {
    let newTiles = new TilesRenderer(props.tilesUrl as string) as any
    let hasWarnedLegacyBinary = false

    newTiles.fetchOptions.mode = 'cors'
    syncTilesRuntimeOptions(newTiles)
    const ktx2Loader = new KTX2Loader().setTranscoderPath('./basis/').detectSupport(renderer)
    newTiles.registerPlugin(
        new GLTFExtensionsPlugin({
            dracoLoader: new DRACOLoader().setDecoderPath('./draco/'),
            ktxLoader: ktx2Loader,
            plugins: [(parser: any) => new GLTFImplicitCompatibilityExtension(parser)],
        }),
    )

    newTiles.addEventListener('load-tile-set', () => {
        alignmentCenter(newTiles, props.isRotation, props.isRranslation)
    })
    newTiles.addEventListener('dispose-model', ({ scene }) => {
        scene.traverse((c: any) => {
            if (c.material) {
                c.material.dispose()
            }
        })
    })
    newTiles.addEventListener('load-error', ({ error, url }) => {
        const message = error instanceof Error ? error.message : String(error ?? '未知错误')

        if (!message.includes(LEGACY_BINARY_ERROR) || hasWarnedLegacyBinary) {
            return
        }

        hasWarnedLegacyBinary = true
        FMessage.error?.({
            content: '当前倾斜摄影数据内嵌的是旧版 glTF 1.0 b3dm，three.js 现版 GLTFLoader 无法加载，请先将数据转换为 glTF 2.0 / 3D Tiles 1.0+。',
            colorful: true,
            duration: 8,
        })
        console.error('[obliquePhoto] 检测到旧版 glTF 1.0 b3dm 数据，当前运行时不支持直接加载。', {
            tilesUrl: props.tilesUrl,
            failedUrl: String(url),
            error,
        })
    })

    setCameraAndRenderer(newTiles, camera.value, renderer)
    return newTiles
}
let tiles = makeNewTiles()

watch(
    () => [props.isRotation, props.isRranslation],
    () => {
        if (tiles.group) {
            applyTransform(tiles.group, props.isRotation, props.isRranslation)
        }
    },
)

watch(
    camera,
    () => {
        if (camera.value) {
            setCameraAndRenderer(tiles, camera.value, renderer)
        }
    },
    { immediate: true },
)
watch(
    () => props.errorTarget,
    () => {
        syncTilesRuntimeOptions(tiles)
    },
)
const { onBeforeRender } = useLoop()
onBeforeRender(() => {
    if (camera.value && sizes.width.value && tiles.update) {
        camera.value.updateMatrixWorld()
        tiles.update()
    }
})
watch(
    () => props.tilesUrl,
    (tilesUrl) => {
        if (tilesUrl !== tiles.rootURL) {
            tiles.dispose()
            tiles = makeNewTiles()
        }
    },
)
onBeforeUnmount(() => {
    tiles.dispose()
})
defineExpose({
    group: groupRef,
    tilesGroup: tiles.group,
    applyNativeGeoPosition,
})
</script>
