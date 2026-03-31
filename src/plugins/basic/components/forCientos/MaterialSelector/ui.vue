<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-10-24 08:52:31
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-22 09:32:43
-->

<template>
	<div class="MaterialSelectorCcontrolPanel">
		<n-card title="材质调试面板" size="small">
			<n-form label-placement="left" :label-width="130" size="small">
				<n-form-item label="材质类型">
					<n-select v-model:value="type" :options="typeOptions" />
				</n-form-item>
				<template v-for="(value, key) in materialProps" :key="key">
					<n-form-item :label="key"
						v-if="(getControlType(value, key) !== 'texture' && getControlType(value, key) !== 'vector2') && getControlType(value, key) !== 'aboutMap'">
						<n-color-picker :show-alpha="false" v-if="getControlType(value, key) === 'color'" size="small"
							v-model:value="materialProps[key]" />
						<n-slider size="tiny" v-else-if="getControlType(value, key) === 'number'" v-model:value="materialProps[key]"
							v-bind="getSliderProps(key, value)" />
						<n-switch size="small" v-else-if="getControlType(value, key) === 'boolean'"
							v-model:value="materialProps[key]" />
						<n-select size="tiny" v-else-if="getControlType(value, key) === 'enum-side'"
							v-model:value="materialProps[key]" :options="sideOptions" />
						<n-select size="tiny" v-else-if="getControlType(value, key) === 'enum-blending'"
							v-model:value="materialProps[key]" :options="blendingOptions" />
						<n-slider size="tiny" v-else-if="getControlType(value, key) === 'uEdge'" v-model:value="materialProps[key]"
							:min="0" :max="10" :step="0.01" />
						<n-slider size="tiny" v-else-if="getControlType(value, key) === 'uFreq'" v-model:value="materialProps[key]"
							:min="0.002" :max="2" :step="0.002" />
						<n-slider size="tiny" v-else-if="getControlType(value, key) === 'uAmp'" v-model:value="materialProps[key]"
							:min="3" :max="22" :step="0.01" />
						<n-slider size="tiny" v-else-if="getControlType(value, key) === 'uProgress'" v-model:value="materialProps[key]"
							:min="-30" :max="30" :step="0.1" />
					</n-form-item>
				</template>
			</n-form>
		</n-card>
	</div>
</template>
<script setup lang="ts">
import { watch, inject, Ref } from 'vue'
import { NCard, NSelect, NSlider, NColorPicker, NSwitch, NForm, NFormItem } from 'naive-ui'
import { materialPresets, type MaterialType, sideOptions, blendingOptions } from './materials'

// 明确告诉 TS 可以作为 materialPresets 的键
type PresetKeys = keyof typeof materialPresets

const type = inject('MaterialSelectorType') as Ref<MaterialType>
const materialProps = inject('MaterialSelectorProps') as Ref<Record<string, any>>

// 切换材质类型时，自动重置 props
watch(type, (key) => {
	materialProps.value = { ...materialPresets[(key as PresetKeys)].props }
})

// 选项数据（用于 <n-select>）
const typeOptions = Object.keys(materialPresets).map(key => ({
	label: key,
	value: key
}))

