<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-30 10:39:46
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-13 09:13:40
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { darkTheme, NButton, NConfigProvider, NIcon, NInput } from 'naive-ui'
import { LayersOutline, SearchOutline, SwapHorizontalOutline } from '@vicons/ionicons5'
import type { RemoteComponentConfig, RemotePluginConfig } from '../common/types'

const props = defineProps<{
	data: RemotePluginConfig
	selectedType?: string
}>()

const emit = defineEmits<{
	(e: 'select', item: RemoteComponentConfig): void
	(e: 'reset'): void
}>()

const keyword = ref('')
const selectedCategory = ref<string | null>(null)
const listRef = ref<HTMLElement | null>(null)
const fallbackCategoryNames = new Map([['pixelFx', 'PixelFX'], ['other', '其他']])
const themeOverrides = {
	common: { primaryColor: '#a9c5ff', primaryColorHover: '#c1d6ff', primaryColorPressed: '#8bacf5', borderRadius: '8px' },
}

function getCategory(item: RemoteComponentConfig) {
	// 兼容未提供分类元数据的旧版服务。
	return item.category ?? props.data.defaultCategory ?? (item.type?.toLowerCase().startsWith('pixelfx') ? 'pixelFx' : 'other')
}

const categoryOptions = computed(() => {
	const names = new Map<string, string>(props.data.categories?.map(({ id, name }) => [id, name]))
	for (const item of props.data.components) {
		const id = getCategory(item)
		if (!names.has(id)) {
			names.set(id, fallbackCategoryNames.get(id) ?? id)
		}
	}
	return [{ id: null, name: '全部' }, ...Array.from(names, ([id, name]) => ({ id, name }))]
})

const filteredComponents = computed(() => {
	const query = keyword.value.trim().toLowerCase()
	const category = selectedCategory.value
	return props.data.components.filter(item =>
		(category === null || getCategory(item) === category)
		&& (!query || [item.name, item.type, item.comFile].some(value => value?.toLowerCase().includes(query)))
	)
})

watch([keyword, selectedCategory], () => listRef.value?.scrollTo(0, 0))

function resetFilters() {
	keyword.value = ''
	selectedCategory.value = null
}
</script>

<template>
	<NConfigProvider tag="aside" class="service-viewer viewer-scroll" aria-label="动态组件库"
		:theme="darkTheme" :theme-overrides="themeOverrides">
		<header>
			<div class="viewer-brand">
				<LayersOutline class="viewer-mark" aria-hidden="true" />
				<div class="viewer-heading">
					<h2>动态组件库</h2>
					<div class="viewer-service">
						<span class="viewer-service-name" :title="data.name">{{ data.name }}</span>
						<span v-if="data.version" class="viewer-version">v{{ data.version }}</span>
					</div>
				</div>
			</div>
			<details v-if="data.description" class="viewer-info">
				<summary>服务说明</summary>
				<div class="viewer-description viewer-scroll" v-html="data.description"></div>
			</details>
		</header>

		<div role="search" aria-label="筛选组件">
			<NInput v-model:value="keyword" placeholder="搜索组件名称、类型…" clearable
				:input-props="{ 'aria-label': '搜索组件名称、类型或文件路径', autocomplete: 'off' }"
				@keydown.esc="keyword = ''">
				<template #prefix><NIcon :component="SearchOutline" aria-hidden="true" /></template>
			</NInput>
			<div class="viewer-filters">
				<div class="viewer-categories viewer-scroll" role="group" aria-label="组件分类">
					<NButton v-for="category in categoryOptions" :key="category.id ?? ''" size="small" secondary
						:type="selectedCategory === category.id ? 'primary' : 'default'"
						:aria-pressed="selectedCategory === category.id" @click="selectedCategory = category.id">
						{{ category.name }}
					</NButton>
				</div>
				<span class="viewer-count" role="status">{{ filteredComponents.length }} / {{ data.components.length }} 个组件</span>
			</div>
		</div>

		<div ref="listRef" class="viewer-list viewer-scroll">
			<ul v-if="filteredComponents.length" aria-label="组件列表">
				<li v-for="item in filteredComponents" :key="item.type">
					<button class="viewer-item" type="button" :aria-current="item.type === selectedType ? 'true' : undefined"
						@click="emit('select', item)">
						<span class="viewer-item-text">
							<strong :title="item.name">{{ item.name }}</strong>
							<span :title="item.type">{{ item.type }}</span>
						</span>
						<span class="viewer-item-action">{{ item.type === selectedType ? '已选中' : '载入调试' }}</span>
					</button>
				</li>
			</ul>
			<div v-else class="viewer-empty">
				<p>{{ data.components.length ? '没有找到匹配组件' : '当前服务暂无组件' }}</p>
				<NButton v-if="data.components.length" size="small" secondary @click="resetFilters">清除筛选</NButton>
			</div>
		</div>

		<footer class="viewer-footer">
			<NButton block secondary @click="emit('reset')">
				<template #icon><NIcon :component="SwapHorizontalOutline" aria-hidden="true" /></template>
				更换服务
			</NButton>
		</footer>
	</NConfigProvider>
