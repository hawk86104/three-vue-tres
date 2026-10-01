/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-29 17:49:37
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-13 15:08:57
 */
export default {
    name: 'geokit',
    title: '地理渲染开发工具',
    intro: `由TvT团队推出的 @icegl/geokit 地理渲染开发工具的使用案例
<br/>🚀高性能, 🚀高易用, 🚀高可扩展性, 还有最最重要的<strong>低复杂度!</strong>
<br/>仅需掌握几个核心组件的参数，即可进行可靠的3D地理渲染的开发
<br/>是否在为cesium复杂的sdk烦恼? 是否在为地图api融合threejs头疼? 是否在为threejs加载模型对不齐难受? 这个工具就是你的不二之选
<br/>开源地址: <a href="https://gitee.com/ice-gl/geokit" target="_blank">Gitee</a>
`,
    version: '1.0.0',
    author: '石头web',
    website: 'https://github.com/a876691666',
    state: 'active',
    creatTime: '2025-07-08',
    updateTime: '2025-07-08',
    require: [],
    preview: [
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-base.webp', type: 'img', name: 'case-base', title: '干净的模板' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-3dtiles.webp', type: 'img', name: 'case-3dtiles', title: '加载3dtiles与控制视点' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-icon.webp', type: 'img', name: 'case-icon', title: '图标组件与文字组件' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-particle-icon.webp', type: 'img', name: 'case-particle-icon', title: '海量图标与点击交互' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-css2d.webp', type: 'img', name: 'case-css2d', title: 'css2d组件' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-position.webp', type: 'img', name: 'case-position', title: '位置组件与3d模型的复合使用' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-flyline.webp', type: 'img', name: 'case-flyline', title: '飞线组件的详细示例' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-line.webp', type: 'img', name: 'case-line', title: '线组件的详细示例' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-building.webp', type: 'img', name: 'case-building', title: '建筑组件' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-face.webp', type: 'img', name: 'case-face', title: '多边形面与围墙组件' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-tres-canvas.jpg', type: 'img', name: 'case-tres-canvas', title: '使用原始TresCanvas搭配geokit' },
        { catalog: { type: 'scene', category: 'city' }, src: 'plugins/geokit/preview/case-real-1.webp', type: 'img', name: 'case-real-1', title: '实战案例1' },
        { catalog: { type: 'scene', category: 'city' }, src: 'plugins/geokit/preview/case-real-2.webp', type: 'img', name: 'case-real-2', title: '实战案例2' },
        { catalog: { type: 'scene', category: 'city' }, src: 'plugins/geokit/preview/case-real-3.webp', type: 'img', name: 'case-real-3', title: '实战案例3' },
        { catalog: { type: 'block', category: 'gis' }, src: 'plugins/geokit/preview/case-tvt-3dtilesBuildings.webp', type: 'img', name: 'case-tvt-3dtilesBuildings', title: '加载tvt建筑白膜组件' },
    ],
}