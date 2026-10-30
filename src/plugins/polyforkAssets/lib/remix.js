import * as THREE from 'three'
import * as bufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import * as convexHull from 'three/addons/math/ConvexHull.js'
import * as decalGeometry from 'three/addons/geometries/DecalGeometry.js'
import { getPolyforkAsset, getPolyforkModuleSource, getPolyforkParams } from './polyfork.js'

const dependencies = {
    three: THREE,
    'three/addons/utils/BufferGeometryUtils.js': bufferGeometryUtils,
    'three/addons/math/ConvexHull.js': convexHull,
    'three/addons/geometries/DecalGeometry.js': decalGeometry,
}

// Polyfork modules use bare imports. Bridge them to this application's Three.js
// so models and the Tres renderer share the same constructors and resources.
async function importPolyforkModule(source, { imports = {} } = {}) {
    const key = `__tvtPolyfork_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const urls = new Map()
    globalThis[key] = dependencies
    try {
        const rewritten = source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(three(?:\/addons\/[^'"]+)?|\.\/sdf\.mjs)(\2)/g,
            (match, prefix, quote, name, closing, offset) => {
                if (imports[name]) return `${prefix}${quote}${imports[name]}${quote}`
                if (!dependencies[name]) {
                    const line = source.slice(source.lastIndexOf('\n', offset) + 1, offset)
                    if (/^\s*(?:import|export)\b/.test(line)) throw new Error(`暂不支持模型依赖 ${name}`)
                    return match
                }
                if (!urls.has(name)) {
                    const exports = Object.keys(dependencies[name])
                        .filter((item) => /^[A-Za-z_$][\w$]*$/.test(item))
                        .map((item, index) => `const binding${index} = namespace[${JSON.stringify(item)}]; export { binding${index} as ${item} };`)
                        .join('\n')
                    const bridge = `const namespace = globalThis[${JSON.stringify(key)}][${JSON.stringify(name)}];\n${exports}`
                    urls.set(name, URL.createObjectURL(new Blob([bridge], { type: 'text/javascript' })))
                }
                return `${prefix}${quote}${urls.get(name)}${quote}`
            })
        const moduleUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }))
        urls.set('model', moduleUrl)
        const module = await import(/* @vite-ignore */ moduleUrl)
        return module
    } catch (error) {
        throw new Error(`模型程序加载失败：${error.message || error}`)
    } finally {
        urls.forEach((url) => URL.revokeObjectURL(url))
        delete globalThis[key]
    }
}

export async function loadPolyforkRemix(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) throw new Error('模型 ID 无效')
    const [asset, schema, source] = await Promise.all([
        getPolyforkAsset(id),
        getPolyforkParams(id),
        getPolyforkModuleSource(id),
    ])
    const module = await importPolyforkModule(source)
    const createAsset = module.createAsset || module.default
    if (typeof createAsset !== 'function') throw new Error('模型程序没有 createAsset')
    return { asset, schema: schema || { params: {}, presets: {} }, createAsset, module }
}

// Helpers are loaded only when a model needs them. The SDF module keeps its
// blob URL until disposal because it also uses that URL to start its worker.
export function createPolyforkHelperLoader() {
    const pending = new Map()
    let sdfUrl = ''
    let disposed = false
    const assertActive = () => { if (disposed) throw new Error('编辑器已关闭') }

    async function load(name) {
        assertActive()
        if (!['walk', 'decal'].includes(name)) throw new Error('未知模型工具')
        if (!pending.has(name)) {
            const promise = (async () => {
                if (name === 'decal') {
                    const [source, sdfSource] = await Promise.all([getPolyforkModuleSource('decal'), getPolyforkModuleSource('sdf')])
                    assertActive()
                    sdfUrl = URL.createObjectURL(new Blob([sdfSource], { type: 'text/javascript' }))
                    const sdf = await import(/* @vite-ignore */ sdfUrl)
                    assertActive()
                    const decal = await importPolyforkModule(source, { imports: { './sdf.mjs': sdfUrl } })
                    return { ...decal, sdfFromSvg: sdf.sdfFromSvg }
                }
                const source = await getPolyforkModuleSource(name)
                assertActive()
                return importPolyforkModule(source)
            })().catch((error) => {
                pending.delete(name)
                if (name === 'decal' && sdfUrl) { URL.revokeObjectURL(sdfUrl); sdfUrl = '' }
                throw error
            })
            pending.set(name, promise)
        }
        return pending.get(name)
    }

    function dispose() {
        disposed = true
        if (sdfUrl) URL.revokeObjectURL(sdfUrl)
        sdfUrl = ''
    }

    return { load, dispose }
}
