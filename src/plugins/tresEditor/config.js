/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-05-10 10:11:04
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2024-05-24 10:10:19
 */
export default {
    name: 'tresEditor',
    title: 'tres3D编辑器',
    intro: '利用Three.js的原生编辑器，导入到本TvT.js快速完成项目落地。整体文档和视频教程详见：<a style="color: #5384ff;" href="https://docs.icegl.cn/docs/three-vue-tres/editor/threeeditor.html" target="_blank">编辑器教程</a>',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2024-05-10',
    updateTime: '2024-05-10',
    require: [],
    preview: [
        {
            catalog: { type: 'tool', category: 'scene' },
            src: `<a style="color: #5384ff;" href="https://threejs.org/editor/" target="_blank">threejs.org/editor</a> 的国内镜像，为了让大家更方便使用。编辑好场景后，选择项目下的发布按钮，下载解压包，获得里面的:app.json。
            拿着它，使用旁边的<<a style="color: #5384ff;" href="https://opensource.icegl.cn/#/plugins/tresEditor/simpleImport" target="_blank">插件生成器</a>>，生成、安装插件。开始我们TvT.js的旅程吧！`,
            type: 'text',
            name: 'threeEditor',
            url: 'https://editor.icegl.cn',
            title: 'three原生Editor',
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: `<a style="color: #5384ff;" href="https://docs.icegl.cn/docs/three-vue-tres/editor/totvt.html" target="_blank">使用教程详见:导出/安装TvT插件包</a></br>
            1、载入原生Three.js编辑器的Json文件</br>
            2、--- 生成插件包【ZIP格式】---</br>
            3、按照文档中的方法安装插件：<a style="color: #5384ff;" href="https://docs.icegl.cn/docs/three-vue-tres/plugin/manage.html#创建插件" target="_blank">插件管理</a></br>`,
            type: 'text',
            name: 'simpleImport',
            title: '插件生成器',
        },
        { catalog: { type: 'scene', category: 'product' }, src: 'plugins/tresEditor/preview/coffeeDemo.png', type: 'img', name: 'coffeeDemo', title: '编辑器直出咖啡☕️' },
        { catalog: { type: 'scene', category: 'industry' }, src: 'plugins/tresEditor/preview/svelteMachine.png', type: 'img', name: 'svelteMachine', title: '编辑器半出Svelte机械' },
    ],
}
