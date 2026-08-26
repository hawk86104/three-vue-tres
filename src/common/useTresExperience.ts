import { useLoop, useTres, useTresContext } from '@tresjs/core'
import { nextTick, onUnmounted, watch } from 'vue'
import { Vector2 } from 'three'

type Experience = {
    setParameters?: (value: object) => void
    update?: (frame: Record<string, unknown>) => void | Promise<void>
    resize?: (size: Record<string, number>) => void
    render?: (frame: Record<string, unknown>) => void | Promise<void>
    dispose?: () => void
}

export async function useTresExperience(
    adapter: any,
    parameters: object,
    emitProgress?: (progress: number) => void,
) {
    const { renderer, scene, camera, sizes } = useTres() as any
    const { controls } = useTresContext()
    const { onBeforeRender, render } = useLoop()
    const targetSize = new Vector2()
    const timeOffset = adapter.initialTime ?? 0
    let activeCamera: any
    let activeControls: any
    let experience: Experience | undefined
    let manager: any
    let managerCallbacks: Record<string, unknown> | undefined

    watch(parameters, value => experience?.setParameters?.(value), { deep: true })
    watch([sizes.width, sizes.height, sizes.pixelRatio], () => {
        if (!experience) return
        renderer.getDrawingBufferSize(targetSize)
        experience.resize?.({
            width: sizes.width.value,
            height: sizes.height.value,
            bufferWidth: targetSize.x,
            bufferHeight: targetSize.y,
            dpr: sizes.pixelRatio.value,
        })
    })
    onBeforeRender(async ({ delta, elapsed }) => {
        await experience?.update?.({
            delta,
            rawDelta: delta,
            elapsed: elapsed + timeOffset,
            camera: activeCamera,
            controls: activeControls,
        })
    })
    onUnmounted(() => {
        if (manager && managerCallbacks) Object.assign(manager, managerCallbacks)
        experience?.dispose?.()
    })

    const THREE = adapter.backend === 'webgpu'
        ? await import('three/webgpu')
        : await import('three')

    manager = THREE.DefaultLoadingManager
    managerCallbacks = {
        onStart: manager.onStart,
        onLoad: manager.onLoad,
        onProgress: manager.onProgress,
        onError: manager.onError,
    }
    manager.onStart = () => emitProgress?.(8)
    manager.onProgress = (_url: string, loaded: number, total: number) => {
        emitProgress?.(Math.min(95, Math.round((loaded / Math.max(total, 1)) * 95)))
    }
    manager.onLoad = () => emitProgress?.(98)

    emitProgress?.(3)
    await nextTick()
    await renderer.init?.()
    activeCamera = camera.value
    activeControls = controls.value
    const assetBase = new URL(adapter.assetBase, window.location.origin)
    experience = await adapter.setup({
        THREE,
        renderer,
        scene: scene.value,
        camera: activeCamera,
        controls: activeControls,
        resolveAsset: (path: string) => new URL(path.replace(/^\.\//, ''), assetBase).href,
    })
    Object.assign(manager, managerCallbacks)
    experience?.setParameters?.(parameters)
    emitProgress?.(100)
    renderer.getDrawingBufferSize(targetSize)
    experience?.resize?.({
        width: sizes.width.value,
        height: sizes.height.value,
        bufferWidth: targetSize.x,
        bufferHeight: targetSize.y,
        dpr: sizes.pixelRatio.value,
    })

    if (experience?.render) {
        render((done) => {
            const result = experience?.render?.({
                renderer,
                scene: scene.value,
                camera: activeCamera,
                controls: activeControls,
            })
            if (result instanceof Promise) result.finally(done)
            else done()
        })
    }

    return experience
}
