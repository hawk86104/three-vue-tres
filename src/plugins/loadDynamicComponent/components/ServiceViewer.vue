<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-30 10:39:46
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-13 09:13:40
-->
<script setup lang="ts">
import {
	NDescriptions,
	NDescriptionsItem,
	NList,
	NListItem,
	NThing,
	NButton,
	NTag,
	NElement
} from 'naive-ui'

const props = defineProps<{
	data: {
		name: string
		version: string
		description: string
		components: Array<{
			name: string
			type: string
		}>
	}
	selectedType: string | Undefined
}>()

const emit = defineEmits<{
	(e: 'select', item: any): void
	(e: 'reset'): void
}>()

const handleSelect = (item: any) => {
	emit('select', item)
}
</script>

<template>
	<div class="service-viewer">
		<!-- 基础信息 -->
		<div class="service-viewer__info scroll-panel">
			<NDescriptions bordered size="small">
				<NDescriptionsItem label="名称">
					{{ props.data.name }}
				</NDescriptionsItem>
				<NDescriptionsItem label="版本">
					<NTag type="info">{{ props.data.version }}</NTag>
				</NDescriptionsItem>
				<NDescriptionsItem label="描述">
					 <NElement tag="div" v-html="props.data.description" />
				</NDescriptionsItem>
			</NDescriptions>
		</div>

		<!-- 组件列表 -->
		<div class="service-viewer__list-wrap scroll-panel">
			<NList class="service-viewer__list" bordered hoverable clickable>
				<NListItem :class="{ 'n-list-item--active': selectedType && item.type === selectedType }" v-for="item in props.data.components"
					:key="item.type" @click="handleSelect(item)">
					<NThing :title="item.name" :description="item.type">
						<template #header-extra>
							<NTag size="small">点击载入调试</NTag>
						</template>
					</NThing>
				</NListItem>
			</NList>
		</div>

		<!-- 重置 -->
		<NButton type="warning" block @click="emit('reset')">
			删除当前服务 / 重新加载
		</NButton>
	</div>
</template>
<style lang="less" scoped>
.service-viewer {
	width: min(500px, calc(100vw - 20px));
	height: calc(100vh - 70px);
	max-height: calc(100vh - 70px);
	display: flex;
	flex-direction: column;
	gap: 16px;
	box-sizing: border-box;
}

.service-viewer__info {
	max-height: 295px;
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

.service-viewer__list-wrap {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

.service-viewer__list {
	width: 100%;
}

.scroll-panel {
	scrollbar-width: thin;
	scrollbar-color: rgba(155, 181, 255, 0.82) rgba(255, 255, 255, 0.06);
}

.scroll-panel::-webkit-scrollbar {
	width: 5px;
}

.scroll-panel::-webkit-scrollbar-track {
	background: rgba(255, 255, 255, 0.06);
	border-radius: 999px;
}

.scroll-panel::-webkit-scrollbar-thumb {
	background: linear-gradient(180deg, rgba(186, 203, 255, 0.95), rgba(121, 151, 255, 0.78));
	border-radius: 999px;
}

.scroll-panel::-webkit-scrollbar-thumb:hover {
	background: linear-gradient(180deg, rgba(206, 219, 255, 1), rgba(135, 164, 255, 0.9));
}

.n-list-item--active {
	background: #9bb5ff!important;
}
</style>