</template>

<style scoped>
.service-viewer {
	--viewer-card: #171e2a;
	--viewer-border: #2b3649;
	--viewer-muted: #a6b1c6;
	--viewer-accent: #a9c5ff;
	--viewer-active: #243756;
	display: flex;
	flex-direction: column;
	gap: 12px;
	box-sizing: border-box;
	width: min(380px, calc(100vw - 20px));
	height: calc(100vh - 70px);
	height: calc(100dvh - 70px);
	overflow-y: auto;
	padding: 14px;
	border: 1px solid var(--viewer-border);
	border-radius: 14px;
	background: linear-gradient(155deg, #1b2538, #10141d 180px);
	box-shadow: 0 12px 36px #0006;
	color: #eef3fc;
	color-scheme: dark;
	font-size: 13px;
	line-height: 1.5;
}

.viewer-scroll {
	scrollbar-width: thin;
	scrollbar-color: #44526b transparent;
}

.viewer-brand,
.viewer-service,
.viewer-filters {
	display: flex;
	align-items: center;
	gap: 8px;
}

.viewer-mark {
	box-sizing: border-box;
	flex: none;
	width: 42px;
	height: 42px;
	padding: 10px;
	border-radius: 10px;
	background: var(--viewer-active);
	color: var(--viewer-accent);
}

.viewer-heading,
.viewer-item-text {
	min-width: 0;
}

.viewer-heading h2 {
	margin: 0;
	font-size: 17px;
	font-weight: 650;
}

.viewer-service,
.viewer-info,
.viewer-count,
.viewer-empty {
	color: var(--viewer-muted);
	font-size: 12px;
}

.viewer-version,
.viewer-item-action {
	flex: none;
	padding: 2px 7px;
	border-radius: 5px;
	background: var(--viewer-active);
	color: var(--viewer-accent);
	font-size: 11px;
	white-space: nowrap;
}

.viewer-info {
	margin-top: 8px;
}

.viewer-info summary {
	width: fit-content;
	padding: 2px 0;
	cursor: pointer;
}

.viewer-description {
	max-height: min(174px, 24vh);
	overflow: auto;
	overflow-wrap: anywhere;
	padding: 8px 0;
}

.viewer-description :deep(.eco-grid) {
	grid-template-columns: 1fr;
}

.viewer-description :deep(.eco-item) {
	border-color: var(--viewer-border);
	background: var(--viewer-card);
	color: #eef3fc;
}

.viewer-description :deep(.eco-link) {
	color: var(--viewer-muted);
}

.viewer-filters {
	justify-content: space-between;
	margin-top: 8px;
}

.viewer-categories {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	min-width: 0;
	max-height: 72px;
	overflow: auto;
}

.viewer-count {
	flex: none;
	font-variant-numeric: tabular-nums;
}

.viewer-list {
	flex: 1;
	min-height: 64px;
	overflow-y: auto;
}

.viewer-list ul {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.viewer-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	min-height: 58px;
	padding: 8px 10px;
	border: 1px solid var(--viewer-border);
	border-radius: 8px;
	background: var(--viewer-card);
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;
}

.viewer-item:hover,
.viewer-item[aria-current='true'] {
	border-color: #6383bf;
}

.viewer-item[aria-current='true'] {
	background: var(--viewer-active);
}

.viewer-item:focus-visible,
.viewer-info summary:focus-visible {
	outline: 2px solid var(--viewer-accent);
	outline-offset: -2px;
}

.viewer-service-name,
.viewer-item-text > * {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.viewer-item-text span {
	margin-top: 2px;
	color: var(--viewer-muted);
	font-size: 11px;
}

.viewer-empty {
	padding: 16px 8px;
	text-align: center;
}

.viewer-empty p {
	margin: 0 0 8px;
}

.viewer-footer {
	padding-top: 10px;
	border-top: 1px solid var(--viewer-border);
}

@media (max-width: 640px) {
	.service-viewer {
		max-height: min(420px, 64dvh);
	}
}
</style>
