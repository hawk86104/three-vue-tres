/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-10 16:11:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-05 10:14:27
 */

export default {
    name: 'water',
    title: '水相关',
    intro: '河流、水域、海洋等场景',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: ['UIdemo', 'resourceManager'],
    preview: [
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/spectralCascadeOcean.webp',
            type: 'img',
            name: 'spectralCascadeOcean',
            title: '频谱级联海洋',
            referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
        },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/stylizedAboveBelowOcean.webp',
            type: 'img',
            name: 'stylizedAboveBelowOcean',
            title: '风格化水上/水下海洋',
            referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
        },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/submergedSnellOcean.webp',
            type: 'img',
            name: 'submergedSnellOcean',
            title: '水下斯涅尔海洋',
            referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
        },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/water/preview/staticWaterPage.webp', type: 'img', name: 'staticWaterPage', title: '静态水' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/water/preview/waveC.webp', type: 'img', name: 'waveC', title: '波浪C' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/water/preview/threeExampleOcean.webp', type: 'img', name: 'threeExampleOcean', title: 'three例子-海洋' },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/customWater.webp',
            type: 'img',
            name: 'customWater',
            title: '自定义水',
            referenceSource: { title: 'CustomShaderMaterial', url: 'https://github.com/FarazzShaikh/THREE-CustomShaderMaterial' },
        },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/realWater.webp',
            type: 'img',
            name: 'realWater',
            title: '真实水',
            referenceSource: { title: 'realWater', url: 'https://github.com/martinRenou/threejs-water' },
        },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/iceFloor.webp',
            type: 'img',
            name: 'iceFloor',
            title: '冰面',
            referenceSource: { title: 'ice-trails', url: 'https://github.com/rock-biter/ice-trails' },
        },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/water/preview/gerstnerWaterPage.webp',
            type: 'img',
            name: 'gerstnerWaterPage',
            title: '海洋波浪组件',
        },
    ],
}
