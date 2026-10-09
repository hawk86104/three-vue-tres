<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { NButton, NInput, NModal } from 'naive-ui'
import { Pane } from 'tweakpane'
import { domCanvas, domCanvasDefaults } from 'PLS/UIdemo'

const panel = reactive({ ...domCanvasDefaults })
const showEditor = ref(false)
const htmlContent = ref(panel.domContent)
const errorMessage = ref('')
const clickCount = ref(0)
let pane: Pane | undefined

onMounted(() => {
    pane = new Pane({ title: 'HTML 三维面板' })
    pane.addBinding(panel, 'width', { label: '场景宽度', min: 0.5, max: 8, step: 0.1 })
    pane.addBinding(panel, 'opacity', { label: '不透明度', min: 0, max: 1, step: 0.01 })
    const texture = pane.addFolder({ title: '画布与纹理' })
    texture.addBinding(panel, 'pixelWidth', { label: '画布宽度', min: 16, max: 2048, step: 16 })
    texture.addBinding(panel, 'pixelHeight', { label: '画布高度', min: 16, max: 2048, step: 16 })
    texture.addBinding(panel, 'pixelRatio', { label: '清晰度倍率', min: 0.5, max: 4, step: 0.5 })
    const glass = pane.addFolder({ title: '毛玻璃' })
    glass.addBinding(panel, 'glass', { label: '启用场景毛玻璃' })
    glass.addBinding(panel, 'captureScale', { label: '采样倍率', min: 0.1, max: 1, step: 0.1 })
    pane.addButton({ title: '编辑 HTML' }).on('click', () => {
        htmlContent.value = panel.domContent
        showEditor.value = true
    })
    pane.addButton({ title: '刷新纹理' }).on('click', () => panel.refreshKey++)
    pane.addButton({ title: '恢复默认参数' }).on('click', () => {
        Object.assign(panel, domCanvasDefaults)
        pane?.refresh()
    })
})
onBeforeUnmount(() => pane?.dispose())

function applyHtml() {
    panel.domContent = htmlContent.value
    showEditor.value = false
}
</script>

<template>
    <TresCanvas clear-color="#101e30" window-size>
        <TresPerspectiveCamera :position="[5, 3, 9]" :fov="45" :near="0.1" :far="100" :look-at="[0, 1.5, 0]" />
        <OrbitControls :target="[0, 1.5, 0]" :min-distance="3" :max-distance="20" enable-damping />
        <TresAmbientLight :intensity="1.5" />
        <TresDirectionalLight :position="[3, 6, 4]" :intensity="3" />
        <TresGridHelper :args="[20, 20, '#38688d', '#223b53']" />

        <TresMesh :position="[-1.2, 1, -1.5]">
            <TresBoxGeometry :args="[1.4, 2, 1.4]" />
            <TresMeshStandardMaterial color="#f2ab66" :roughness="0.35" />
        </TresMesh>
        <TresMesh :position="[0.9, 1.8, -1.4]">
            <TresSphereGeometry :args="[0.9, 32, 24]" />
            <TresMeshStandardMaterial color="#38c1dd" :roughness="0.2" />
        </TresMesh>
        <TresMesh :position="[1.4, 0.7, 1]">
            <TresBoxGeometry :args="[0.9, 1.4, 0.9]" />
            <TresMeshStandardMaterial color="#729df0" :roughness="0.3" />
        </TresMesh>
        <domCanvas v-bind="panel" :position="[0, 1.7, 0]" name="dom-canvas" pointer-events="auto"
            @click="clickCount++" @ready="errorMessage = ''" @error="errorMessage = $event.message" />
    </TresCanvas>

    <aside class="dom-canvas-guide">
        <strong>HTML 三维面板</strong>
        <p>拖动视角查看前后遮挡；开启毛玻璃查看面板后的物体。</p>
        <p>{{ panel.pixelWidth }} × {{ panel.pixelHeight }} px · 场景宽度 {{ panel.width }} · 点击面板 {{ clickCount }} 次</p>
        <p v-if="errorMessage" role="alert" class="error">{{ errorMessage }}</p>
    </aside>
    <NModal v-model:show="showEditor" title="编辑面板 HTML" preset="dialog" :mask-closable="false"
        style="width: min(900px, 94vw)">
        <NInput v-model:value="htmlContent" type="textarea" :autosize="{ minRows: 12, maxRows: 28 }" />
        <template #action>
            <NButton @click="showEditor = false">取消</NButton>
            <NButton type="primary" @click="applyHtml">应用</NButton>
        </template>
    </NModal>
</template>

<style scoped>
.dom-canvas-guide {
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: min(360px, calc(100vw - 40px));
    padding: 16px 20px;
    border: 1px solid #5c9cd555;
    border-radius: 12px;
    background: #12263be6;
    color: #d9ecff;
    pointer-events: none;
    font-size: 13px;
}
.dom-canvas-guide strong { font-size: 17px; }
.dom-canvas-guide p { margin: 8px 0 0; line-height: 1.6; }
.dom-canvas-guide .error { color: #ffd83d; }
</style>