const sliderRangeMap: Record<string, { min: number; max: number; step: number }> = {
	opacity: { min: 0, max: 1, step: 0.01 },
	alphaTest: { min: 0, max: 1, step: 0.01 },
	emissiveIntensity: { min: 0, max: 5, step: 0.01 },
	reflectivity: { min: 0, max: 1, step: 0.01 },
	refractionRatio: { min: 0.8, max: 1.2, step: 0.01 },
	shininess: { min: 0, max: 200, step: 1 },
	bumpScale: { min: 0, max: 5, step: 0.01 },
	displacementScale: { min: 0, max: 5, step: 0.01 },
	displacementBias: { min: -2, max: 2, step: 0.01 },
	aoMapIntensity: { min: 0, max: 5, step: 0.01 },
	envMapIntensity: { min: 0, max: 5, step: 0.01 },
	transmission: { min: 0, max: 1, step: 0.01 },
	ior: { min: 1, max: 2.333, step: 0.01 },
	thickness: { min: 0, max: 5, step: 0.01 },
	attenuationDistance: { min: 0, max: 10, step: 0.01 },
	specularIntensity: { min: 0, max: 2, step: 0.01 },
	sheen: { min: 0, max: 1, step: 0.01 },
	clearcoat: { min: 0, max: 1, step: 0.01 },
	clearcoatRoughness: { min: 0, max: 1, step: 0.01 },
	chromaticAberration: { min: 0, max: 1, step: 0.01 },
	anisotropicBlur: { min: 0, max: 5, step: 0.01 },
	distortion: { min: 0, max: 5, step: 0.01 },
	temporalDistortion: { min: 0, max: 5, step: 0.01 },
	backsideThickness: { min: 0, max: 5, step: 0.01 },
	liquidMetalIntensity: { min: 0, max: 1.5, step: 0.01 },
	normalStrength: { min: 0, max: 1.5, step: 0.01 },
	displacementStrength: { min: 0, max: 0.35, step: 0.001 },
	fresnelStrength: { min: 0, max: 3, step: 0.01 },
	uScale: { min: 0.0001, max: 0.015, step: 0.0001 },
	uShapeReactivity: { min: 0, max: 5, step: 0.01 },
	uDistortion: { min: 0, max: 5, step: 0.01 },
	uEdgeProtection: { min: 0, max: 1, step: 0.01 },
	iridescence: { min: 0, max: 1, step: 0.01 },
	iridescenceIOR: { min: 1, max: 3, step: 0.01 },
	iridescenceThicknessMin: { min: 0, max: 1500, step: 1 },
	iridescenceThicknessMax: { min: 0, max: 1500, step: 1 },
}

function getControlType(value: any, key: string) {
	if (key === 'uAmp') return 'uAmp'
	if (key === 'uProgress') return 'uProgress'
	if (key === 'uFreq') return 'uFreq'
	if (key === 'uEdge') return 'uEdge'
	if (key === 'side') return 'enum-side'
	if (key === 'blending') return 'enum-blending'
	if (key.includes('Map')) return 'aboutMap'
	if (typeof value === 'string' && value.startsWith('#')) return 'color'
	if (typeof value === 'number') return 'number'
	if (typeof value === 'boolean') return 'boolean'
	if (value === null && (key.endsWith('Map') || key.endsWith('map'))) return 'texture'
	if (typeof value === 'object' && value && 'x' in value && 'y' in value) return 'vector2'
	return 'text'
}

function getSliderProps(key: string, value: number) {
	if (sliderRangeMap[key]) {
		return sliderRangeMap[key]
	}

	if (key.toLowerCase().includes('intensity')) {
		return { min: 0, max: 5, step: 0.01 }
	}

	if (key.toLowerCase().includes('scale')) {
		return { min: 0, max: 5, step: 0.01 }
	}

	if (key.toLowerCase().includes('speed')) {
		return { min: 0, max: 5, step: 0.01 }
	}

	if (Number.isInteger(value) && Math.abs(value) > 1) {
		return {
			min: value < 0 ? value * 2 : 0,
			max: Math.max(10, Math.abs(value) * 2),
			step: 1
		}
	}

	return { min: 0, max: 1, step: 0.01 }
}

</script>
<style lang="less">
.MaterialSelectorCcontrolPanel {
	.n-form-item .n-form-item-feedback-wrapper {
		min-height: 12px;
		line-height: 12px;
	}
}
</style>
<style scoped>
.MaterialSelectorCcontrolPanel {
	width: 360px;
	overflow-y: auto;
	padding: 0px;
	background: #f5f5f5;
	right: 6px;
	top: 6px;
	position: absolute;
	border-radius: 8px;
	max-height: calc(100vh - 60px);
}
</style>
