/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-10 16:11:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-07-24 09:27:49
 */

export default {
    name: 'industry4',
    title: '工业4.0',
    intro: '工业4.0数字化例子',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    creatTime: '2023-11-12',
    updateTime: '2024-03-20',
    preview: [
        { catalog: { type: 'block', category: 'lighting' }, src: 'plugins/industry4/preview/deviceLight.png', type: 'img', name: 'deviceLight', title: '设备发光' },
        { catalog: { type: 'scene', category: 'industry' }, src: 'plugins/industry4/preview/deviceLightReflector.png', type: 'img', name: 'deviceLightReflector', title: '设备发光+镜面+表格说明' },
        { catalog: { type: 'block', category: 'interaction' }, src: 'plugins/industry4/preview/planeClipping.png', type: 'img', name: 'planeClipping', title: '飞机剖面' },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/industry4/preview/showCar.png',
            type: 'img',
            name: 'showCar',
            title: '911展示',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/lwo219' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/industry4/preview/showLambo.png',
            type: 'img',
            name: 'showLambo',
            title: 'Lambo展示',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/e662p3' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/industry4/preview/su7.png',
            type: 'img',
            name: 'su7',
            title: '来吧，小米su7',
            referenceSource: { title: 'gamemcu', url: 'https://gamemcu.com/su7/' },
        },
        {
            catalog: { type: 'block', category: 'interaction' },
            src: 'plugins/industry4/preview/collectTriangles.png',
            type: 'img',
            name: 'collectTriangles',
            title: '喷漆收集三角形',
            disableFPSGraph: true,
            disableSrcBtn: true,
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/industry4/preview/dissolveEffect.png',
            type: 'img',
            name: 'dissolveEffect',
            title: '溶解特效',
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/industry4/preview/dissolveEffectPlus.png',
            type: 'img',
            name: 'dissolveEffectPlus',
            title: '高级溶解特效',
            referenceSource: { title: 'JatinChopra', url: 'https://github.com/JatinChopra/emissive-dissolve-effect' },
        },
        {
            catalog: { type: 'scene', category: 'industry' },
            src: 'plugins/industry4/preview/alternator.png',
            type: 'img',
            name: 'alternator',
            title: '发电机展示',
            disableFPSGraph: true,
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/industry4/preview/flexiblePipePage.png',
            type: 'img',
            name: 'flexiblePipePage',
            title: '伸缩管线',
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/industry4/preview/flexiblePipe2Page.png',
            type: 'img',
            name: 'flexiblePipe2Page',
            title: '伸缩管线2',
        },
        {
            catalog: { type: 'block', category: 'effects' },
            src: 'plugins/industry4/preview/tslGearsForkedPage.png',
            type: 'img',
            name: 'tslGearsForkedPage',
            title: 'TSL齿轮分叉',
            referenceSource: { title: 'react-three/fiber', url: 'https://codesandbox.io/p/sandbox/webgpu-tsl-gears-forked-v3d959' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/industry4/bikeConfigurator/bike-poster.jpg',
            type: 'img',
            name: 'bikeConfigurator',
            title: 'Bike Configurator',
            referenceSource: { title: 'Needle Engine', url: 'https://engine.needle.tools/projects/bike/' },
        }
    ],
}
