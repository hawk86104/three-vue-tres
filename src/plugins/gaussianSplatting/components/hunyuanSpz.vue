<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-04-20 11:48:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-21 15:56:49
-->
<template>
    <TresGroup :rotation="[-Math.PI / 2, 0, 0]">
        <primitive v-if="sceneRoot" :object="sceneRoot" />
    </TresGroup>
</template>

<script lang="ts" setup>
import { onUnmounted, shallowRef, watch } from 'vue'
import { useTres } from '@tresjs/core'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { Group, WebGLRenderer } from 'three'
import { createHunyuanSpzColliderBinding, type HunyuanSpzColliderBinding } from '../common/hunyuanSpzCollider'

const props = withDefaults(defineProps<{
    url?: string
    lod?: boolean | number
    extSplats?: boolean
    paged?: boolean
    maxStdDev?: number
    sortRadial?: boolean
    lodSplatScale?: number
    pagedExtSplats?: boolean
    useColliderUrl?: boolean
    colliderUrl?: string
}>(), {
    url: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.spz',
    lod: true,
    extSplats: false,
    paged: false,
    maxStdDev: 2,
    sortRadial: true,
    lodSplatScale: 1,
    pagedExtSplats: false,
    useColliderUrl: false,
    colliderUrl: 'https://cos.icegl.cn/model/gaussianSplatting/jiedao.ply',
})

const { renderer } = useTres() as any

type SparkScene = {
    root: Group
    splatMesh: SplatMesh
    sparkRenderer: SparkRenderer
    colliderBinding: HunyuanSpzColliderBinding
}

const sceneRoot = shallowRef<Group | null>(null)
let activeScene: SparkScene | null = null
let loadVersion = 0

const resolveRenderer = () => (renderer?.value ?? renderer ?? null) as WebGLRenderer | null

const normalizeLod = (value: boolean | number) => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) {
            return true
        }
        return value
    }

    return value
}

const normalizeMaxStdDev = (value: number) => {
    if (!Number.isFinite(value)) {
        return Math.sqrt(8)
    }

    return Math.min(Math.sqrt(9), Math.max(Math.sqrt(4), value))
}

const normalizeLodSplatScale = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
        return 1
    }

    return value
}

const applySparkRendererProps = () => {
    if (!activeScene) {
        return
    }

    activeScene.sparkRenderer.maxStdDev = normalizeMaxStdDev(props.maxStdDev)
    activeScene.sparkRenderer.sortRadial = props.sortRadial
    activeScene.sparkRenderer.lodSplatScale = normalizeLodSplatScale(props.lodSplatScale)
    activeScene.sparkRenderer.pagedExtSplats = props.pagedExtSplats
}

const disposeScene = (targetScene: SparkScene | null) => {
    if (!targetScene) {
        return
    }

    targetScene.root.removeFromParent()
    targetScene.colliderBinding.dispose()
    targetScene.splatMesh.dispose()
    ;(targetScene.sparkRenderer as any).dispose?.()
}

const createScene = async () => {
    const webglRenderer = resolveRenderer()
    if (!webglRenderer) {
        return null
    }

    const splatMesh = new SplatMesh({
        url: props.url,
        lod: normalizeLod(props.lod),
        extSplats: props.extSplats,
        paged: props.paged,
    })
    // splatMesh.rotation.x = -Math.PI / 2
    await splatMesh.initialized

    const sparkRenderer = new SparkRenderer({
        renderer: webglRenderer,
        maxStdDev: normalizeMaxStdDev(props.maxStdDev),
        sortRadial: props.sortRadial,
        lodSplatScale: normalizeLodSplatScale(props.lodSplatScale),
        pagedExtSplats: props.pagedExtSplats,
    })

    const root = new Group()
    root.add(sparkRenderer)
    root.add(splatMesh)

    const colliderBinding = createHunyuanSpzColliderBinding({
        root,
        sparkRenderer,
        splatMesh,
    })
    await colliderBinding.sync({
        useColliderUrl: props.useColliderUrl,
        colliderUrl: props.colliderUrl,
    })

    return {
        root,
        splatMesh,
        sparkRenderer,
        colliderBinding,
    } satisfies SparkScene
}

const refreshScene = async () => {
    const currentVersion = ++loadVersion
    const nextScene = await createScene()
    if (!nextScene) {
        return
    }

    if (currentVersion !== loadVersion) {
        disposeScene(nextScene)
        return
    }

    const previousScene = activeScene
    activeScene = nextScene
    sceneRoot.value = nextScene.root
    disposeScene(previousScene)
}

const refreshCollider = async () => {
    if (!activeScene) {
        return
    }

    await activeScene.colliderBinding.sync({
        useColliderUrl: props.useColliderUrl,
        colliderUrl: props.colliderUrl,
    })
}

watch(() => resolveRenderer(), (webglRenderer) => {
    if (webglRenderer && !activeScene) {
        void refreshScene()
    }
}, {
    immediate: true,
})

watch(() => props.url, () => {
    void refreshScene()
})

watch(
    [
        () => props.lod,
        () => props.extSplats,
        () => props.paged,
    ],
    () => {
        void refreshScene()
    },
)

watch(
    [() => props.maxStdDev, () => props.sortRadial, () => props.lodSplatScale, () => props.pagedExtSplats],
    applySparkRendererProps,
)

watch(
    [() => props.useColliderUrl, () => props.colliderUrl],
    () => {
        void refreshCollider()
    },
)

onUnmounted(() => {
    loadVersion++
    const currentScene = activeScene
    activeScene = null
    sceneRoot.value = null
    disposeScene(currentScene)
})
</script>
