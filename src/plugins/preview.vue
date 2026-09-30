<template>
    <div class="catalog-layout" :data-theme="theme" @keydown.esc="showTopMenu = false">
        <aside class="catalog-sidebar" aria-label="内容目录">
            <div class="catalog-brand"><LayersOutline /> <strong>TvT.js</strong><span>内容中心</span></div>
            <div class="catalog-sidebar-content">
                <button type="button" class="catalog-all" :class="{ active: !activeSection }" :aria-current="!activeSection ? 'page' : undefined" @click="selectSection('')">
                    <GridOutline /><span class="catalog-menu-label">全部内容</span><span class="catalog-count">{{ matchingEntries.length }}</span>
                </button>
                <section v-for="group in menuGroups" :key="group.id" class="catalog-menu-group">
                    <h2>
                        <button type="button" class="catalog-group-toggle" :aria-expanded="!collapsedGroups.includes(group.id)" :aria-controls="'catalog-group-' + group.id" @click="toggleGroup(group.id)">
                            <span class="catalog-menu-label">{{ group.title }}</span><span class="catalog-count">{{ group.count }}</span>
                            <ChevronDownOutline class="catalog-chevron" :class="{ collapsed: collapsedGroups.includes(group.id) }" />
                        </button>
                    </h2>
                    <div v-show="!collapsedGroups.includes(group.id)" :id="'catalog-group-' + group.id" class="catalog-group-items">
                        <button v-for="section in group.sections" :key="section.id" type="button" :class="{ active: activeSection === section.id }" :aria-current="activeSection === section.id ? 'page' : undefined" @click="selectSection(section.id)">
                            <span class="catalog-menu-label">{{ section.title }}</span><span class="catalog-count">{{ section.preview.length }}</span>
                        </button>
                        <p v-if="!group.count" class="catalog-empty-group">暂无内容</p>
                    </div>
                </section>
            </div>
        </aside>
        <main id="right-page-list-id" ref="contentRef" class="right-page-list">
            <filterComFixed>
                <template #leading>
                    <button v-if="layoutConfigMenus.length" type="button" class="catalog-nav-trigger" aria-label="顶部导航" :aria-expanded="showTopMenu" aria-controls="catalog-top-navigation" @click="showTopMenu = !showTopMenu"><MenuOutline /></button>
                </template>
                <template #actions>
                    <div class="catalog-theme-switch" role="group" aria-label="页面风格">
                        <button type="button" :aria-pressed="theme === 'light'" title="白色风格" @click="theme = 'light'"><SunnyOutline /><span>白</span></button>
                        <button type="button" :aria-pressed="theme === 'dark'" title="黑色风格" @click="theme = 'dark'"><MoonOutline /><span>黑</span></button>
                    </div>
                </template>
                <template #navigation>
                    <nav v-show="showTopMenu" id="catalog-top-navigation" class="mobile-navigation" aria-label="顶部导航">
                        <div v-for="(item, index) in layoutConfigMenus" :key="index" class="mobile-navigation-group">
                            <strong v-if="item.children">{{ item.title }}</strong>
                            <a v-for="link in item.children || [item]" :key="link.path" :href="navigationHref(link.path)" :target="isExternal(link.path) ? '_blank' : undefined" :rel="isExternal(link.path) ? 'noopener noreferrer' : undefined" @click="showTopMenu = false">{{ link.title }}</a>
                        </div>
                    </nav>
                </template>
            </filterComFixed>
            <header class="catalog-heading">
                <div><span class="catalog-eyebrow">EXPLORE / TVT.JS</span><h1>{{ activeTitle }}</h1><p>探索组件、场景与创作工具。</p></div>
                <span class="catalog-result-count">{{ visibleEntries.length }} 个内容</span>
            </header>
            <template v-for="group in visibleGroups" :key="group.id">
                <section v-for="section in group.sections" :key="section.id" class="catalog-section">
                    <div class="catalog-section-title"><span>{{ group.title }}</span><h2>{{ section.title }}</h2><span>{{ section.preview.length }} 项</span></div>
                    <cardList :onePlugin="section" catalog-mode />
                </section>
            </template>
            <div v-if="!visibleEntries.length" class="catalog-empty">
                <h2>没有找到匹配内容</h2><p>试试其他关键词或取消筛选。</p><button @click="resetFilters">查看全部内容</button>
            </div>
            <button type="button" class="toTop" aria-label="返回顶部" @click="contentRef?.scrollTo({ top: 0, behavior: 'smooth' })"><ArrowUpOutline /></button>
        </main>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, watch } from 'vue'
