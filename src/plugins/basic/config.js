/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-03 15:07:09
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-31 14:03:58
 */
export default {
    name: 'basic',
    title: '原生功能展示',
    intro: '',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'www.icegl.cn',
    state: 'active',
    require: ['UIdemo', 'resourceManager'],
    child: [
        {
            name: 'base',
            title: '基础',
            intro: '基础功能展示',
            pNode: 'basic',
            preview: [
                { catalog: { type: 'block', category: 'interaction' }, src: 'plugins/basic/base/preview/shapesPage.webp', type: 'img', name: 'shapesPage', title: '图形合集组件' },
            ],
        },
        {
            name: 'materials',
            title: '材质',
            intro: '各种衍生材质展示',
            pNode: 'basic',
            preview: [
                {
                    catalog: { type: 'block', category: 'material' },
                    src: 'plugins/basic/materials/preview/physicalDiffractionGrating.webp',
                    type: 'img',
                    name: 'physicalDiffractionGrating',
                    title: '物理衍射光栅',
                    referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
                },
                {
                    catalog: { type: 'block', category: 'material' },
                    src: 'plugins/basic/materials/preview/raytracedDiamond.webp',
                    type: 'img',
                    name: 'raytracedDiamond',
                    title: 'BVH光追钻石',
                    referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
                },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/transmissionMaterial.webp', type: 'img', name: 'transmissionMaterial', title: '玻璃材质2' },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/solidClippingMaterial.webp', type: 'img', name: 'solidClippingMaterial', title: '裁剪材质补色' },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/layerMaterial.webp', type: 'img', name: 'layerMaterial', title: '图层材质' },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/outline.png', type: 'img', name: 'outline', title: 'outline' },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/clearcoat.webp', type: 'img', name: 'clearcoat', title: '反光漆图层' },
                {
                    catalog: { type: 'block', category: 'material' },
                    src: 'plugins/basic/materials/preview/liquidMetal.webp',
                    type: 'img',
                    name: 'liquidMetal',
                    title: '液态金属',
                    referenceSource: { title: 'Liquid Metal', url: 'https://codepen.io/sabosugi/pen/yyabKEP' },
                },
                {
                    catalog: { type: 'block', category: 'material' },
                    src: 'plugins/basic/materials/preview/jumpingBlockMaterial.webp',
                    type: 'img',
                    name: 'jumpingBlockMaterial',
                    title: '跳动块动画材质',
                },
                {
                    catalog: { type: 'block', category: 'material' },
                    src: 'plugins/basic/materials/preview/instancedMeshCustomShaderMaterial.webp',
                    type: 'img',
                    name: 'instancedMeshCustomShaderMaterial',
                    title: 'instanced和继承材质',
                },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/vertexSnapping.webp', type: 'img', name: 'vertexSnapping', title: '顶点捕捉材质' },
                { catalog: { type: 'block', category: 'material' }, src: 'plugins/basic/materials/preview/materialSelector.webp', type: 'img', name: 'materialSelector', title: '多材质切换组件' },
            ],
        },
        {
            name: 'controls',
            title: '控制器',
            intro: '各种控制器',
            pNode: 'basic',
            preview: [
                {
                    catalog: { type: 'block', category: 'interaction' },
                    src: 'plugins/basic/controls/preview/playerControls.webp', type: 'img', name: 'playerControls',
                    referenceSource: { title: 'three-player-controller', url: 'https://github.com/hh-hang/three-player-controller' },
                    title: '玩家控制器'
                },
            ],
        },
        {
            name: 'htmls',
            title: '内嵌dom',
            intro: '内嵌网页元素',
            pNode: 'basic',
            preview: [
                { catalog: { type: 'block', category: 'ui' }, src: 'plugins/basic/htmls/preview/component3UI.webp', type: 'img', name: 'component3UI', title: '引用UI组件' },
                { catalog: { type: 'block', category: 'ui' }, src: 'plugins/basic/htmls/preview/websiteReflector.webp', type: 'img', name: 'websiteReflector', title: '网页电脑+镜面' },
            ],
        },
        {
            name: 'shine',
            title: '闪耀发光类',
            intro: '关于物体发光的简单例子',
            pNode: 'basic',
            preview: [
                {
                    catalog: { type: 'block', category: 'lighting' },
                    src: 'plugins/basic/shine/preview/geometricGlow.webp', type: 'img', name: 'geometricGlow', title: 'geometric缩放',
                    referenceSource: { title: 'jeromeetienne', url: 'https://github.com/jeromeetienne/threex.geometricglow' },
                 },
                {
                    catalog: { type: 'block', category: 'lighting' },
                    src: 'plugins/basic/shine/preview/fakeGlow.webp',
                    type: 'img',
                    name: 'fakeGlow',
                    title: 'FakeGlow',
                    referenceSource: { title: 'FakeGlow', url: 'https://r3f-fake-glow-material.vercel.app/' },
                },
                {
                    catalog: { type: 'block', category: 'lighting' },
                    src: 'plugins/basic/shine/preview/effectComposerShaderPass.webp',
                    type: 'img',
                    name: 'effectComposerShaderPass',
                    title: '后期处理-图层+ShaderPass',
                    referenceSource: { title: 'zerotoinfinity', url: 'https://www.cnblogs.com/zerotoinfinity/p/15910759.html' },
                },
            ],
        },
        {
            name: 'tresProcessing',
            title: 'tresProcessing库',
            intro: '直接使用tres的后期处理库实例',
            pNode: 'basic',
            preview: [
                {
                    catalog: { type: 'block', category: 'lighting' },
                    src: 'plugins/basic/tresProcessing/preview/fusion.webp',
                    type: 'img',
                    name: 'fusion',
                    title: '融合多个后期效果',
                    referenceSource: { title: 'post-processing.tresjs', url: 'https://post-processing.tresjs.org/guide/' },
                },
                {
                    catalog: { type: 'block', category: 'lighting' },
                    src: 'plugins/basic/tresProcessing/preview/outlinePass.webp',
                    type: 'img',
                    name: 'outlinePass',
                    title: '外边框处理',
                    referenceSource: { title: 'post-processing.tresjs', url: 'https://post-processing.tresjs.org/guide/' },
                },
            ]
        }
    ],
}
