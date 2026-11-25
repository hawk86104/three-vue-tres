<template>
    <main class="anatomy-page" lang="zh-CN">
        <div class="anatomy-content">
            <header class="anatomy-header">
                <div class="anatomy-brand">
                    <span class="brand-icon" aria-hidden="true"></span>
                    <div>
                        <h1>{{ pageTitle }}</h1>
                        <p>交互查看全身解剖结构</p>
                    </div>
                </div>
            </header>

            <div class="anatomy-workspace">
                <section class="anatomy-viewer surface" aria-label="三维人体视窗">
                    <div class="body-switch" :class="{ 'is-female': sex === 'female' }" role="group" aria-label="人体模型">
                        <button v-for="(label, option) in sexLabels" :key="option" type="button" :aria-pressed="sex === option" @click="sex = option">
                            {{ label }}
                        </button>
                    </div>
                    <div class="layer-controls" role="group" aria-label="解剖图层">
                        <button
                            v-for="(system, key) in systems"
                            :key="key"
                            type="button"
                            :aria-pressed="layers[key]"
                            @click="layers[key] = !layers[key]"
                        >
                            <span class="structure-dot" :style="{ background: system.color }" aria-hidden="true"></span>
                            {{ system.label }}
                        </button>
                    </div>

                    <div class="anatomy-stage" :class="{ 'has-hover': hovered }">
                        <TresCanvas
                            alpha
                            antialias
                            clear-color="#000000"
                            :clear-alpha="0"
                            :dpr="[1, 2]"
                            :tone-mapping="ACESFilmicToneMapping"
                            :style="{ position: 'absolute' }"
                        >
                            <AnatomyScene
                                v-if="catalog"
                                ref="scene"
                                :asset-path="assetPath"
                                :catalog="catalog"
                                :sex="sex"
                                :layers="layers"
                                :pinned="pinned"
                                :hovered="hoveredKey"
                                :retry="retryCount"
                                @status="setStatus"
                                @progress="progress = $event"
                                @select="togglePin"
                                @hover="hoveredKey = $event"
                                @rotate="rotation = $event"
                                @project="projection = $event"
                            />
                        </TresCanvas>

                        <svg class="leader-lines" aria-hidden="true">
                            <g v-for="callout in callouts" :key="callout.structure.key" :class="{ 'is-hovered': hoveredKey === callout.structure.key }">
                                <polyline :points="callout.line" :stroke="callout.structure.categoryColor" />
                                <circle :cx="callout.anchor.x" :cy="callout.anchor.y" r="4.5" :fill="callout.structure.categoryColor" />
                            </g>
                        </svg>
                        <button
                            v-for="callout in callouts"
                            :key="callout.structure.key"
                            class="anatomy-callout"
                            type="button"
                            :title="`取消固定${callout.structure.displayName}的标注`"
                            :style="callout.style"
                            @click="togglePin(callout.structure.key)"
                            @pointerenter="hoveredKey = callout.structure.key"
                            @pointerleave="hoveredKey = null"
                            @focus="hoveredKey = callout.structure.key"
                            @blur="hoveredKey = null"
                        >
                            <span class="category">{{ callout.structure.categoryLabel }}</span>
                            <strong>{{ callout.structure.displayName }}</strong>
                            <span v-if="callout.note" class="callout-note">{{ callout.note }}</span>
                        </button>
                        <p v-if="status === 'ready' && hovered" class="hover-label">
                            <strong>{{ hovered.displayName }}</strong>
                            <small>点击{{ pinned.includes(hovered.key) ? '取消' : '固定' }}标注</small>
                        </p>

                        <div v-if="status === 'loading'" class="stage-status" role="status">
                            <progress :value="progress ?? undefined" max="100" aria-label="模型加载进度"></progress>
                            <span>正在加载{{ sexLabels[sex] }}模型… {{ progress === null ? '' : `${progress}%` }}</span>
                        </div>
                        <div v-else-if="status === 'error'" class="stage-status" role="status">
                            <p>{{ catalog ? '人体模型加载失败' : '结构目录加载失败' }}</p>
                            <button type="button" @click="retryLoad">重新加载</button>
                        </div>
                        <div class="zoom-controls" role="group" aria-label="缩放和重置">
                            <button type="button" title="缩小模型" aria-label="缩小模型" :disabled="!scene" @click="scene?.zoom(1.18)">−</button>
                            <button type="button" title="恢复初始视角" :disabled="!scene" @click="scene?.reset()">重置视角</button>
                            <button type="button" title="放大模型" aria-label="放大模型" :disabled="!scene" @click="scene?.zoom(1 / 1.18)">+</button>
                        </div>
                    </div>

                    <div class="rotation-control">
                        <svg viewBox="0 0 220 40" aria-hidden="true">
                            <path d="M 10 36 Q 110 -6 210 36" fill="none" />
                        </svg>
                        <span class="rotation-handle" :style="arcPosition" aria-hidden="true">‹›</span>
                        <input
                            type="range"
                            min="-180"
                            max="180"
                            :value="rotation"
                            :disabled="!scene"
                            aria-label="水平旋转模型"
                            :aria-valuetext="`${rotation} 度`"
                            title="左右拖动旋转模型"
                            @input="scene?.rotate(Number($event.target.value))"
                        />
                    </div>
                    <p class="interaction-hint">拖动旋转 · 按住 Ctrl 或 ⌘ 滚动缩放 · 右键拖动平移</p>
                    <p class="touch-hint">单指拖动旋转 · 双指捏合缩放或拖动平移</p>
                </section>

                <aside class="anatomy-directory" aria-label="人体结构目录">
                    <section class="summary surface" aria-label="模型概览">
                        <div><strong>2</strong><span>种人体模型</span></div>
                        <div><strong>{{ catalog ? structures.length : '—' }}</strong><span>项解剖结构</span></div>
                        <div><strong>{{ Object.keys(systems).length }}</strong><span>个解剖图层</span></div>
                    </section>

                    <section v-if="selected" class="selected-structure surface" :style="{ '--part-color': selected.categoryColor }" aria-label="当前结构">
                        <span class="category">{{ selected.categoryLabel }}</span>
                        <h2>{{ selected.displayName }}</h2>
                        <dl>
                            <div><dt>所属图层</dt><dd>{{ systems[selected.system].label }}</dd></div>
                            <div><dt>适用模型</dt><dd>{{ selected.sex ? sexLabels[selected.sex] + '模型' : '男女模型' }}</dd></div>
                        </dl>
                        <button class="pin-action" type="button" @click="togglePin(selected.key)">
                            {{ pinned.includes(selected.key) ? '取消标注' : '固定到模型' }}
                        </button>
                    </section>

                    <section class="structure-catalog surface">
                        <div class="directory-header">
                            <h2>解剖结构</h2>
                            <button v-if="pinned.length" type="button" @click="clearPins">清除 {{ pinned.length }} 处标注</button>
                        </div>
                        <input v-model="search" type="search" aria-label="搜索解剖结构" placeholder="搜索心脏、股骨、肾脏…" />
                        <div class="structure-list">
                            <section v-for="group in groups" :key="group.system">
                                <h3>{{ systems[group.system].label }} <small>{{ group.items.length }}</small></h3>
                                <button
                                    v-for="structure in group.items"
                                    :key="structure.key"
                                    type="button"
                                    :aria-pressed="pinned.includes(structure.key)"
                                    :title="structure.displayName"
                                    @click="togglePin(structure.key)"
                                >
                                    <span class="structure-dot" :style="{ background: structure.color }" aria-hidden="true"></span>
                                    {{ structure.displayName }}
                                </button>
                            </section>
                            <p v-if="catalog && !groups.length" class="empty">没有找到匹配的解剖结构</p>
                        </div>
                    </section>
                </aside>
            </div>

            <footer class="anatomy-credits">
                <p>数据来自 BodyParts3D © 生命科学数据库中心、HuBMAP 人体参考图谱（女性器官）及 MakeHuman（女性皮肤，CC0）。</p>
                <p>用于解剖教学和三维可视化。</p>
            </footer>
        </div>
    </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useTemplateRef } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { ACESFilmicToneMapping } from 'three'
