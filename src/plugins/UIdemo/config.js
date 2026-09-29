/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-03-12 11:16:41
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-23 14:17:17
 */
export default {
    name: 'UIdemo',
    title: 'UI界面相关',
    intro: `UI界面的例子，浏览器滚动，资源加载器Loading样式。<br>
		<span>1、3D文字的字体文件可以参考:<a style="color: #5384ff;" href="https://threejs.org/docs/index.html?q=text#examples/en/geometries/TextGeometry" target="_blank">three文档说明</a></span><br>
		<span>2、生成json字体文件的网址是:<a style="color: #5384ff;" href="https://gero3.github.io/facetype.js/" target="_blank">facetype.js</a></span><br>
		<span>3、用于ThreeMeshUI的字体文件生成地址为:<a style="color: #5384ff;" href="https://msdf-bmfont.donmccurdy.com/" target="_blank">msdf字体文件</a></span><br>`,
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    creatTime: '2024-01-12',
    updateTime: '2024-03-19',
    preview: [
        { src: 'plugins/UIdemo/preview/divIllustrate.png', type: 'img', name: 'divIllustrate', title: 'DIV说明样例' },
        { src: 'plugins/UIdemo/preview/echartSample.png', type: 'img', name: 'echartSample', title: 'Echart表格样例' },
        { src: 'plugins/UIdemo/preview/sizeMark.png', type: 'img', name: 'sizeMark', title: '尺寸样式' },
        {
            src: 'plugins/UIdemo/preview/scrollPartical.png',
            type: 'img',
            name: 'scrollPartical',
            title: '滚动粒子',
            referenceSource: { title: 'MisterPrada', url: 'https://github.com/MisterPrada/morph-particles' },
        },
        { src: 'plugins/UIdemo/preview/loadingManagerStyle.png', type: 'img', name: 'loadingManagerStyle', title: '资源加载器Loading' },
        { src: 'plugins/UIdemo/preview/threeMeshUIstyle.png', type: 'img', name: 'threeMeshUIstyle', title: 'MeshUI简单样式' },
        { src: 'plugins/UIdemo/preview/bannerLabel.png', type: 'img', name: 'bannerLabel', title: '精灵图文字' },
        { src: 'plugins/UIdemo/preview/domPanelPage.png', type: 'img', name: 'domPanelPage', title: 'dom面板' },
        { src: 'plugins/UIdemo/preview/spriteImgPage.png', type: 'img', name: 'spriteImgPage', title: '精灵图片' },
        { src: 'plugins/UIdemo/preview/svgComPage.png', type: 'img', name: 'svgComPage', title: 'svg组件' },
        { src: 'plugins/UIdemo/preview/line2RoundedRectPage.png', type: 'img', name: 'line2RoundedRectPage', title: '矩形线边框' },
        { src: 'plugins/UIdemo/preview/lineArrowPage.png', type: 'img', name: 'lineArrowPage', title: '箭头线组件' },
        { src: 'plugins/UIdemo/preview/generalFontPage.png', type: 'img', name: 'generalFontPage', title: '标准三维字体组件' },
    ],
}
