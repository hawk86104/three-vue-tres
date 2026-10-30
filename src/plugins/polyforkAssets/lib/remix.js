import * as THREE from 'three'
import * as bufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import * as convexHull from 'three/addons/math/ConvexHull.js'
import { getPolyforkAsset, getPolyforkModuleSource, getPolyforkParams } from './polyfork.js'

const dependencies = {
    three: THREE,
    'three/addons/utils/BufferGeometryUtils.js': bufferGeometryUtils,
    'three/addons/math/ConvexHull.js': convexHull,
}

// Polyfork modules use bare imports. Bridge them to this application's Three.js
// so models and the Tres renderer share the same constructors and resources.
async function importPolyforkModule(source) {
    const key = `__tvtPolyfork_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const urls = new Map()
    globalThis[key] = dependencies
    try {
        const rewritten = source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(three(?:\/addons\/[^'"]+)?)(\2)/g,
            (match, prefix, quote, name, closing, offset) => {
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
        const createAsset = module.createAsset || module.default
        if (typeof createAsset !== 'function') throw new Error('模型程序没有 createAsset')
        return createAsset
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
    const createAsset = await importPolyforkModule(source)
    return { asset, schema: schema || { params: {}, presets: {} }, createAsset }
}
