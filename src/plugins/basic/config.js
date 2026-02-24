/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-03 15:07:09
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-24 14:04:11
 */
export default {
    name: 'basic',
    title: '原生功能展示',
    intro: '',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'www.icegl.cn',
    state: 'active',
    require: [],
    child: [
        {
            name: 'base',
            title: '基础',
            intro: '基础功能展示',
            pNode: 'basic',
            preview: [
                { src: 'plugins/basic/base/preview/theGroups.png', type: 'img', name: 'theGroups', title: '组合Group' },
                { src: 'plugins/basic/base/preview/theConditional.png', type: 'img', name: 'theConditional', title: '显隐v-if' },
                { src: 'plugins/basic/base/preview/theBasic.png', type: 'img', name: 'theBasic', title: '基本' },
                { src: 'plugins/basic/base/preview/shapesPage.png', type: 'img', name: 'shapesPage', title: '图形合集组件' },
                { src: 'plugins/basic/base/preview/theEvents.png', type: 'img', name: 'theEvents', title: '事件' },
                { src: 'plugins/basic/base/preview/shaderParticles.png', type: 'img', name: 'shaderParticles', title: '着色器实践' },
                { src: 'plugins/basic/base/preview/penetrateEvent.png', type: 'img', name: 'penetrateEvent', title: '穿透事件' },
                { src: 'plugins/basic/base/preview/multipleScenes.png', type: 'img', name: 'multipleScenes', title: '多场景' },
            ],
        },
        {
            name: 'materials',
            title: '材质',
            intro: '各种衍生材质展示',
            pNode: 'basic',
            preview: [
                { src: 'plugins/basic/materials/preview/glassMaterial.png', type: 'img', name: 'glassMaterial', title: '玻璃材质' },
                { src: 'plugins/basic/materials/preview/transmissionMaterial.png', type: 'img', name: 'transmissionMaterial', title: '玻璃材质2' },
                { src: 'plugins/basic/materials/preview/wobbleMaterial.png', type: 'img', name: 'wobbleMaterial', title: '流体波动' },
                { src: 'plugins/basic/materials/preview/clippingMaterial.png', type: 'img', name: 'clippingMaterial', title: '材质裁剪' },
                { src: 'plugins/basic/materials/preview/solidClippingMaterial.png', type: 'img', name: 'solidClippingMaterial', title: '裁剪材质补色' },
                { src: 'plugins/basic/materials/preview/layerMaterial.png', type: 'img', name: 'layerMaterial', title: '图层材质' },
                { src: 'plugins/basic/materials/preview/outline.png', type: 'img', name: 'outline', title: 'outline' },
                { src: 'plugins/basic/materials/preview/clearcoat.png', type: 'img', name: 'clearcoat', title: '反光漆图层' },
                {
                    src: 'plugins/basic/materials/preview/instancedMeshCustomShaderMaterial.png',
                    type: 'img',
                    name: 'instancedMeshCustomShaderMaterial',
                    title: 'instanced和继承材质',
                },
                { src: 'plugins/basic/materials/preview/vertexSnapping.png', type: 'img', name: 'vertexSnapping', title: '顶点捕捉材质' },
                { src: 'plugins/basic/materials/preview/materialSelector.png', type: 'img', name: 'materialSelector', title: '多材质切换组件' },
            ],
        },
        {
            name: 'controls',
            title: '控制器',
            intro: '各种控制器',
            pNode: 'basic',
            preview: [
                { src: 'plugins/basic/controls/preview/cameraControls.png', type: 'img', name: 'cameraControls', title: '摄像头控制' },
                { src: 'plugins/basic/controls/preview/orbitControls.png', type: 'img', name: 'orbitControls', title: 'orbitControls' },
                { src: 'plugins/basic/controls/preview/transformControls.png', type: 'img', name: 'transformControls', title: '变换控制器' },
                {
                    src: '与OrbitControls类似，该控件用于从鸟瞰视角在地图上变换相机，但使用鼠标/触摸交互的特定预设，并在默认情况下禁用屏幕空间平移。',
                    type: 'text',
                    name: 'mapControls',
                    title: '地图控制器',
                },
                {
                    src: '第一人称视角，键盘控制视角。W、S、A、D：前后左右；空格：跳起；ESC：退出控制。',
                    type: 'text',
                    name: 'firstPersonControls',
                    title: '第一人称键盘控制',
                },
                { src: 'plugins/basic/controls/preview/scrollControls.png', type: 'img', name: 'scrollControls', title: '滚轮控制器' },
                { src: 'plugins/basic/controls/preview/playerControls.png', type: 'img', name: 'playerControls', title: '玩家控制器' },
            ],
        },
        {
            name: 'htmls',
            title: '内嵌dom',
            intro: '内嵌网页元素',
            pNode: 'basic',
            preview: [
                { src: 'plugins/basic/htmls/preview/htmls.png', type: 'img', name: 'htmls', title: '简单dom' },
                { src: 'plugins/basic/htmls/preview/component3UI.png', type: 'img', name: 'component3UI', title: '引用UI组件' },
                { src: 'plugins/basic/htmls/preview/website.png', type: 'img', name: 'website', title: '内嵌网页' },
                { src: 'plugins/basic/htmls/preview/websiteReflector.png', type: 'img', name: 'websiteReflector', title: '网页电脑+镜面' },
            ],
        },
        {
            name: 'shine',
            title: '闪耀发光类',
            intro: '关于物体发光的简单例子',
            pNode: 'basic',
            preview: [
                { src: 'plugins/basic/shine/preview/spriteImage.png', type: 'img', name: 'spriteImage', title: '点精灵贴图' },
                { src: 'plugins/basic/shine/preview/shader.png', type: 'img', name: 'shader', title: '着色器方式' },
                {
                    src: 'plugins/basic/shine/preview/geometricGlow.png', type: 'img', name: 'geometricGlow', title: 'geometric缩放',
                    referenceSource: { title: 'jeromeetienne', url: 'https://github.com/jeromeetienne/threex.geometricglow' },
                 },
                {
                    src: 'plugins/basic/shine/preview/fakeGlow.png',
                    type: 'img',
                    name: 'fakeGlow',
                    title: 'FakeGlow',
                    referenceSource: { title: 'FakeGlow', url: 'https://r3f-fake-glow-material.vercel.app/' },
                },
                { src: 'plugins/basic/shine/preview/bloomPass.png', type: 'img', name: 'bloomPass', title: '后期处理-效果叠加' },
                { src: 'plugins/basic/shine/preview/MaskPass.png', type: 'img', name: 'MaskPass', title: '后期处理-掩膜通道' },
                { src: 'plugins/basic/shine/preview/effectComposerLayers.png', type: 'img', name: 'effectComposerLayers', title: '后期处理-图层叠加' },
                {
                    src: 'plugins/basic/shine/preview/effectComposerShaderPass.png',
                    type: 'img',
                    name: 'effectComposerShaderPass',
                    title: '后期处理-图层+ShaderPass',
                    referenceSource: { title: 'zerotoinfinity', url: 'https://www.cnblogs.com/zerotoinfinity/p/15910759.html' },
                },
                { src: 'plugins/basic/shine/preview/effectComposerMultiple.png', type: 'img', name: 'effectComposerMultiple', title: '后期处理-多个叠加' },
            ],
        },
        {
            name: 'tresProcessing',
            title: 'tresProcessing库',
            intro: '直接使用tres的后期处理库实例',
            pNode: 'basic',
            preview: [
                {
                    src: 'plugins/basic/tresProcessing/preview/fusion.png',
                    type: 'img',
                    name: 'fusion',
                    title: '融合多个后期效果',
                    referenceSource: { title: 'post-processing.tresjs', url: 'https://post-processing.tresjs.org/guide/' },
                },
                {
                    src: 'plugins/basic/tresProcessing/preview/outlinePass.png',
                    type: 'img',
                    name: 'outlinePass',
                    title: '外边框处理',
                    referenceSource: { title: 'post-processing.tresjs', url: 'https://post-processing.tresjs.org/guide/' },
                },
            ]
        }
    ],
}
