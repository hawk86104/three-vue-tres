<template>
    <div class="polyfork-page">
        <aside class="panel">
            <div class="panel-header">
                <span class="eyebrow">POLYFORK / TVT.JS</span>
                <h1>模型搜索</h1>
                <p>搜索 Polyfork 低模，选择后直接在场景中查看。</p>
            </div>

            <form class="search-form" @submit.prevent="submitSearch">
                <label>
                    关键词
                    <input v-model.trim="query" placeholder="输入中文或英文，例如叉车 / truck" />
                </label>
                <div class="filters">
                    <label>
                        分类
                        <select v-model="assetClass">
                            <option value="">全部分类</option>
                            <option v-for="item in classes" :key="item" :value="item">{{ item }}</option>
                        </select>
                    </label>
                    <label>
                        最大三角面数
                        <input v-model.number="maxTriangles" type="number" min="1" step="1" placeholder="不限" />
                    </label>
                </div>
                <button class="search-button" type="submit" :disabled="searching">
                    {{ translating ? '翻译中…' : searching ? '搜索中…' : '搜索模型' }}
                </button>
            </form>
            <p v-if="translatedQuery" class="message translation" aria-live="polite">已翻译为：{{ translatedQuery }}</p>

            <div class="results-header">
                <strong>搜索结果</strong>
                <span v-if="!searching">{{ total }} 个模型</span>
            </div>
            <p v-if="searchError" class="message error" role="alert">{{ searchError }}</p>
            <p v-else-if="coverageHint" class="message">{{ coverageHint }}</p>
            <p v-if="!searching && !searchError && !assets.length" class="message">没有找到模型，请调整搜索条件。</p>

            <div class="results">
                <button
                    v-for="asset in assets"
                    :key="asset.id"
                    type="button"
                    class="asset"
                    :class="{ selected: displayedAsset?.id === asset.id }"
                    :disabled="searching"
                    @click="selectAsset(asset)"
                >
                    <img v-if="asset.thumbnail" :src="asset.thumbnail" alt="" loading="lazy" />
                    <span v-else class="thumbnail-placeholder">3D</span>
                    <span class="asset-info">
                        <strong>{{ asset.title || asset.id }}</strong>
                        <small>{{ asset.class }} · {{ asset.triangles?.toLocaleString() ?? '—' }} 三角面</small>
                    </span>
                    <span class="asset-action">{{ loadingId === asset.id ? '加载中…' : '查看' }}</span>
                </button>
            </div>
            <div v-if="total > pageSize" class="pagination">
                <button type="button" :disabled="searching || page <= 1" @click="search(page - 1)">上一页</button>
                <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
                <button type="button" :disabled="searching || page * pageSize >= total" @click="search(page + 1)">下一页</button>
            </div>
        </aside>

        <main class="viewer">
            <TresCanvas clear-color="#e9eef3" :tone-mapping="NoToneMapping">
                <TresPerspectiveCamera :position="[5, 4, 7]" :fov="45" :near="0.01" :far="1000" />
                <OrbitControls :target="[0, 1, 0]" />
                <TresAmbientLight :intensity="1.2" />
                <TresDirectionalLight :position="[4, 8, 6]" :intensity="2" />
                <TresGridHelper :args="[12, 12, 0x9aabb9, 0xc7d2db]" />
                <primitive :object="modelGroup" />
            </TresCanvas>
            <div class="viewer-info">
                <template v-if="displayedAsset">
                    <strong>{{ displayedAsset.title }}</strong>
                    <span>{{ displayedAsset.id }}</span>
                    <a :href="displayedAsset.page" target="_blank" rel="noopener noreferrer">查看原始资源 ↗</a>
                </template>
                <span v-else>{{ loadingId ? '正在加载模型…' : '选择一个模型开始查看' }}</span>
            </div>
            <p v-if="loadError" class="viewer-error" role="alert">{{ loadError }}</p>
            <div class="viewer-tip">拖动旋转 · 滚轮缩放</div>
        </main>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { Group, NoToneMapping } from 'three'
import { addPolyforkAsset, searchPolyforkAssets } from '../lib/polyfork.js'
import { translateToEnglish } from '../lib/translate.js'

const classes = ['prop', 'building', 'vehicle', 'character', 'animal', 'ultra', 'attachment', 'terrain', 'hand']
const pageSize = 10
const query = ref('叉车')
const assetClass = ref('')
const maxTriangles = ref('')
const assets = ref([])
const total = ref(0)
const page = ref(1)
const searching = ref(false)
const translating = ref(false)
const translatedQuery = ref('')
const searchError = ref('')
const coverageHint = ref('')
const loadError = ref('')
const loadingId = ref('')
const displayedAsset = ref(null)
const modelGroup = new Group()
let filters = {}
let currentModel = null
let searchVersion = 0
let loadVersion = 0
let disposed = false

function disposeModel(model) {
    const resources = new Set()
    model.traverse((object) => {
        if (object.geometry) resources.add(object.geometry)
        if (object.skeleton) resources.add(object.skeleton)
        for (const material of [object.material].flat().filter(Boolean)) {
            resources.add(material)
            Object.values(material).forEach((value) => {
                if (value?.isTexture) resources.add(value)
            })
        }
    })
    resources.forEach((resource) => resource.dispose())
}

function clearModel() {
    if (currentModel) {
        modelGroup.remove(currentModel)
        disposeModel(currentModel)
        currentModel = null
    }
    displayedAsset.value = null
}

