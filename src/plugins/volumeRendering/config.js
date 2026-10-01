export default {
	"name": "volumeRendering",
	"title": "体积渲染",
	"intro": "体积渲染是一种三维图形技术,可以将三维数据集(如CT、MRI扫描)渲染成二维图像。这里展示了基础的体积渲染示例。<br/> 目前只使用raw数据集渲染, 并且参数较少, 更完善的体积渲染请使用 <a href='https://www.icegl.cn/tvtstore/tvtVolumeRendering.html' target='_blank'>TvT.js体渲染插件</a>",
	"version": "0.0.1",
	"author": "石头web",
	"website": "https://github.com/a876691666",
	"state": "active",
	"require": [],
	"preview": [
		{ catalog: { type: 'block', category: 'rendering' }, "src": "plugins/volumeRendering/preview/basicVolume.webp", "type": "img", "name": "basicVolume", "title": "基础体积渲染" },
	]
}
