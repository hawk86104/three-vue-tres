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
                { src: 'plugins/basic/base/preview/shapesPage.png', type: 'img', name: 'shapesPage', title: '图形合集组件' },
                { src: 'plugins/basic/base/preview/shaderParticles.png', type: 'img', name: 'shaderParticles', title: '着色器实践' },
            ],
        },
        {
            name: 'materials',
            title: '材质',
            intro: '各种衍生材质展示',
            pNode: 'basic',
            preview: [
                {
                    src: 'plugins/basic/materials/preview/physicalDiffractionGrating.png',
                    type: 'img',
                    name: 'physicalDiffractionGrating',
                    title: '物理衍射光栅',
                    referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
                },
                {
                    src: 'plugins/basic/materials/preview/raytracedDiamond.png',
                    type: 'img',
                    name: 'raytracedDiamond',
                    title: 'BVH光追钻石',
                    referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
                },
                { src: 'plugins/basic/materials/preview/transmissionMaterial.png', type: 'img', name: 'transmissionMaterial', title: '玻璃材质2' },
                { src: 'plugins/basic/materials/preview/solidClippingMaterial.png', type: 'img', name: 'solidClippingMaterial', title: '裁剪材质补色' },
                { src: 'plugins/basic/materials/preview/layerMaterial.png', type: 'img', name: 'layerMaterial', title: '图层材质' },
                { src: 'plugins/basic/materials/preview/outline.png', type: 'img', name: 'outline', title: 'outline' },
                { src: 'plugins/basic/materials/preview/clearcoat.png', type: 'img', name: 'clearcoat', title: '反光漆图层' },
                {
                    src: 'plugins/basic/materials/preview/liquidMetal.png',
                    type: 'img',
                    name: 'liquidMetal',
                    title: '液态金属',
                    referenceSource: { title: 'Liquid Metal', url: 'https://codepen.io/sabosugi/pen/yyabKEP' },
                },
                {
                    src: 'plugins/basic/materials/preview/jumpingBlockMaterial.svg',
                    type: 'img',
                    name: 'jumpingBlockMaterial',
                    title: '跳动块动画材质',
                },
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
                {
                    src: 'plugins/basic/controls/preview/playerControls.png', type: 'img', name: 'playerControls',
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
                { src: 'plugins/basic/htmls/preview/component3UI.png', type: 'img', name: 'component3UI', title: '引用UI组件' },
                { src: 'plugins/basic/htmls/preview/websiteReflector.png', type: 'img', name: 'websiteReflector', title: '网页电脑+镜面' },
            ],
        },
        {
            name: 'shine',
            title: '闪耀发光类',
            intro: '关于物体发光的简单例子',
            pNode: 'basic',
            preview: [
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
                {
                    src: 'plugins/basic/shine/preview/effectComposerShaderPass.png',
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