async function selectAsset(asset) {
    const version = ++loadVersion
    loadingId.value = asset.id
    loadError.value = ''
    try {
        const loaded = await addPolyforkAsset(modelGroup, asset.id)
        if (disposed || version !== loadVersion) {
            modelGroup.remove(loaded.model)
            disposeModel(loaded.model)
            return
        }
        clearModel()
        currentModel = loaded.model
        displayedAsset.value = loaded.asset
    } catch (error) {
        if (!disposed && version === loadVersion) loadError.value = `模型加载失败：${error.message || error}`
    } finally {
        if (!disposed && version === loadVersion) loadingId.value = ''
    }
}

async function search(nextPage) {
    const version = ++searchVersion
    ++loadVersion
    loadingId.value = ''
    searching.value = true
    translating.value = false
    searchError.value = ''
    loadError.value = ''
    try {
        const searchFilters = { ...filters }
        if (!translatedQuery.value && /\p{Script=Han}/u.test(searchFilters.q)) {
            translating.value = true
            searchFilters.q = await translateToEnglish(searchFilters.q)
            if (disposed || version !== searchVersion) return
            translating.value = false
            translatedQuery.value = searchFilters.q
            filters = searchFilters
        }
        const result = await searchPolyforkAssets({ ...searchFilters, page: nextPage, per_page: pageSize })
        if (disposed || version !== searchVersion) return
        assets.value = result.assets
        total.value = result.total || 0
        page.value = result.page || nextPage
        coverageHint.value = {
            none: '没有明确匹配的模型，请尝试其他关键词。',
            poor: '匹配度较低，请检查关键词后选择结果。',
            filtered_out: '筛选条件排除了匹配结果，请尝试放宽条件。',
        }[result.coverage] || ''
        clearModel()
    } catch (error) {
        if (!disposed && version === searchVersion) {
            assets.value = []
            total.value = 0
            coverageHint.value = ''
            clearModel()
            searchError.value = `搜索失败：${error.message || error}`
        }
    } finally {
        if (!disposed && version === searchVersion) {
            translating.value = false
            searching.value = false
        }
    }
}

function submitSearch() {
    filters = { q: query.value, class: assetClass.value, max_triangles: maxTriangles.value }
    translatedQuery.value = ''
    search(1)
}

onMounted(submitSearch)
onUnmounted(() => {
    disposed = true
    ++searchVersion
    ++loadVersion
    clearModel()
})
</script>

<style scoped>
.polyfork-page { position: fixed; inset: 0; display: flex; color: #1e2c37; font: 14px/1.5 system-ui, sans-serif; background: #e9eef3; }
.panel { z-index: 1; display: flex; flex: 0 0 360px; flex-direction: column; min-height: 0; padding: 22px; background: #fff; box-shadow: 4px 0 24px #243d4d12; }
.panel-header h1 { margin: 3px 0; font-size: 24px; }
.panel-header p { margin: 4px 0 18px; color: #687985; }
.eyebrow { color: #218d79; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
.search-form, .search-form label { display: grid; gap: 7px; }
.search-form label { color: #546673; font-size: 12px; font-weight: 600; }
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
input, select, button { font: inherit; }
input, select { box-sizing: border-box; width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid #d8e2e7; border-radius: 7px; color: #203440; background: #f9fbfc; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
.search-button { margin-top: 3px; padding: 10px; border: 0; border-radius: 7px; color: #fff; font-weight: 600; background: #208b78; }
.results-header { display: flex; justify-content: space-between; margin: 20px 0 8px; }
.results-header span, .message, .pagination { color: #778a95; font-size: 12px; }
.message { margin: 4px 0 10px; }
.translation { margin: 8px 0 0; color: #208b78; }
.error { color: #bd4b4b; }
.results { min-height: 0; overflow-y: auto; }
.asset { display: flex; align-items: center; width: 100%; gap: 10px; padding: 8px; border: 1px solid transparent; border-radius: 8px; text-align: left; background: transparent; }
.asset:hover, .asset.selected { border-color: #b5ddd5; background: #eff9f6; }
.asset img, .thumbnail-placeholder { flex: 0 0 54px; width: 54px; height: 54px; border-radius: 6px; object-fit: contain; background: #edf2f3; }
.thumbnail-placeholder { display: grid; place-items: center; color: #82969e; }
.asset-info { display: grid; min-width: 0; gap: 3px; }
.asset-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-info small { color: #82919a; }
.asset-action { margin-left: auto; color: #208b78; font-size: 11px; white-space: nowrap; }
.pagination { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; }
.pagination button { border: 0; color: #208b78; background: none; }
.viewer { position: relative; flex: 1; min-width: 0; min-height: 0; }
.viewer :deep(canvas) { display: block; width: 100%; height: 100%; }
.viewer-info, .viewer-tip, .viewer-error { position: absolute; left: 24px; padding: 10px 13px; border-radius: 8px; background: #ffffffd9; }
.viewer-info { top: 24px; display: grid; gap: 2px; max-width: calc(100% - 72px); }
.viewer-info span { color: #70838e; font-size: 12px; overflow-wrap: anywhere; }
.viewer-info a { color: #208b78; font-size: 12px; text-decoration: none; }
.viewer-tip { bottom: 24px; color: #70838e; font-size: 12px; pointer-events: none; }
.viewer-error { right: 24px; bottom: 70px; color: #a33939; overflow-wrap: anywhere; }
@media (max-width: 720px) {
    .polyfork-page { flex-direction: column-reverse; }
    .panel { flex: 0 0 52%; box-sizing: border-box; width: 100%; padding: 14px; }
    .panel-header p { margin-bottom: 10px; }
    .panel-header h1 { font-size: 20px; }
    .results-header { margin-top: 12px; }
    .viewer-info { top: 12px; left: 12px; }
    .viewer-tip { right: 12px; bottom: 12px; left: auto; }
}
</style>
