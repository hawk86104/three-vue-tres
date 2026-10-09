/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-06-19 16:59:21
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-01 09:15:29
 */

export default {
    name: 'simpleGIS',
    title: '简单的GIS例子',
    intro: '都是些GIS行业的应用简单例子',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    creatTime: '2024-02-12',
    updateTime: '2024-03-19',
    preview: [
        {
            catalog: { type: 'scene', category: 'city' },
            src: 'plugins/simpleGIS/preview/jiangSuMap.webp',
            type: 'img',
            name: 'jiangSuMap',
            title: '江苏地图展示',
            referenceSource: { title: 'ouzexi', url: 'https://github.com/ouzexi/threejs-guangdong-map' },
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/streamLines.webp',
            type: 'img',
            name: 'streamLines',
            title: '流光线展示',
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/tileMap.webp',
            type: 'img',
            name: 'tileMap',
            title: '地图瓦片展示',
            referenceSource: { title: 'xianziljl', url: 'https://github.com/xianziljl/three-satellite-map' },
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/renderer3DTiles.webp',
            type: 'img',
            name: 'renderer3DTiles',
            title: '3DTiles展示',
            referenceSource: { title: 'nasa-ammos', url: 'https://github.com/NASA-AMMOS/3DTilesRendererJS' },
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/obliquePhotoPage.webp',
            type: 'img',
            name: 'obliquePhotoPage',
            title: '倾斜摄影组件化',
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/3DTilesComPage.webp',
            type: 'img',
            name: '3DTilesComPage',
            title: '3DTiles组件化',
        },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/cesiumIon.webp',
            type: 'img',
            name: 'cesiumIon',
            title: 'cesiumIon倾斜摄影'
        },
        {
            catalog: { type: 'scene', category: 'city' },
            src: 'plugins/simpleGIS/preview/googleMapsExample.webp',
            type: 'img',
            name: 'googleMapsExample',
            title: 'googleMaps演示'
        },
        { catalog: { type: 'scene', category: 'city' }, src: 'plugins/simpleGIS/preview/mapBuildings.webp', type: 'img', name: 'mapBuildings', title: '地图和3DTiles结合' },
        {
            catalog: { type: 'block', category: 'gis' },
            src: 'plugins/simpleGIS/preview/threeTileEx.webp',
            type: 'img',
            name: 'threeTileEx',
            title: 'threeTile使用实例',
            referenceSource: { title: 'three-tile', url: 'https://github.com/sxguojf/three-tile' },
        },
        {
            catalog: { type: 'scene', category: 'city' },
            src: 'plugins/simpleGIS/preview/cloundSate.webp',
            type: 'img',
            name: 'cloundSate',
            title: '卫星云图',
        },
        {
            catalog: { type: 'scene', category: 'city' },
            src: 'plugins/simpleGIS/preview/radraImg.webp',
            type: 'img',
            name: 'radraImg',
            title: '雷达图',
        },
    ],
}
