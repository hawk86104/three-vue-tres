/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-26 15:03:02
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-31 11:45:01
 */
export default {
    "name": "loadDynamicComponent",
    "title": "读取动态组件",
    "intro": `通过此组件可以动态加载并显示其他组件</br>
    发布服务程序gitee开源地址：
    <a style="color: #5384ff;" href="https://gitee.com/ice-gl/dynamic-component-service" target="_blank">gitee.com/ice-gl/dynamic-component-service</a></br>
    1、发布你自己的高级组件，可以通过此组件，在tvt.js灵活调试</br>
    2、可以导入到在线的 <区域场景编辑器> <a style="color: #5384ff;" href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index" target="_blank">zone3deditor.icegl.cn</a>，进行二次编辑后，再开发。`,
    "version": "1.0.0",
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    "creatTime": "2025-12-26",
    "updateTime": "2025-12-26",
    "require": [],
    "preview": [{
       src: `
            1、使用发布的开源动态组件:<a style="color: #5384ff;" href="https://dcser.icegl.cn" target="_blank">https://dcser.icegl.cn</a></br>
            2、动态组件库已开源：<a style="color: #5384ff;" href="https://gitee.com/ice-gl/dynamic-component-service" target="_blank">制作你自己的高级组件</a>
            3、发布你自己的高级组件，可以通过此组件，在tvt.js灵活调试</br>`,
            type: 'text',
        "name": "basic",
        "title": "简单读取实例",
        disableFPSGraph: false,
        disableSrcBtn: false
    },{
        "src": "plugins/loadDynamicComponent/preview/readConfig.png",
        "type": "img",
        "name": "readConfig",
        "title": "读取远程配置实例",
        disableFPSGraph: false,
        disableSrcBtn: false
    },]
}