import { defineRouteMeta, useRoute, useRouter } from '@fesjs/fes'
import { ArrowUpOutline, ChevronDownOutline, GridOutline, LayersOutline, MenuOutline, MoonOutline, SunnyOutline } from '@vicons/ionicons5'
import { getPluginsConfig, getOnlinePluginConfig } from '../common/utils'
import { useForPreviewStore } from '@/stores/forPreview'
import cardList from '../components/forPreview/cardList.vue'
import filterComFixed from '../components/forPreview/filterComFixed.vue'
import { createCatalog, groupCatalog } from '../components/forPreview/catalog'
import remoteCatalog from '../components/forPreview/remoteCatalog'

defineRouteMeta({ name: 'preview', title: 'TvT.js 内容中心' })
const layoutConfigMenus = window.layoutConfig?.menus || []
const showTopMenu = ref(false)
const collapsedGroups = ref<string[]>([])
const toggleGroup = (id: string) => {
    collapsedGroups.value = collapsedGroups.value.includes(id) ? collapsedGroups.value.filter((group) => group !== id) : [...collapsedGroups.value, id]
}
const theme = ref<'dark' | 'light'>('dark')
try {
    const savedTheme = localStorage.getItem('tvt-catalog-theme')
    if (savedTheme === 'dark' || savedTheme === 'light') theme.value = savedTheme
} catch { /* 存储不可用时仍可切换主题 */ }
watch(theme, (value) => {
    try { localStorage.setItem('tvt-catalog-theme', value) } catch { /* 本次选择仍生效 */ }
})
const contentRef = ref<HTMLElement | null>(null)
const pluginsConfig = ref(getPluginsConfig())
const { menuSetup } = useForPreviewStore()
const filterFixedInputValue = ref('')
const menuSetupFilter = ref<string[]>([])
provide('filterFixedInputValue', filterFixedInputValue)
provide('menuSetupFilter', menuSetupFilter)
const entries = computed(() => createCatalog(pluginsConfig.value, remoteCatalog, menuSetup.value))
const route = useRoute()
const router = useRouter()
const isExternal = (path: string) => /^(https?:)?\/\//.test(path)
const navigationHref = (path: string) => isExternal(path) ? path : router.resolve({ path }).href
const activeSection = ref('')
const allGroups = computed(() => groupCatalog(entries.value))
const activeTitle = computed(() => allGroups.value.flatMap((group) => group.sections).find((section) => section.id === activeSection.value)?.title || '全部内容')
const matchingEntries = computed(() => {
    const search = filterFixedInputValue.value.trim().toLocaleLowerCase()
    return entries.value.filter((item) => (!search || item.searchText.includes(search))
        && (!menuSetupFilter.value.length || menuSetupFilter.value.includes(item.status)))
})
const menuGroups = computed(() => groupCatalog(matchingEntries.value))
const visibleEntries = computed(() => matchingEntries.value.filter((item) => !activeSection.value || item.section === activeSection.value))
const visibleGroups = computed(() => groupCatalog(visibleEntries.value).filter((group) => group.count))
const selectSection = (id: string) => {
    activeSection.value = id
    router.replace({ hash: id ? '#' + id : '' })
    contentRef.value?.scrollTo({ top: 0 })
}
const resetFilters = () => {
    filterFixedInputValue.value = ''
    menuSetupFilter.value = []
    selectSection('')
}
// 新分类链接和原有 #插件名 / #basic子目录 链接均可进入对应分类。
watch([() => route.hash, entries], () => {
    let hash = route.hash.slice(1)
    try { hash = decodeURIComponent(hash) } catch { /* 保留非编码的旧链接 */ }
    const section = allGroups.value.flatMap((group) => group.sections).find((item) => item.id === hash)
    const legacy = entries.value.find((item) => item.sourcePluginConfig.name === hash || item.sourcePluginConfig.pNode === hash)
    activeSection.value = section?.id || legacy?.section || ''
}, { immediate: true })
if (process.env.FES_APP_PLSNAME === undefined) getOnlinePluginConfig(pluginsConfig)
</script>

