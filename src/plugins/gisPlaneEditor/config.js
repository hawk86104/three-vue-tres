/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-03-31 15:49:53
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-16 16:37:12
 */
export default {
    name: 'gisPlaneEditor',
    title: '地图空间编辑器',
    intro: '基于TVT.js平台深度定制开发，面向投影地图场景的 GIS 编辑器，适合快速搭地图尺度总览、低空态势、设备布点、倾斜摄影、3DTiles 叠加这类地理空间项目',
    version: '1.1.3',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2026-03-06',
    updateTime: '2026-04-14',
    require: ['basic', 'digitalCity', 'floor', 'UIdemo', 'industry4', 'water', 'simpleGIS', 'gaussianSplatting', 'loadDynamicComponent', 'skyBox'],
    tvtstore: 'LICENSE',
    preview: [
        {
            src: 'plugins/gisPlaneEditor/preview/index.png',
            type: 'img',
            name: 'index',
            title: '编辑器',
            url: 'https://gisplaneeditor.icegl.cn/#/plugins/gisPlaneEditor/index',
            disableFPSGraph: true,
            disableSrcBtn: true,
        },
        {
            "src": "https://gisplaneeditor.icegl.cn/plugins/gisPlaneEditor/preview/多套倾斜摄影3D.png",
            type: 'img',
            name: 'preview?sceneConfig=多套倾斜摄影3D',
            url: 'https://gisplaneeditor.icegl.cn/#/plugins/gisPlaneEditor/preview?sceneConfig=多套倾斜摄影3D',
            title: '多套倾斜摄影3D',
            disableFPSGraph: true,
            disableSrcBtn: true,
        },
        {
            "src": "https://gisplaneeditor.icegl.cn/plugins/gisPlaneEditor/preview/南京黑金漂亮地图.png",
            type: 'img',
            name: 'preview?sceneConfig=南京黑金漂亮地图',
            url: 'https://gisplaneeditor.icegl.cn/#/plugins/gisPlaneEditor/preview?sceneConfig=南京黑金漂亮地图',
            title: '南京黑金漂亮地图',
            disableFPSGraph: true,
            disableSrcBtn: true,
        }
    ],
}
