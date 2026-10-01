<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-01-16 08:58:24
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-10-01 15:51:27
-->
<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { reactive, ref } from "vue"
import { BasicShadowMap, SRGBColorSpace } from 'three'
import eFan from '../components/eFan.vue'

const gl = {
	alpha: true,
	clearAlpha: 0,
	shadowMapType: BasicShadowMap,
	outputColorSpace: SRGBColorSpace,
}

const circleScaleRef = ref()
const circleScaleAnimation = ref(false)

const state = reactive({
	selectedColor: '#ff8b04',
	colors: ['#ff8b04', '#999999', '#d3ac10', '#ffbec4', '#d0d5c6'],
})
const oldColor = ref(state.selectedColor)
const onClick = (color) => {
	oldColor.value = state.selectedColor
	state.selectedColor = color
	circleScaleAnimation.value = !circleScaleAnimation.value
}

</script>

<template>
	<div class="landingpage-bg w-full inset-0 h-full" />
	<div class="absolute p-8 md:p-0 w-full inset-0 h-full
    flex flex-col md:flex-row md:justify-center md:items-center"
		:style="{ backgroundColor: state.selectedColor + '80' }"
>
		<div class="w-full h-full pos-absolute md:w-2/3 md:h-1/2 shadow-lg rounded flex flex-col md:flex-row opacity-66"
			:style="{ backgroundColor: oldColor }"
>
			<div class="w-full h-full overflow-hidden pos-absolute">
				<div ref="circleScaleRef" class="circleScale"
					:class="{ circleScaleAnimationOld: circleScaleAnimation, circleScaleAnimationNew: !circleScaleAnimation }"
					:style="{ backgroundColor: state.selectedColor }"
>
				</div>
			</div>
			<div class="h-1/2 w-full md:w-1/2" />
			<div class="z-1 p-6 w-full md:w-1/2 md:p-4 text-light">
				<h1 class="title animate-fade-in-right animate-ease">
					电风扇 ☁️
				</h1>

				<span class="absolute border-1 border-solid border-white w-800px inline-block" />

				<p class="w-full md:w-2/3 my-8 animate-fade-in mt-32 position-relative">
					点击 <span class="font-bold">"模型上按钮"</span> ，开关风扇。<br>
					点击 <span class="font-bold">"下方按钮"</span> ，选择自己喜欢的颜色。
				</p>

				<ul class="flex gap-8">
					<li v-for="color in state.colors" :key="color">
						<button class="w-10 h-10 rounded-full border-2 border-solid border-white mr-2 cursor-pointer"
							:style="{ backgroundColor: color }" @click="onClick(color)"
/>
					</li>
				</ul>
			</div>
		</div>
	</div>
	<div class="absolute w-full md:w-1/2 inset-0 h-2/3 md:h-full flex justify-center items-center">
		<TresCanvas v-bind="gl" class="pointer-events-none">
			<TresPerspectiveCamera :position="[10, 5, -8]" :fov="45" :near="0.1" :far="100000" :look-at="[0, 0, 0]" />
			<OrbitControls enableDamping />

			<Suspense>
				<eFan :color="state.selectedColor" />
			</Suspense>

			<TresAmbientLight :intensity="2" />
			<TresPointLight :position="[0, 0, 10]" :intensity="1" />
			<TresDirectionalLight :position="[3, 3, 3]" :intensity="3" />
		</TresCanvas>
	</div>
</template>

<style>
#tvt-app {
	width: 100%;
	height: 100vh;
}
</style>
<style scoped>
/* @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Heebo&display=swap'); */

* {
	font-family: sans-serif;
}

.circleScale {
	position: relative;
	top: 12%;
	left: 16%;
	width: 50px;
	height: 50px;
	border-radius: 50%;
	opacity: 0.66;
	/* transform: scale(50); */
	/* background-color: #ff8b04; */
	/* -webkit-animation: circleScaleExpand 1s ease-in forwards;
	animation: circleScaleExpand 1s ease-in forwards; */
}

.circleScaleAnimationOld {
	-webkit-animation: circleScaleExpandOld 1s ease-in forwards;
	animation: circleScaleExpandOld 1s ease-in forwards;
}

.circleScaleAnimationNew {
	-webkit-animation: circleScaleExpandNew 1s ease-out forwards;
	animation: circleScaleExpandNew 1s ease-out forwards;
}

@keyframes circleScaleExpandOld {
	0% {
		transform: scale(0.1);
	}

	100% {
		transform: scale(80.1);
	}
}

@keyframes circleScaleExpandNew {
	0% {
		transform: scale(0);
	}

	100% {
		transform: scale(80);
	}
}

.title {
	margin-top: -120px;
	font-family: 'Bebas Neue', cursive;
	font-size: 128px;

	@media (max-width: 768px) {
		margin-top: 20px;
		font-size: 64px;
	}
}

.landingpage-bg {
	background-image: url("@/../public/plugins/digitalCity/preview/heatmap2.webp");
	filter: blur(46px) hue-rotate(325deg) grayscale(100%);
	/* 模糊度  色阶  灰度*/
}

li {
	list-style: none;
}
</style>
