<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-09-01 09:14:44
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-29 12:33:04
-->
<template>
    <TresGroup ref="groupRef">
        <primitive :object="tiles.group" />
    </TresGroup>
</template>

<script lang="ts" setup>
import { useTres, useLoop } from '@tresjs/core'
import { TilesRenderer } from '3d-tiles-renderer'
import { GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { watch, ref, onBeforeUnmount } from 'vue'
import { alignmentCenter, applyTransform } from '../common/utils'

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

class GLTFImplicitKTX2Extension {
    name = 'ICEGL_implicit_ktx2'
    parser

    constructor(parser: any) {
        this.parser = parser
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
    newTiles.fetchOptions.mode = 'cors'
    syncTilesRuntimeOptions(newTiles)
    const ktx2Loader = new KTX2Loader().setTranscoderPath('./basis/').detectSupport(renderer)
    newTiles.registerPlugin(
        new GLTFExtensionsPlugin({
            dracoLoader: new DRACOLoader().setDecoderPath('./draco/'),
            ktxLoader: ktx2Loader,
            plugins: [(parser: any) => new GLTFImplicitKTX2Extension(parser)],
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
})
</script>
