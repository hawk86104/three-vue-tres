import { Box3, Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const apiUrl = 'https://polyfork.dev/api'
const loader = new GLTFLoader()
let retryAt = 0

function checkRateLimit() {
    if (Date.now() < retryAt) {
        throw new Error(`Polyfork 请求过多，请在 ${Math.ceil((retryAt - Date.now()) / 1000)} 秒后重试（429）`)
    }
}

function handleRateLimit(response) {
    const now = Date.now()
    const header = response.headers.get('Retry-After')
    const until = header && /^\d+$/.test(header) ? now + Number(header) * 1000 : Date.parse(header || '')
    retryAt = Math.max(retryAt, until > now ? until : now + 60000)
    checkRateLimit()
}

async function getJson(url) {
    checkRateLimit()
    const response = await fetch(url)
    if (response.status === 429) handleRateLimit(response)
    if (!response.ok) throw new Error(`Polyfork API: ${response.status}`)
    return response.json()
}

export async function searchPolyforkAssets({ q, class: assetClass, max_triangles, page = 1, per_page = 10 } = {}) {
    const params = new URLSearchParams({ page: String(page), per_page: String(per_page) })
    if (q) params.set('q', q)
    if (assetClass) params.set('class', assetClass)
    if (max_triangles) params.set('max_triangles', String(max_triangles))

    const result = await getJson(`${apiUrl}/assets?${params}`)
    if (!Array.isArray(result.assets)) throw new Error('Polyfork 搜索结果格式不正确')
    return result
}

export function getPolyforkAsset(id) {
    return getJson(`${apiUrl}/assets/${encodeURIComponent(id)}`)
}

export async function addPolyforkAsset(scene, id, position = [0, 0, 0], { maxSize = 3 } = {}) {
    if (!Number.isFinite(maxSize) || maxSize <= 0) throw new Error('模型目标尺寸必须大于 0')

    const asset = await getPolyforkAsset(id)
    const url = asset.download?.glb
    if (!url) throw new Error('该模型没有可用的 GLB 地址')

    checkRateLimit()
    let gltf
    try {
        gltf = await loader.loadAsync(url)
    } catch (error) {
        if (error.response?.status === 429) handleRateLimit(error.response)
        throw error
    }
    const bounds = new Box3().setFromObject(gltf.scene)
    const size = bounds.getSize(new Vector3())
    const scale = maxSize / Math.max(size.x, size.y, size.z)
    if (bounds.isEmpty() || !Number.isFinite(scale) || scale <= 0) {
        throw new Error('无法计算模型大小')
    }

    const center = bounds.getCenter(new Vector3())
    const content = new Group()
    content.add(gltf.scene)
    content.scale.setScalar(scale)
    content.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)

    const model = new Group()
    model.position.set(...position)
    model.add(content)
    scene.add(model)
    return { asset, model, animationRoot: gltf.scene, animations: gltf.animations }
}
