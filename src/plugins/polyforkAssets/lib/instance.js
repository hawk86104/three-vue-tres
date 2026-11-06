import { Box3, Group, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { loadPolyforkRemix } from './remix.js'
import { mergePolyforkParams, validatePolyforkParams } from './parameters.js'
import { createPolyforkPartBinding, mergePolyforkParts, readPolyforkParts } from './parts.js'

const definitions = new Map()
const instances = new WeakMap()
const copy = (value) => JSON.parse(JSON.stringify(value))

function nextFrame() {
    return new Promise((resolve) => {
        const finish = () => { clearTimeout(timer); cancelAnimationFrame(frame); resolve() }
        // Newly opened tabs may pause the editor's animation frames.
        const timer = setTimeout(finish, 50)
        const frame = requestAnimationFrame(finish)
    })
}

function loadDefinition(id) {
    if (!definitions.has(id)) {
        definitions.set(id, loadPolyforkRemix(id).then((definition) => {
            let generation = Promise.resolve()
            return {
                schema: { params: definition.schema.params || {}, presets: definition.schema.presets || {} },
                rig: definition.module.rig && Object.keys(definition.module.rig).length ? definition.module.rig : definition.asset.rigged_parts || {},
                // Some modules reuse mutable resources. Clone each result before
                // allowing the next instance to invoke the same generator.
                generate: (params, isStale) => {
                    const result = generation.then(async () => isStale() ? null : ownContent(await definition.createAsset(params)))
                    generation = result.then(() => undefined, () => undefined)
                    return result
                },
            }
        }).catch((error) => {
            definitions.delete(id)
            throw error
        }))
    }
    return definitions.get(id)
}

function readConfig(input) {
    if (input?.version !== 1 || typeof input.assetId !== 'string' || !/^[a-z0-9-]+$/i.test(input.assetId)) {
        throw new Error('Polyfork 实例配置或版本无效')
    }
    if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) throw new Error('Polyfork 参数格式不正确')
    if (!Object.values(input.params).every((value) => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) {
        throw new Error('Polyfork 参数必须是字符串、布尔值或有限数值')
    }
    const anchor = input.anchor
    if (anchor !== undefined && (!anchor || !Number.isFinite(anchor.scale) || anchor.scale <= 0 ||
        !Array.isArray(anchor.position) || anchor.position.length !== 3 || !anchor.position.every(Number.isFinite))) {
        throw new Error('Polyfork 固定锚点无效')
    }
    const parts = readPolyforkParts(input.parts)
    return copy({ version: 1, assetId: input.assetId, params: input.params, ...(anchor ? { anchor } : {}), ...(Object.keys(parts).length ? { parts } : {}) })
}

// Never dispose a generator's resources: modules may cache them. Each displayed
// instance owns clones, including geometry, materials and texture state.
function ownContent(generated) {
    if (!generated?.isObject3D) throw new Error('模型程序没有返回可显示的三维对象')
    const object = cloneSkeleton(generated)
    const resources = new Map()
    const own = (resource) => {
        if (!resources.has(resource)) resources.set(resource, resource.clone())
        return resources.get(resource)
    }
    object.traverse((node) => {
        if (node.geometry) node.geometry = own(node.geometry)
        if (node.skeleton) resources.set(node.skeleton, node.skeleton)
        const ownMaterial = (material) => {
            const cloned = own(material)
            Object.entries(material).forEach(([key, value]) => {
                if (value?.isTexture) cloned[key] = own(value)
            })
            return cloned
        }
        if (node.material) node.material = Array.isArray(node.material) ? node.material.map(ownMaterial) : ownMaterial(node.material)
    })
    return { object, dispose: () => { new Set(resources.values()).forEach((resource) => resource.dispose()) } }
}

function initialAnchor(object) {
    const bounds = new Box3().setFromObject(object)
    const size = bounds.getSize(new Vector3())
    const scale = 3 / Math.max(size.x, size.y, size.z)
    if (bounds.isEmpty() || !Number.isFinite(scale) || scale <= 0) throw new Error('无法计算 Polyfork 模型大小')
    const center = bounds.getCenter(new Vector3())
    return { scale, position: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] }
}

export const getPolyforkInstance = (object) => object && instances.get(object)