import AnatomyScene from '../components/openAnatomy3D/AnatomyScene.vue'
import { localizeStructure, systems } from '../components/openAnatomy3D/anatomyLocale'

const pageTitle = '三维人体解剖'
const assetPath = './plugins/medical/model/openAnatomy3D'
const sexLabels = { male: '男性', female: '女性' }
const directoryOrder = ['organs', 'skeleton', 'joints', 'muscles', 'vessels', 'nerves', 'skin']
const starterNotes = {
    heart: '点击结构可固定标注',
    lung_l: '标注会随模型旋转',
    knee_r: '关节也可以固定标注',
}
const layers = reactive(Object.fromEntries(Object.keys(systems).map((system) => [system, system !== 'muscles'])))
const sex = ref('male')
const status = ref('loading')
const progress = ref(null)
const catalog = shallowRef(null)
const retryCount = ref(0)
const scene = useTemplateRef('scene')
const pinned = ref(Object.keys(starterNotes))
const selectedKey = ref('heart')
const hoveredKey = ref(null)
const rotation = ref(0)
const search = ref('')
const projection = shallowRef({ width: 0, height: 0, anchors: [] })

const structures = computed(() => catalog.value?.filter((structure) => !structure.sex || structure.sex === sex.value) ?? [])
const byKey = computed(() => new Map(structures.value.map((structure) => [structure.key, structure])))
const selected = computed(() => byKey.value.get(selectedKey.value))
const hovered = computed(() => {
    const structure = byKey.value.get(hoveredKey.value)
    return layers[structure?.system] ? structure : null
})
const chineseOrder = new Intl.Collator('zh-CN')
const groups = computed(() => {
    const query = search.value.trim().toLowerCase()
    const matches = structures.value.filter(({ displayName, categoryLabel, label, key, system }) =>
        `${displayName} ${categoryLabel} ${systems[system].label} ${label} ${key}`.toLowerCase().includes(query),
    )
    return directoryOrder.map((system) => ({
        system,
        items: matches.filter((structure) => structure.system === system).sort((a, b) => chineseOrder.compare(a.displayName, b.displayName)),
    })).filter((group) => group.items.length)
})

