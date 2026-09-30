/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-04-16 16:08:15
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-04-17 11:10:13
 */
export default {
    name: 'webxr',
    title: 'web VR/AR 场景',
    intro: '基于Web的VR/AR应用程序的组件和工具集，基于tvt.js的最佳实践。',
    version: '1.0.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    preview: [
        {
            catalog: { type: 'block', category: 'physics' },
            src: 'plugins/webxr/preview/theBasic.png',
            type: 'img',
            name: 'theBasic',
            title: '简单实例',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
        {
            catalog: { type: 'block', category: 'physics' },
            src: 'plugins/webxr/preview/ballShooter.png',
            type: 'img',
            name: 'ballShooter',
            title: '小球射击',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
        {
            catalog: { type: 'block', category: 'physics' },
            src: 'plugins/webxr/preview/interactiveBtns.png',
            type: 'img',
            name: 'interactiveBtns',
            title: 'UI交互',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
    ],
}
