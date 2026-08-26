import { WebGPURenderer } from 'three/webgpu'
import { unref } from 'vue'

export const createWebGPURenderer = ({ canvas }: { canvas: any }) => {
    const renderer = new WebGPURenderer({
        canvas: unref(canvas),
        antialias: true,
        powerPreference: 'high-performance',
    }) as any
    const initialize = renderer.init.bind(renderer)
    const render = renderer.render.bind(renderer)
    let initialized = false
    let initialization: Promise<unknown> | undefined

    renderer.init = () => {
        initialization ??= (async () => {
            const result = await initialize()
            initialized = true
            return result
        })()
        return initialization
    }
    renderer.render = (...args: unknown[]) => {
        if (!initialized) {
            void renderer.init()
            return
        }
        return render(...args)
    }

    void renderer.init()
    return renderer
}
