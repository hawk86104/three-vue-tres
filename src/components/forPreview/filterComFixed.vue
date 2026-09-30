<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-03 16:02:49
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-08-19 15:28:15
-->
<template>
    <div class="filterFixed">
        <slot name="leading" />
        <div class="catalog-search">
            <SearchOutline />
            <input v-model="inputValue" type="search" aria-label="检索内容" placeholder="搜索组件、场景、工具…" />
            <button v-if="inputValue" type="button" aria-label="清空搜索" @click="inputValue = ''"><CloseOutline /></button>
        </div>
        <div class="catalog-status-filters" role="group" aria-label="内容筛选">
            <label v-for="filter in statusFilters" :key="filter.value" :class="{ selected: menuSetupFilter.includes(filter.value) }">
                <input v-model="menuSetupFilter" type="checkbox" :value="filter.value" />
                <span>{{ filter.label }}</span>
            </label>
        </div>
        <div class="catalog-toolbar-actions">
            <nav class="catalog-community-links" aria-label="项目与社区">
                <a v-for="link in communityLinks" :key="link.id" :href="link.url" target="_blank" rel="noopener noreferrer">
                    <span class="catalog-community-label">{{ link.label }}</span>
                    <span class="catalog-community-stat" :title="communityCounts[link.id] === '—' ? '计数暂不可用' : undefined">
                        <strong>{{ communityCounts[link.id] ?? '…' }}</strong><span>{{ link.metric }}</span>
                    </span>
                    <span class="catalog-community-arrow" aria-hidden="true">↗</span>
                </a>
            </nav>
            <slot name="actions" />
        </div>
        <slot name="navigation" />
    </div>
</template>
<script setup lang="ts">
import { inject, onMounted, ref, type Ref } from 'vue'
import { CloseOutline, SearchOutline } from '@vicons/ionicons5'

const inputValue = inject<Ref<string>>('filterFixedInputValue', ref(''))
const menuSetupFilter = inject<Ref<string[]>>('menuSetupFilter', ref([]))
const statusFilters = [
    { value: 'hot', label: '热门' },
    { value: 'new', label: '最新' },
    { value: 'recommend', label: '推荐' },
    { value: 'editor', label: '编辑器' },
]
const dynamicCountUrl = (url: string, query: string) => 'https://img.shields.io/badge/dynamic/json.json?' + new URLSearchParams({ url, query })
const communityLinks = [
    { id: 'github', label: 'GitHub', metric: 'Stars', url: 'https://github.com/hawk86104/three-vue-tres', countUrl: 'https://img.shields.io/github/stars/hawk86104/three-vue-tres.json' },
    { id: 'gitee', label: 'Gitee', metric: 'Stars', url: 'https://gitee.com/ice-gl/icegl-three-vue-tres', countUrl: dynamicCountUrl('https://gitee.com/api/v5/repos/ice-gl/icegl-three-vue-tres', '$.stargazers_count') },
    { id: 'bingge', label: '冰哥 B站', metric: '关注', url: 'https://space.bilibili.com/410503457', countUrl: dynamicCountUrl('https://api.bilibili.com/x/relation/stat?vmid=410503457', 'data.follower') },
    { id: 'dihu', label: '地虎 B站', metric: '关注', url: 'https://space.bilibili.com/384558900', countUrl: dynamicCountUrl('https://api.bilibili.com/x/relation/stat?vmid=384558900', 'data.follower') },
]
const communityCounts = ref<Record<string, string>>({})
onMounted(() => {
    // 沿用原徽章的数据服务，由 Shields 代取平台数据，避免直接请求时的跨域限制。
    communityLinks.forEach(async (link) => {
        try {
            const response = await fetch(link.countUrl)
            if (!response.ok) throw new Error('计数请求失败')
            const { message } = await response.json()
            if (typeof message !== 'string' || !/^\d[\d,.]*[kmb]?$/i.test(message)) throw new Error('计数暂不可用')
            communityCounts.value[link.id] = Number.isFinite(Number(message)) ? Number(message).toLocaleString('zh-CN') : message
        } catch {
            communityCounts.value[link.id] = '—'
        }
    })
})
</script>
<style lang="less" scoped>
.filterFixed {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    width: 100%;
    padding: 8px 0 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--catalog-border);
    background: var(--catalog-bg);
}
.catalog-search {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 220px;
    max-width: 360px;
    min-width: 150px;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--catalog-border);
    border-radius: 9px;
    background: var(--catalog-surface);
    color: var(--catalog-faint);
}
.catalog-search:focus-within { border-color: var(--catalog-accent); }
.catalog-search svg { width: 17px; height: 17px; flex-shrink: 0; }
.catalog-search input { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; font: inherit; font-size: 13px; background: transparent; color: var(--catalog-text); }
.catalog-search input::placeholder { color: var(--catalog-faint); }
.catalog-search input::-webkit-search-cancel-button { display: none; }
.catalog-search button { display: grid; place-items: center; padding: 3px; border: 0; border-radius: 4px; background: transparent; color: var(--catalog-muted); cursor: pointer; }
.catalog-status-filters { display: flex; align-items: center; gap: 4px; }
.catalog-status-filters label { position: relative; padding: 7px 9px; border: 1px solid transparent; border-radius: 7px; color: var(--catalog-muted); font-size: 12px; cursor: pointer; transition: background .15s, color .15s; }
.catalog-status-filters label:hover { background: var(--catalog-hover); color: var(--catalog-text); }
.catalog-status-filters label.selected { border-color: var(--catalog-border); background: var(--catalog-active); color: var(--catalog-accent); }
.catalog-status-filters input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.catalog-status-filters label:focus-within { outline: 2px solid var(--catalog-accent); outline-offset: 2px; }
.catalog-toolbar-actions { display: flex; align-items: center; gap: 16px; margin-left: auto; }
.catalog-community-links { display: flex; flex-wrap: wrap; gap: 6px; }
.catalog-community-links a { display: inline-flex; align-items: center; gap: 7px; padding: 5px 7px 5px 9px; border: 1px solid var(--catalog-border); border-radius: 8px; background: var(--catalog-surface); font-size: 11px; color: var(--catalog-muted); text-decoration: none; white-space: nowrap; transition: border-color .15s, background .15s; }
.catalog-community-label { color: var(--catalog-text); font-weight: 500; }
.catalog-community-stat { display: inline-flex; align-items: baseline; gap: 4px; padding: 2px 6px; border-radius: 5px; background: var(--catalog-raised); font-size: 10px; }
.catalog-community-stat strong { min-width: 3ch; color: var(--catalog-text); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
.catalog-community-arrow { color: var(--catalog-faint); font-size: 10px; }
.catalog-community-links a:hover { border-color: var(--catalog-accent); background: var(--catalog-hover); }
.catalog-community-links a:hover .catalog-community-stat { background: var(--catalog-active); }
.catalog-community-links a:hover :is(strong, .catalog-community-arrow) { color: var(--catalog-accent); }
.catalog-community-links a:focus-visible { outline: 2px solid var(--catalog-accent); outline-offset: 2px; }
@media (max-width: 1280px) { .catalog-community-links { display: none; } }
@media (max-width: 900px) {
    .catalog-search { max-width: none; }
    .catalog-status-filters { order: 3; flex-basis: 100%; }
}
@media (max-width: 540px) {
    .catalog-search { flex-basis: 120px; min-width: 0; }
    .catalog-toolbar-actions { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { .catalog-status-filters label, .catalog-community-links a { transition: none; } }
</style>
