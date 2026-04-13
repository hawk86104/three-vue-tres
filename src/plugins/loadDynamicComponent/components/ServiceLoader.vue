<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-30 10:27:12
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-01-06 09:10:18
-->
<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NSpace, useMessage } from 'naive-ui'
import { remoteRegistry } from '../common/RemoteRegistry'

const emit = defineEmits<{
	(e: 'loaded', data: any): void
}>()

const message = useMessage()
const serviceUrl = ref('https://dcser.icegl.cn') // https://dcser.icegl.cn http://localhost:5000
const loading = ref(false)

const handleApply = async () => {
	if (!serviceUrl.value) {
		message.warning('请输入服务地址')
		return
	}
	loading.value = true
	serviceUrl.value = serviceUrl.value.replace(/\/+$/, '')
	try {
		const config = await remoteRegistry.getGeneralConfigNewBase(serviceUrl.value)
		emit('loaded', config)
		message.success('服务加载成功')
	} catch (e) {
		message.error('服务加载失败')
	} finally {
		loading.value = false
	}
}

defineExpose({
	handleApply,
})
</script>

<template>
	<NSpace vertical size="large">
		<NInput v-model:value="serviceUrl" placeholder="请输入服务地址" clearable />
		<NButton type="primary" block :loading="loading" @click="handleApply">
			应用服务
		</NButton>
	</NSpace>
</template>
