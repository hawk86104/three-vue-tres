/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-03-05 10:47:55
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-03-07 09:03:14
 */
export default {
    name: 'uniAppView',
    title: 'uniapp小程序',
    intro: `结合uni-app的开源生态，使用web-view的方式和uni-app交互，方便在您的微信、支付宝等小程序、以及安卓、ios中插入我们的tvt案例以及插件<br>
    详情请见：<a style="color: #5384ff;" href="https://www.icegl.cn/tvtstore/uniAppView" target="_blank">uniAppView插件小程序/app</a>`,
    version: '1.1.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2025-03-05',
    updateTime: '2025-03-18',
    require: ['UIdemo','industry4','floor'],
    preview: [
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/uniAppView/preview/h5demo.png',
            type: 'img',
            name: 'h5demo',
            title: '简单UI交互',
            disableFPSGraph: true,
            disableSrcBtn: true,
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/uniAppView/preview/threedemo.png',
            type: 'img',
            name: 'threedemo',
            title: '三维交互',
            disableFPSGraph: true,
            disableSrcBtn: true,
        },
    ],
}