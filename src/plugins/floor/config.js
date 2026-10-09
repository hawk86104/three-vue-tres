/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-12-20 17:01:37
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-08-28 12:30:14
 */
export default {
    name: 'floor',
    title: '地面地板实例',
    intro: '地面集合例子',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: ['basic'],
    preview: [
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/ripperfloor.webp', type: 'img', name: 'rippleFloor', title: '波纹地板' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/mechaFloor.webp', type: 'img', name: 'mechaFloor', title: '机甲地板' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/rubberTilesPage.webp', type: 'img', name: 'rubberTilesPage', title: '橡胶地板' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/simpleReflector.webp', type: 'img', name: 'simpleReflector', title: '简单镜面' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/meshReflectionFloor.png', type: 'img', name: 'meshReflectionFloor', title: '通用镜面地板' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/reflectorShader.webp', type: 'img', name: 'reflectorShader', title: '镜面材质着色器' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/reflectorDiffuse.webp', type: 'img', name: 'reflectorDiffuse', title: 'fiber镜面' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/reflectorDUDV.webp', type: 'img', name: 'reflectorDUDV', title: 'dudv镜面' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/reflectorRoundedBoxPage.webp', type: 'img', name: 'reflectorRoundedBoxPage', title: 'RoundedBox镜面' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/showFloor.webp', type: 'img', name: 'showFloor', title: '地板模型拼接+镜面' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/videoFloor.webp', type: 'img', name: 'videoFloor', title: 'video动态底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/imgFloor.webp', type: 'img', name: 'imgFloor', title: '图片动态底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/canvasFloor.webp', type: 'img', name: 'canvasFloor', title: 'canvas动态底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/digitalGround.webp', type: 'img', name: 'digitalGround', title: '数字动态底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/hexGridGround.webp', type: 'img', name: 'hexGridGround', title: '网格动态底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/whiteFloor.webp', type: 'img', name: 'whiteFloor', title: '白色边缘模糊' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/gridPlus.webp', type: 'img', name: 'gridPlus', title: '网格扩展' },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/floor/preview/gridFloor.webp', type: 'img', name: 'gridFloor', title: '网格地板',
            referenceSource: { title: 'shaders-jikken', url: 'https://grid-floor.vercel.app/' },
         },
        {
            catalog: { type: 'block', category: 'environment' },
            src: 'plugins/floor/preview/grass.webp',
            type: 'img',
            name: 'grass',
            title: '草地',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/5xho4' },
        },
        { catalog: { type: 'block', category: 'effects' }, src: 'plugins/floor/preview/circleWave.webp', type: 'img', name: 'circleWave', title: '花纹圈动画' },
        { catalog: { type: 'block', category: 'effects' }, src: 'plugins/floor/preview/cartoonMagicZone.webp', type: 'img', name: 'cartoonMagicZone', title: '卡通能量圈' },
        { catalog: { type: 'block', category: 'effects' }, src: 'plugins/floor/preview/lineMagicZone.webp', type: 'img', name: 'lineMagicZone', title: '线条能量圈' },
        { catalog: { type: 'block', category: 'effects' }, src: 'plugins/floor/preview/particleBasePage.webp', type: 'img', name: 'particleBasePage', title: '粒子底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/topoBasePage.webp', type: 'img', name: 'topoBasePage', title: '拓扑底座' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/hexagonalFloorPage.webp', type: 'img', name: 'hexagonalFloorPage', title: '六面地板组件化' },
        { catalog: { type: 'block', category: 'effects' }, src: 'plugins/floor/preview/ribbonArrowPage.webp', type: 'img', name: 'ribbonArrowPage', title: '滚动箭头组件' },
        { catalog: { type: 'block', category: 'environment' }, src: 'plugins/floor/preview/dynamicRotatingBase.webp', type: 'img', name: 'dynamicRotatingBase', title: '动态旋转基座' },
    ],
}
