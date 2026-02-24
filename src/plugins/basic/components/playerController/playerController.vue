<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-02-24 14:17:52
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-24 15:49:27
-->
<template>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { playerController } from './playerController'
import { useTres, useLoop } from '@tresjs/core'

const { camera, scene,controls } = useTres()

const path = (process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn') + '/model/basic/person.glb'

const player = playerController()
watch(
	() => controls.value,
	(value: any) => {
		if (value) {
			// 初始化玩家控制器
			player.init({
				scene: scene.value,
				camera: camera.value as any,
				controls: value as any,
				playerModel: {
					url: path, // 模型路径
					scale: 0.001, // 模型缩放
					idleAnim: "idle",
					walkAnim: "walk",
					runAnim: "run",
					jumpAnim: "jump",
					flyAnim: "flying",
					flyIdleAnim: "flyidle",
				},
				// initPos: pos, // 初始位置
			})
		}
	},
)

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
	// 渲染循环调用
	player.update()
})

</script>