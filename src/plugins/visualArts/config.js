/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-04-30 08:18:21
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-07-02 15:21:33
 */
export default {
    name: 'visualArts',
    title: '视觉艺术',
    intro: '这里展示一些视觉艺术的效果',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2024-04-30',
    updateTime: '2024-04-30',
    require: ['UIdemo', 'resourceManager'],
    preview: [
        {
            catalog: { type: 'scene', category: 'art' },
            src: 'plugins/visualArts/preview/porcelainBrassSubmarine.webp',
            type: 'img',
            name: 'porcelainBrassSubmarine',
            title: '瓷器黄铜潜艇',
            referenceSource: { title: 'Three.js Awesome Graphics Agent Skills', url: 'https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills' },
        },
        {
            catalog: { type: 'scene', category: 'art' },
            src: 'plugins/visualArts/preview/biineBee.webp',
            type: 'img',
            name: 'biineBee',
            title: 'Biine Bee',
            referenceSource: { title: 'Patrick Heintzmann Lab', url: 'https://lab.patrickheintzmann.com/demo/demoBee' },
        },
        {
            catalog: { type: 'block', category: 'lighting' },
            src: 'plugins/visualArts/preview/volumetricLightGodray.webp',
            type: 'img',
            name: 'volumetricLightGodray',
            title: '电影体积光',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/yggpw5' },
        },
        {
            catalog: { type: 'scene', category: 'art' },
            src: 'plugins/visualArts/preview/roomup.webp',
            type: 'img',
            name: 'roomup',
            title: '日式会厅',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/ykfpwf' },
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/windLine.webp',
            type: 'img',
            name: 'windLine',
            title: '流动风线',
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/气泡.webp',
            type: 'img',
            name: 'bubble',
            title: '泡泡',
        },
        {
            catalog: { type: 'scene', category: 'art' },
            src: 'plugins/visualArts/preview/玻璃.webp',
            type: 'img',
            name: 'mirror',
            title: '玻璃',
        },
        {
            catalog: { type: 'scene', category: 'art' },
            src: 'plugins/visualArts/preview/galaxy.webp',
            type: 'img',
            name: 'galaxy',
            title: '银河',
            referenceSource: { title: 'alvarosabu', url: 'https://lab.tresjs.org/experiments/galaxy-generator' },
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/repulsionEffect.webp',
            type: 'img',
            name: 'repulsionEffect',
            title: '排斥效果',
            referenceSource: { title: 'alvarosabu', url: 'https://lab.tresjs.org/experiments/repulsion-effect' },
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/lightNoise.webp',
            type: 'img',
            name: 'lightNoise',
            title: '光噪声',
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/fragmentModel.webp',
            type: 'img',
            name: 'fragmentModel',
            title: '碎片模型',
            referenceSource: { title: 'honbingitee', url: 'https://gitee.com/honbingitee/three-template-next.js/commit/f34164073d37a1b23bf5cbfb2f21258b2416e92a' },
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/revealEffect.webp',
            type: 'img',
            name: 'revealEffect',
            title: '揭露动画效果',
            referenceSource: { title: 'honbingitee', url: 'https://github.com/colindmg/r3f-image-reveal-effect' },
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/visualArts/preview/imgParticle.webp',
            type: 'img',
            name: 'imgParticle',
            title: '图片粒子化',
        },
        {
            catalog: { type: 'block', category: 'material' },
            src: 'plugins/visualArts/preview/voxelizedShader.webp',
            type: 'img',
            name: 'voxelizedShader',
            title: '物体体素化',
            referenceSource: { title: 'YuriArtiukh', url: 'https://www.youtube.com/watch?v=fTskqZZRO1Q' },
        },
    ],
}
