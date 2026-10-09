import { DOM_CANVAS_DEFAULTS } from '../components/domCanvas/defaults'

export type { DomCanvasProps } from '../components/domCanvas/defaults'
export const domCanvasDefaults = DOM_CANVAS_DEFAULTS

// 本地高级组件的注册、默认值和可序列化编辑参数共用同一份配置。
export const domCanvasEditorConfig = {
    name: 'dom-canvas',
    type: 'domCanvas',
    pluginPath: 'PLS/UIdemo',
    vueFile: 'PLS/UIdemo/components/domCanvas.vue',
    previewPath: './plugins/UIdemo/preview/domCanvas.svg',
    description: 'HTML 转三维纹理面板，支持透明背景、深度遮挡和普通元素毛玻璃。',
    default: { ...domCanvasDefaults },
    defaultObject3D: {},
    config: {
        domContent: { name: 'HTML 代码', com: 'codeModal' },
        pixelWidth: { name: '画布宽度(px)', com: 'Slider', min: 16, max: 2048, step: 1 },
        pixelHeight: { name: '画布高度(px)', com: 'Slider', min: 16, max: 2048, step: 1 },
        width: { name: '场景宽度', com: 'Slider', min: 0.1, max: 50, step: 0.1 },
        pixelRatio: { name: '纹理清晰度倍率', com: 'Slider', min: 0.5, max: 4, step: 0.5 },
        opacity: { name: '整体不透明度', com: 'Slider', min: 0, max: 1, step: 0.01 },
        glass: { name: '场景毛玻璃', com: 'Switch' },
        captureScale: { name: '毛玻璃采样倍率', com: 'Slider', min: 0.1, max: 1, step: 0.1 },
        refreshKey: { name: '刷新标记(改变即刷新)', com: 'Slider', min: 0, max: 10000, step: 1 },
    },
}
