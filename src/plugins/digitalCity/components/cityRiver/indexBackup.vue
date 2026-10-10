<template>
	<TresGroup :position="[-1553.1671459739368, 160.56147161757758, 1938.3955926284068]" :scale="400"
		:rotation="[-3.141592653589793, 1.0149796591022564, -3.141592653589793]">
		<primitive v-if="pState" :object="pState.scene" />
		<Suspense v-if="nodes.mesh_0">
			<threeWater2 :position-y="0.0001" :waterGeometry="nodes.mesh_0.geometry" v-bind="water2State" />
		</Suspense>
	</TresGroup>
	<!-- <TransformControls :mode="modelp.ty ? 'translate' : 'rotate'" :object="pRef" /> -->
</template>

<script setup lang="ts">
import threeWater2 from 'PLS/water/components/threeWater2.vue'
import { useGLTF } from '@tresjs/cientos'
import { reactive, watch, onBeforeUnmount } from 'vue'

import { Pane } from 'tweakpane'

const { state: pState, nodes } = useGLTF('https://a.amap.com/jsapi_demos/static/gltf-online/shanghai/scene.gltf')

watch(
    () => pState.value,
    (state) => {
        if (!state?.scene) return
        state.scene.renderOrder = 9999
        const river = nodes.value.mesh_0
        if (!river) return
        river.material.transparent = false
        river.material.depthWrite = true
        river.material.depthTest = true
        river.material.opacity = 0.7
    },
)

const water2State = reactive({
	color: '#FFF',
	scale: 1.0
})

const paneControl = new Pane({
	title: '河流参数',
	expanded: true,
});
onBeforeUnmount(() => paneControl.dispose())
paneControl.addBinding(water2State, 'color');
</script>
