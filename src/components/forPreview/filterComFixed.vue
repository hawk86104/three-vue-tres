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
                <a href="https://github.com/hawk86104/three-vue-tres" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
                <a href="https://gitee.com/ice-gl/icegl-three-vue-tres" target="_blank" rel="noopener noreferrer">Gitee ↗</a>
                <a href="https://space.bilibili.com/410503457" target="_blank" rel="noopener noreferrer">冰哥 B站 ↗</a>
                <a href="https://space.bilibili.com/384558900" target="_blank" rel="noopener noreferrer">地虎 B站 ↗</a>
            </nav>
            <slot name="actions" />
        </div>
        <slot name="navigation" />
    </div>
</template>
<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import { CloseOutline, SearchOutline } from '@vicons/ionicons5'

const inputValue = inject<Ref<string>>('filterFixedInputValue', ref(''))
const menuSetupFilter = inject<Ref<string[]>>('menuSetupFilter', ref([]))
const statusFilters = [
    { value: 'hot', label: '热门' },
    { value: 'new', label: '最新' },
    { value: 'recommend', label: '推荐' },
    { value: 'editor', label: '编辑器' },
]
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
.catalog-community-links { display: flex; flex-wrap: wrap; gap: 12px; }
.catalog-community-links a { font-size: 11px; color: var(--catalog-muted); text-decoration: none; white-space: nowrap; }
.catalog-community-links a:hover { color: var(--catalog-text); }
@media (max-width: 1280px) { .catalog-community-links { display: none; } }
@media (max-width: 900px) {
    .catalog-search { max-width: none; }
    .catalog-status-filters { order: 3; flex-basis: 100%; }
}
@media (max-width: 540px) {
    .catalog-search { flex-basis: 120px; min-width: 0; }
    .catalog-toolbar-actions { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { .catalog-status-filters label { transition: none; } }
</style>
