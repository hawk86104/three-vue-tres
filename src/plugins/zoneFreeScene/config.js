/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-09-11 08:59:53
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-23 11:54:05
 */

export default {
    name: 'zoneFreeScene',
    title: '编辑器直出免费项目',
    intro: `这里都是基于TVT区域场景编辑器直接编辑导出的场景，包含了全部源码、模型、编辑器配置等，方便大家快速二次开发和学习。<br>
    1、低像素炼油厂<br>
    全套项目源码：<a style="color: #5384ff;" href="https://gitee.com/ice-gl/icegl-three-vue-tres/blob/master/src/plugins/zoneFreeScene/pages/freeRefiningIndustry.vue" target="_blank">gitee源码跳转</a><br>
    基于编辑器的配置，用于二次编辑使用：<a style="color: #5384ff;" href="https://opensource.icegl.cn/plugins/zoneFreeScene/config/freeRefiningIndustry.json" target="_blank">freeRefiningIndustry.json</a><br>
    在线编辑器再次编辑后免费导出源码项目二开：<a style="color: #ef4035;" href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeRefiningIndustry" target="_blank">zone3Deditor页面跳转</a><br>
    2、TvT.js技术栈<br>
    全套项目源码：<a style="color: #5384ff;" href="https://gitee.com/ice-gl/icegl-three-vue-tres/blob/master/src/plugins/zoneFreeScene/pages/freeTvtStack.vue" target="_blank">gitee源码跳转</a><br>
    基于编辑器的配置，用于二次编辑使用：<a style="color: #5384ff;" href="https://opensource.icegl.cn/plugins/zoneFreeScene/config/freeTvtStack.json" target="_blank">freeTvtStack.json</a><br>
    在线编辑器再次编辑后免费导出源码项目二开：<a style="color: #ef4035;" href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeTvtStack" target="_blank">zone3Deditor页面跳转</a><br>
    3、海洋船运<br>
    全套项目源码：<a style="color: #5384ff;" href="https://gitee.com/ice-gl/icegl-three-vue-tres/blob/master/src/plugins/zoneFreeScene/pages/freeShipSea.vue" target="_blank">gitee源码跳转</a><br>
    基于编辑器的配置，用于二次编辑使用：<a style="color: #5384ff;" href="https://opensource.icegl.cn/plugins/zoneFreeScene/config/freeShipSea.json" target="_blank">freeShipSea.json</a><br>
    在线编辑器再次编辑后免费导出源码项目二开：<a style="color: #ef4035;" href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeShipSea" target="_blank">zone3Deditor页面跳转</a><br>
    4、混元世界<br>
    全套项目源码：<a style="color: #5384ff;" href="https://gitee.com/ice-gl/icegl-three-vue-tres/blob/master/src/plugins/zoneFreeScene/pages/freeHYworld.vue" target="_blank">gitee源码跳转</a><br>
    基于编辑器的配置，用于二次编辑使用：<a style="color: #5384ff;" href="https://opensource.icegl.cn/plugins/zoneFreeScene/config/freeHYworld.json" target="_blank">freeHYworld.json</a><br>
    在线编辑器再次编辑后免费导出源码项目二开：<a style="color: #ef4035;" href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeHYworld" target="_blank">zone3Deditor页面跳转</a><br>
     QA问答:<br>
    1、此插件包依赖免费插件，请前往下载安装： <a style="color: #5384ff;" href="https://www.icegl.cn/tvtstore/useViewportGizmo" target="_blank">ViewportGizmo插件</a><br>
    `,
    version: '2.5.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2025-09-11',
    updateTime: '2026-04-23',
    require: [],
    tvtstore: 'FREE',
    preview: [
        { src: './plugins/zoneFreeScene/preview/freeRefiningIndustry.png', type: 'img', name: 'freeRefiningIndustry', title: '低像素炼油厂', disableFPSGraph: false, disableSrcBtn: false },
        { src: './plugins/zoneFreeScene/preview/freeTvtStack.png', type: 'img', name: 'freeTvtStack', title: 'TvT.js技术栈', disableFPSGraph: false, disableSrcBtn: false },
        { src: './plugins/zoneFreeScene/preview/freeShipSea.png', type: 'img', name: 'freeShipSea', title: '海洋船运', disableFPSGraph: false, disableSrcBtn: false },
        { src: './plugins/zoneFreeScene/preview/freeHYworld.png', type: 'img', name: 'freeHYworld', title: '混元世界', disableFPSGraph: false, disableSrcBtn: false }
    ],
}