const arcPosition = computed(() => {
    const t = (rotation.value + 180) / 360
    return {
        left: `${(10 + 200 * t) / 220 * 100}%`,
        top: `${(36 - 84 * t * (1 - t)) / 40 * 100}%`,
    }
})

let catalogRequest
let previousTitle
function setStatus(next) {
    status.value = next
    if (next === 'loading') progress.value = null
}

async function loadCatalog() {
    const request = new AbortController()
    catalogRequest = request
    setStatus('loading')
    try {
        const response = await fetch(`${assetPath}/catalog.json`, { signal: request.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('结构目录格式错误')
        if (!request.signal.aborted) catalog.value = data.map(localizeStructure)
    } catch (error) {
        if (request.signal.aborted) return
        console.error('人体解剖结构目录加载失败', error)
        status.value = 'error'
    }
}
onMounted(() => {
    previousTitle = document.title
    document.title = pageTitle
    loadCatalog()
})
onBeforeUnmount(() => {
    catalogRequest?.abort()
    if (previousTitle !== undefined && document.title === pageTitle) document.title = previousTitle
})

function retryLoad() {
    if (catalog.value) retryCount.value++
    else loadCatalog()
}

function togglePin(key) {
    const structure = byKey.value.get(key)
    if (!structure) return
    selectedKey.value = key
    if (pinned.value.includes(key)) {
        pinned.value = pinned.value.filter((pin) => pin !== key)
        if (hoveredKey.value === key) hoveredKey.value = null
    } else {
        layers[structure.system] = true
        pinned.value = [...pinned.value, key]
    }
}

function clearPins() {
    pinned.value = []
    hoveredKey.value = null
}

const callouts = computed(() => {
    if (status.value !== 'ready') return []
    const { width, height, anchors } = projection.value
    const cardWidth = width < 520 ? Math.max(104, Math.round(width * 0.3)) : 168
    const inset = 10
    const gap = 10
    const bottomEdge = height - 50
    // Prefer recently pinned structures if the canvas cannot fit every label.
    const visible = anchors.filter(({ key }) => pinned.value.includes(key) && layers[byKey.value.get(key)?.system]).reverse()
    return [true, false].flatMap((onLeft) => {
        const left = onLeft ? inset : width - inset - cardWidth
        const edge = onLeft ? left + cardWidth : left
        const column = []
        let occupied = 0
        for (const anchor of visible) {
            if ((anchor.x < width / 2) !== onLeft) continue
            const note = starterNotes[anchor.key]
            const cardHeight = note ? 74 : 50
            if (inset + occupied + cardHeight > bottomEdge) continue
            column.push({ anchor, structure: byKey.value.get(anchor.key), note, cardHeight })
            occupied += cardHeight + gap
        }
        column.sort((a, b) => a.anchor.y - b.anchor.y)
        let nextTop = inset
        return column.map((item) => {
            const { anchor, structure, cardHeight } = item
            const top = Math.max(nextTop, Math.min(anchor.y - cardHeight / 2, bottomEdge - occupied + gap))
            const middle = top + cardHeight / 2
            const elbow = edge + (onLeft ? 26 : -26)
            nextTop = top + cardHeight + gap
            occupied -= cardHeight + gap
            return {
                ...item,
                line: `${edge},${middle} ${elbow},${middle} ${anchor.x},${anchor.y}`,
                style: {
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    '--part-color': structure.categoryColor,
                },
            }
        })
    })
})
</script>

<style scoped>
.anatomy-page {
    --bg: #f6f4f1;
    --surface: #fff;
    --sunken: #f1eeea;
    --canvas-center: #fbfaf9;
    --border: #e6e1da;
    --text: #1f1d1a;
    --muted: #6b665f;
    --accent: #e8590c;
    --accent-deep: #c2410c;
    --accent-text: #ad3c0a;
    --accent-tint: #fdeee4;
    --shadow: rgb(31 29 26 / 18%);
    height: 100vh;
    height: 100dvh;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--bg);
    color: var(--text);
    color-scheme: light;
    font: 14px/1.45 system-ui, 'Microsoft YaHei', sans-serif;
}
@media (prefers-color-scheme: dark) {
    .anatomy-page {
        --bg: #111113;
        --surface: #1b1b1f;
        --sunken: #141417;
        --canvas-center: #1f1f23;
        --border: #2e2e35;
        --text: #f2f0ed;
        --muted: #a5a29d;
        --accent-text: #ffad7f;
        --accent-tint: #3a2216;
        --shadow: rgb(0 0 0 / 48%);
        color-scheme: dark;
    }
}
.anatomy-page, .anatomy-page * { box-sizing: border-box; }
.anatomy-page :is(h1, h2, h3, p, dl, dd) { margin: 0; }
.anatomy-page :is(button, input) { color: inherit; font: inherit; }
.anatomy-page button { cursor: pointer; }
.anatomy-page button:disabled, .anatomy-page input:disabled { cursor: default; opacity: 0.55; }
.anatomy-page :is(button, input, a):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.anatomy-content { max-width: 1240px; margin-inline: auto; padding: 20px 24px 48px; }
.anatomy-header, .anatomy-brand, .directory-header {
    display: flex;
    align-items: center;
    gap: 12px;
}
.anatomy-header { justify-content: space-between; margin-bottom: 20px; }
.anatomy-brand h1 { font-size: 20px; font-weight: 800; }
.anatomy-brand p { margin-top: 2px; color: var(--muted); font-size: 13px; }
.brand-icon {
    display: grid;
    place-items: center;
    align-content: center;
    flex: 0 0 42px;
    height: 42px;
    gap: 3px;
    border-radius: 13px;
    background: var(--accent-tint);
}
.brand-icon::before, .brand-icon::after { content: ''; border-radius: 9px; background: var(--accent); }
.brand-icon::before { width: 10px; height: 10px; }
.brand-icon::after { width: 14px; height: 16px; }
.source-link {
    flex-shrink: 0;
    padding: 9px 16px;
    border-radius: 10px;
    background: var(--accent);
    color: #fff;
    text-decoration: none;
    font-weight: 700;
}
.source-link:hover { color: #fff; background: var(--accent-deep); }

.anatomy-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    align-items: start;
    gap: 20px;
}
.surface { border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
.anatomy-viewer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 18px;
    border-radius: 22px;
}
.body-switch {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--sunken);
}
.body-switch::before {
    content: '';
    position: absolute;
    inset: 3px auto 3px 3px;
    width: calc(50% - 3px);
    border-radius: inherit;
    background: var(--accent);
    transition: transform 200ms ease;
}
.body-switch.is-female::before { transform: translateX(100%); }
.body-switch button {
    position: relative;
    min-width: 82px;
    height: 30px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
}
.body-switch button[aria-pressed='true'] { color: #fff; }
.layer-controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.layer-controls button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    min-height: 28px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
}
.layer-controls button[aria-pressed='true'] {
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background: color-mix(in srgb, var(--accent) 11%, var(--surface));
    color: var(--text);
}
.structure-dot { flex: 0 0 9px; width: 9px; height: 9px; border-radius: 50%; }
.layer-controls button[aria-pressed='false'] .structure-dot { opacity: 0.4; }
.layer-controls button:hover { border-color: var(--accent); }