<style lang="less">
/* 只在内容中心出现时影响外层导航，离开页面后自动恢复。 */
body:has(.catalog-layout), .catalog-layout {
    color-scheme: dark;
    --catalog-bg: #09090b;
    --catalog-surface: #111113;
    --catalog-raised: #19191d;
    --catalog-hover: #222227;
    --catalog-border: #2a2a30;
    --catalog-text: #f4f4f5;
    --catalog-muted: #a1a1aa;
    --catalog-faint: #71717a;
    --catalog-accent: #b5a3ff;
    --catalog-active: #262033;
    --catalog-button: #ede9fe;
    --catalog-button-text: #27164e;
    --catalog-scrollbar: #3f3f46;
    --catalog-scrollbar-hover: #71717a;
    --catalog-shadow: 0 12px 32px #00000030;
}
body:has(.catalog-layout[data-theme='light']), .catalog-layout[data-theme='light'] {
    color-scheme: light;
    --catalog-bg: #fafafa;
    --catalog-surface: #ffffff;
    --catalog-raised: #f4f4f5;
    --catalog-hover: #ededf0;
    --catalog-border: #e4e4e7;
    --catalog-text: #18181b;
    --catalog-muted: #62626e;
    --catalog-faint: #767680;
    --catalog-accent: #6d42cf;
    --catalog-active: #f0eafa;
    --catalog-button: #18181b;
    --catalog-button-text: #ffffff;
    --catalog-scrollbar: #c4c4cc;
    --catalog-scrollbar-hover: #8c8c97;
    --catalog-shadow: 0 12px 32px #18181b0a;
}
#tvt-app:has(.catalog-layout) {
    .main-layout, .fes-layout, .layout-main { background: var(--catalog-bg); }
    .layout-main { min-height: 0; overflow: hidden; }
    .fes-layout-container { overflow: hidden; }
    .layout-header {
        background: var(--catalog-surface);
        color: var(--catalog-text);
        border-bottom: 1px solid var(--catalog-border);
        box-shadow: none;
        overflow: hidden;
    }
    .layout-logo { width: 200px; margin: 0 20px; color: var(--catalog-text); }
    .layout-menu { background: transparent; }
    .layout-menu .fes-menu-item, .layout-menu .fes-sub-menu { color: var(--catalog-muted); font-size: 13px; }
    .layout-menu .fes-menu-item-wrapper, .layout-menu .fes-sub-menu-wrapper { color: var(--catalog-muted); }
    .layout-menu .fes-menu-item:hover > .fes-menu-item-wrapper,
    .layout-menu .fes-menu-item.is-active > .fes-menu-item-wrapper,
    .layout-menu .fes-sub-menu:hover > .fes-sub-menu-wrapper { background: var(--catalog-raised); color: var(--catalog-text); }
}
body:has(.catalog-layout) .fes-sub-menu-popper {
    background: var(--catalog-surface);
    border: 1px solid var(--catalog-border);
    .fes-menu-item, .fes-sub-menu, .fes-menu-item-wrapper, .fes-sub-menu-wrapper { color: var(--catalog-muted); }
    .fes-menu-item:hover > .fes-menu-item-wrapper { background: var(--catalog-hover); color: var(--catalog-text); }
}
.catalog-layout * { scrollbar-width: thin; scrollbar-color: var(--catalog-scrollbar) transparent; }
/* Chromium 用自定义滚动条，避免原生轨道及上下箭头。 */
@supports selector(::-webkit-scrollbar) {
    .catalog-layout * { scrollbar-width: auto; scrollbar-color: auto; }
}
.catalog-layout *::-webkit-scrollbar { width: 6px; height: 6px; }
.catalog-layout *::-webkit-scrollbar-track, .catalog-layout *::-webkit-scrollbar-corner { background: transparent; }
.catalog-layout *::-webkit-scrollbar-thumb { background: var(--catalog-scrollbar); border-radius: 99px; }
.catalog-layout *::-webkit-scrollbar-thumb:hover { background: var(--catalog-scrollbar-hover); }
.catalog-layout *::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
@media (max-width: 900px) {
    #tvt-app:has(.catalog-layout) .layout-header .layout-menu { display: none; }
}
</style>
<style lang="less" scoped>
.catalog-layout {
    display: flex;
    gap: 24px;
    height: calc(100vh - 54px);
    height: calc(100dvh - 54px);
    padding: 16px 20px 0;
    box-sizing: border-box;
    overflow: hidden;
    background: var(--catalog-bg);
    color: var(--catalog-text);
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.catalog-layout svg { width: 18px; height: 18px; flex-shrink: 0; }
.catalog-layout button { font: inherit; cursor: pointer; }
.catalog-layout button:focus-visible, .catalog-layout a:focus-visible { outline: 2px solid var(--catalog-accent); outline-offset: 2px; }
.catalog-sidebar {
    display: flex;
    flex-direction: column;
    flex: 0 0 268px;
    min-height: 0;
    margin-bottom: 16px;
    overflow: hidden;
    border: 1px solid var(--catalog-border);
    border-radius: 14px;
    background: var(--catalog-surface);
}
.catalog-brand { display: flex; align-items: center; gap: 10px; padding: 20px 18px; border-bottom: 1px solid var(--catalog-border); }
.catalog-brand svg { color: var(--catalog-accent); }
.catalog-brand strong { font-size: 19px; letter-spacing: -.6px; }
.catalog-brand span { margin-left: auto; font-size: 12px; color: var(--catalog-muted); }
.catalog-sidebar-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 10px 20px; }
.catalog-sidebar button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; border-radius: 7px; padding: 9px 10px; background: transparent; color: var(--catalog-muted); text-align: left; transition: background .15s, color .15s; }
.catalog-sidebar button:hover { background: var(--catalog-hover); color: var(--catalog-text); }
.catalog-sidebar button.active { background: var(--catalog-active); color: var(--catalog-accent); }
.catalog-menu-label { flex: 1; min-width: 0; }
.catalog-count { min-width: 22px; padding: 1px 5px; border-radius: 5px; background: var(--catalog-raised); color: var(--catalog-muted); font-size: 10px; line-height: 17px; text-align: center; font-variant-numeric: tabular-nums; }
.catalog-menu-group { margin-top: 22px; }
.catalog-menu-group h2 { margin: 0 0 4px; }
.catalog-sidebar .catalog-group-toggle { color: var(--catalog-text); font-size: 12px; font-weight: 600; }
.catalog-chevron { width: 13px !important; height: 13px !important; color: var(--catalog-faint); transition: transform .18s; }
.catalog-chevron.collapsed { transform: rotate(-90deg); }
.catalog-group-items { margin-left: 10px; padding-left: 7px; border-left: 1px solid var(--catalog-border); }
.catalog-group-items button { font-size: 13px; margin-top: 2px; }
.catalog-empty-group { padding: 5px 10px; font-size: 12px; color: var(--catalog-faint); }
.right-page-list { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; position: relative; padding-right: 8px; }
.catalog-heading { display: flex; justify-content: space-between; align-items: end; gap: 16px; padding: 38px 4px 32px; }
.catalog-heading h1 { margin: 9px 0 10px; font-size: 34px; font-weight: 650; letter-spacing: -1px; line-height: 1.2; }
.catalog-heading p { margin: 0; font-size: 13px; color: var(--catalog-muted); }
.catalog-eyebrow { font-size: 10px; letter-spacing: 2px; color: var(--catalog-faint); }
.catalog-result-count { flex-shrink: 0; padding: 6px 10px; border: 1px solid var(--catalog-border); border-radius: 20px; font-size: 12px; color: var(--catalog-muted); }
.catalog-section { margin: 0 4px 36px; }
.catalog-section-title { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--catalog-border); margin-bottom: 18px; padding-bottom: 12px; color: var(--catalog-muted); font-size: 11px; }
.catalog-section-title > span:first-child { color: var(--catalog-faint); }
.catalog-section-title h2 { margin: 0; color: var(--catalog-text); font-size: 17px; font-weight: 550; }
.catalog-section-title > span:last-child { margin-left: auto; }
.catalog-empty { padding: 70px 20px; text-align: center; color: var(--catalog-muted); }
.catalog-empty button { margin-top: 12px; padding: 9px 16px; border: 1px solid var(--catalog-border); border-radius: 8px; background: var(--catalog-surface); color: var(--catalog-text); }
.toTop { display: grid; place-items: center; position: fixed; bottom: 24px; right: 28px; width: 38px; height: 38px; border: 1px solid var(--catalog-border); border-radius: 12px; background: var(--catalog-surface); color: var(--catalog-muted); box-shadow: var(--catalog-shadow); }
.toTop:hover { color: var(--catalog-accent); background: var(--catalog-hover); }
.catalog-nav-trigger { display: none; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--catalog-border); border-radius: 8px; background: var(--catalog-surface); color: var(--catalog-text); }
.catalog-theme-switch { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--catalog-border); border-radius: 9px; background: var(--catalog-raised); }
.catalog-theme-switch button { display: flex; align-items: center; gap: 5px; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--catalog-muted); font-size: 12px; }
.catalog-theme-switch button[aria-pressed='true'] { background: var(--catalog-surface); color: var(--catalog-text); box-shadow: 0 1px 3px #00000012; }
.catalog-theme-switch svg { width: 15px; height: 15px; }
.mobile-navigation { display: none; }
@media (max-width: 1100px) {
    .catalog-layout { gap: 18px; padding: 12px 14px 0; }
    .catalog-sidebar { flex-basis: 246px; }
}
@media (max-width: 900px) {
    .catalog-layout { gap: 14px; }
    .catalog-sidebar { flex-basis: 218px; }
    .catalog-brand { padding: 16px 12px; }
    .catalog-brand span { display: none; }
    .catalog-nav-trigger { display: flex; }
    .catalog-heading { padding: 28px 4px 24px; }
    .catalog-heading h1 { font-size: 28px; }
    .catalog-section-title { flex-wrap: wrap; gap: 6px 10px; }
    .mobile-navigation { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; order: 4; flex-basis: 100%; max-height: 55vh; overflow-y: auto; padding: 16px; border: 1px solid var(--catalog-border); border-radius: 10px; background: var(--catalog-surface); }
    .mobile-navigation-group { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .mobile-navigation strong { padding: 6px 8px; color: var(--catalog-muted); font-size: 12px; }
    .mobile-navigation a { padding: 7px 8px; border-radius: 6px; color: var(--catalog-text); font-size: 13px; text-decoration: none; }
    .mobile-navigation a:hover { background: var(--catalog-hover); }
}
@media (max-width: 540px) {
    .catalog-layout { flex-direction: column; gap: 10px; padding: 10px 10px 0; }
    .catalog-sidebar { flex: 0 0 auto; max-height: 190px; margin-bottom: 0; }
    .catalog-brand { display: none; }
    .catalog-sidebar-content { padding: 8px; }
    .catalog-menu-group { margin-top: 8px; }
    .catalog-group-items { display: flex; flex-wrap: wrap; gap: 2px 4px; }
    .catalog-group-items button { width: auto; gap: 10px; }
    .catalog-heading { align-items: center; padding: 24px 4px; }
    .catalog-heading h1 { font-size: 25px; }
    .catalog-result-count { padding: 5px 7px; font-size: 11px; }
    .toTop { bottom: 16px; right: 16px; }
}
@media (prefers-reduced-motion: reduce) {
    .catalog-sidebar button, .catalog-chevron { transition: none; }
}
</style>