// Attaching to an exported GLB is synchronous and does not request the program.
// Only a parameter update needs the upstream module; the baked model works offline.
export function attachPolyforkInstance(object, input, { beforeUpdate } = {}) {
    if (instances.has(object)) throw new Error('Polyfork 实例已初始化')
    let config = readConfig(input)
    let desiredParams = copy(config.params)
    let desiredParts = copy(config.parts || {})
    let schema = null
    let partControls = []
    let partWarnings = []
    let content = object.children[0] || null
    let owned = null
    let revision = 0
    let cancellation = 0
    let disposed = false
    let pending = Promise.resolve(false)

    const cancelPending = () => { revision += 1; cancellation += 1; desiredParams = copy(config.params); desiredParts = copy(config.parts || {}) }
    const restore = (inputConfig, { signal, beforeCommit, requiredParts = [] } = {}) => {
        if (disposed) return Promise.resolve(false)
        const nextConfig = readConfig(inputConfig)
        if (nextConfig.assetId !== config.assetId) throw new Error('不能更换已有 Polyfork 实例的资产 ID')
        const version = ++revision
        desiredParams = copy(nextConfig.params)
        desiredParts = copy(nextConfig.parts || {})
        const stale = () => disposed || version !== revision || signal?.aborted
        pending = (async () => {
            // Limit generation to the latest request in each display frame.
            await nextFrame()
            if (stale()) return false
            const definition = await loadDefinition(config.assetId)
            if (stale()) return false
            schema = definition.schema
            const params = validatePolyforkParams(schema, nextConfig.params)
            const next = await definition.generate(params, stale)
            if (!next) return false
            if (stale()) { next.dispose(); return false }
            let wrapper
            let anchor
            let binding
            let pose
            try {
                beforeCommit?.()
                // Fit the unposed tree once; posing must never move the anchor.
                anchor = nextConfig.anchor || config.anchor || initialAnchor(next.object)
                binding = createPolyforkPartBinding(next.object, definition.rig, schema.params)
                pose = binding.apply(nextConfig.parts, requiredParts)
                wrapper = new Group()
                wrapper.name = 'polyfork-content'
                wrapper.scale.setScalar(anchor.scale)
                wrapper.position.fromArray(anchor.position)
                wrapper.add(next.object)
                wrapper.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = object.castShadow
                        node.receiveShadow = object.receiveShadow
                    }
                })
                const bounds = new Box3().setFromObject(wrapper)
                if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
                    throw new Error('生成模型的包围盒无效')
                }
            } catch (error) {
                next.dispose()
                throw error
            }
            // Everything that may fail is prepared before touching the live root.
            const previous = owned
            if (content) object.remove(content)
            object.add(wrapper)
            content = wrapper
            owned = next
            config = { version: 1, assetId: config.assetId, params, anchor: copy(anchor) }
            if (Object.keys(pose.state).length) config.parts = pose.state
            partControls = binding.controls
            partWarnings = pose.warnings
            desiredParams = copy(params)
            desiredParts = copy(pose.state)
            object.updateWorldMatrix(true, true)
            previous?.dispose()
            return true
        })().catch((error) => {
            if (stale()) return false
            desiredParams = copy(config.params)
            desiredParts = copy(config.parts || {})
            throw new Error(`Polyfork [${config.assetId}] 更新失败：${error.message || error}`)
        })
        return pending
    }
    const setParams = async (patch) => {
        if (disposed) return false
        beforeUpdate?.()
        const version = cancellation
        const definition = await loadDefinition(config.assetId)
        if (disposed || version !== cancellation) return false
        beforeUpdate?.()
        return restore({ ...config, params: mergePolyforkParams(definition.schema, desiredParams, patch), parts: desiredParts }, { beforeCommit: beforeUpdate })
    }
    const getParams = () => copy(config.params)
    const getParts = () => copy(config.parts || {})
    const setParts = (patch) => restore({ ...config, params: desiredParams, parts: mergePolyforkParts(desiredParts, patch) }, {
        beforeCommit: beforeUpdate, requiredParts: Object.entries(patch).filter(([, value]) => value !== null).map(([name]) => name),
    })
    const runtime = {
        object,
        get schema() { return schema },
        get partControls() { return partControls },
        get partWarnings() { return partWarnings },
        getConfig: () => copy(config),
        restore,
        setParams,
        setParts,
        cancelPending,
        whenIdle: () => pending.catch(() => false),
        // Runtime bindings do not write editor configuration or operation history.
        bindingApi: Object.freeze({
            getParams,
            setParams: (patch) => setParams(patch).catch((error) => { console.error(error); return false }),
            getParts,
            setParts: async (patch) => {
                try { return await setParts(patch) }
                catch (error) { console.error(error); return false }
            },
        }),
        dispose: () => {
            disposed = true
            cancelPending()
            owned?.dispose()
            owned = null
            if (content) object.remove(content)
            instances.delete(object)
        },
    }
    instances.set(object, runtime)
    return runtime
}

export async function createPolyforkInstance(config, options) {
    const object = new Group()
    object.castShadow = true
    object.receiveShadow = true
    const runtime = attachPolyforkInstance(object, config, options)
    try {
        if (!await runtime.restore(config, options)) throw new Error('Polyfork 模型加载已取消')
        return runtime
    } catch (error) {
        runtime.dispose()
        throw error
    }
}