.anatomy-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1.08;
    min-height: 440px;
    max-height: max(440px, calc(100dvh - 216px));
    border-radius: 16px;
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 42%, var(--canvas-center), var(--sunken));
}
.anatomy-stage :deep(canvas) { cursor: grab; }
.anatomy-stage.has-hover :deep(canvas) { cursor: pointer; }
.anatomy-stage :deep(canvas:active) { cursor: grabbing; }
.leader-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.leader-lines polyline { fill: none; stroke-width: 1.5; stroke-dasharray: 3 3; }
.leader-lines .is-hovered polyline { stroke-width: 2.5; }
.leader-lines circle { stroke: #fff; stroke-width: 1.8; }
.anatomy-callout {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 1px;
    padding: 6px 9px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-left: 4px solid var(--part-color);
    border-radius: 11px;
    background: var(--surface);
    box-shadow: 0 6px 18px -8px var(--shadow);
    text-align: left;
}
.anatomy-callout:hover { box-shadow: 0 7px 20px var(--shadow); }
.category { color: color-mix(in srgb, var(--part-color) 72%, var(--text)); font-size: 12px; font-weight: 700; }
.anatomy-callout strong {
    max-width: 100%;
    overflow: hidden;
    color: var(--text);
    font-size: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.callout-note { color: var(--muted); font-size: 11px; }

.stage-status, .hover-label {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    justify-items: center;
    text-align: center;
}
.stage-status { top: 45%; width: max-content; max-width: 95%; gap: 10px; color: var(--muted); font-size: 13px; }
.stage-status progress { width: 160px; height: 5px; accent-color: var(--accent); }
.stage-status button { padding: 5px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.hover-label {
    top: 12px;
    z-index: 1;
    padding: 7px 13px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 92%, transparent);
    color: var(--surface);
    pointer-events: none;
}
.hover-label small { opacity: 0.8; }
.zoom-controls {
    position: absolute;
    left: 50%;
    bottom: 14px;
    display: flex;
    gap: 10px;
    transform: translateX(-50%);
}
.zoom-controls button {
    min-width: 34px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: 0 2px 8px var(--shadow);
    font-size: 12px;
    font-weight: 700;
}
.zoom-controls button[aria-label] { width: 34px; padding: 0; font-size: 18px; }
.zoom-controls button:hover { background: var(--sunken); }

.rotation-control { position: relative; width: 220px; max-width: 90%; aspect-ratio: 220 / 40; }
.rotation-control svg, .rotation-control input { position: absolute; inset: 0; width: 100%; height: 100%; }
.rotation-control svg { stroke: var(--border); stroke-width: 1.5; }
.rotation-control input { margin: 0; opacity: 0; cursor: ew-resize; touch-action: none; }
.rotation-handle {
    position: absolute;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 2px 8px var(--shadow);
    color: #fff;
    font-size: 20px;
    font-weight: 600;
    pointer-events: none;
}
.rotation-control:hover .rotation-handle { background: var(--accent-deep); }
.rotation-control:focus-within .rotation-handle { outline: 2px solid var(--accent); outline-offset: 3px; }
.interaction-hint, .touch-hint { color: var(--muted); font-size: 12px; text-align: center; }
.touch-hint { display: none; }
@media (pointer: coarse) {
    .interaction-hint { display: none; }
    .touch-hint { display: block; }
}

.anatomy-directory { position: sticky; top: 16px; display: grid; gap: 14px; min-width: 0; }
.anatomy-directory .surface { padding: 16px 18px; }
.summary { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; }
.summary div + div { border-left: 1px solid var(--border); }
.summary strong { display: block; font-size: 22px; }
.summary span { color: var(--muted); font-size: 12px; }
.selected-structure h2 { margin: 3px 0 12px; font-size: 20px; }
.selected-structure dl { display: grid; gap: 5px; margin-bottom: 14px; font-size: 13px; }
.selected-structure dl div { display: flex; justify-content: space-between; gap: 8px; }
.selected-structure dt { color: var(--muted); }
.selected-structure dd { font-weight: 600; }
.pin-action {
    width: 100%;
    min-height: 38px;
    border: 0;
    border-radius: 10px;
    background: var(--accent-tint);
    color: var(--accent-text);
    font-weight: 700;
}
.pin-action:hover { color: #fff; background: var(--accent); }

.directory-header { justify-content: space-between; margin-bottom: 10px; }
.directory-header h2 { font-size: 15px; }
.directory-header button { padding: 0; border: 0; background: none; color: var(--accent-text); font-size: 12px; }
.directory-header button:hover { text-decoration: underline; }
.structure-catalog input {
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--sunken);
}
.structure-list { max-height: 46vh; margin-top: 10px; overflow-y: auto; padding-right: 4px; }
.structure-list h3 {
    position: sticky;
    top: 0;
    padding: 6px 0 3px;
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
}
.structure-list h3 small { font-size: 11px; font-weight: 500; }
.structure-list button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    text-align: left;
}
.structure-list button:hover { background: var(--sunken); }
.structure-list button[aria-pressed='true'] { background: var(--accent-tint); font-weight: 700; }
.empty { padding: 8px 0; color: var(--muted); font-size: 13px; }
.anatomy-credits { margin-top: 20px; color: var(--muted); font-size: 12px; line-height: 1.65; text-align: center; }
.anatomy-credits a { color: var(--accent-text); text-decoration: underline; text-underline-offset: 2px; }

@media (max-width: 900px) {
    .anatomy-workspace { grid-template-columns: minmax(0, 1fr); }
    .anatomy-directory { position: static; }
}
@media (max-width: 520px) {
    .anatomy-content { padding: 14px 12px 44px; }
    .anatomy-header { margin-bottom: 12px; gap: 8px; }
    .anatomy-brand { gap: 8px; }
    .anatomy-brand h1 { font-size: 17px; }
    .anatomy-brand p { font-size: 11px; }
    .source-link { padding: 8px; font-size: 12px; }
    .anatomy-viewer { padding: 10px; }
    .anatomy-stage { min-height: 360px; max-height: none; }
    .anatomy-callout { padding-inline: 6px; }
}
</style>
