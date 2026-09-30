/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-04-01 15:50:33
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-10 14:00:58
 */
export default {
    name: 'qiankunTvt',
    title: '微前端qiankun',
    intro: `本案例结合qiankun微前端框架，演示了如何把tvt以子应用引入到自己的主应用框架中，并且实现了qiankun的沙箱隔离机制。qiankun是一个基于single-spa的微前端框架，支持多种主应用和子应用的组合方式。</br>
    演示地址：<a style="color:#5384ff;" href="https://cos.icegl.cn" target="_blank">cos.icegl.cn</a></br>
    教程文档：<a style="color:#5384ff;" href="https://docs.icegl.cn/docs/three-vue-tres/qiankun/introduction.html" target="_blank">详细教程</a></br>`,
    version: '2.0.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2025-04-01',
    updateTime: '2025-10-10',
    require: ['floor','medical'],
    preview: [
        {
            catalog: { type: 'tool', category: 'integration' },
            src: `
            1、这里演示了在vue2的后台站点中，快速引用tvt.js框架，落地项目。</br>
            2、此站点作为qiankun的主应用,tvt.js作为子应用</br>
            3、展示三维场景以及事件信息的最佳实践</br>
            先看演示地址：<a style="color: #ff00ff;" href="https://cos.icegl.cn" target="_blank">cos.icegl.cn</a></br>
            整体文档详见：<a style="color: #5384ff;" href="https://docs.icegl.cn/docs/three-vue-tres/qiankun/introduction.html" target="_blank">详细教程</a></br>`,
            type: 'text',
            name: 'other',
            title: '嵌入后台演示版本',
            url: 'https://cos.icegl.cn',
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/qiankunTvt/preview/theBasic.png',
            type: 'img',
            name: 'theBasic',
            title: '简单实例',
            disableFPSGraph: false,
            disableSrcBtn: true,
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/qiankunTvt/preview/events.png',
            type: 'img',
            name: 'events',
            title: '通讯实例',
            disableFPSGraph: false,
            disableSrcBtn: true,
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/medical/preview/yuriBrain.png',
            type: 'img',
            name: 'other',
            title: '其他场景移植',
            disableFPSGraph: false,
            disableSrcBtn: true,
        },
    ],
}
