/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-11-26 09:58:13
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-09 14:55:41
 */
export default {
	"name": "resourceManager",
	"title": "资源管理器插件",
	"intro": `适用于TvT.js的资源管理器插件，结合loading管理器，预加载模型和材质等资源。使用方法详情请见：
	<a style="color: #5384ff;" href="https://www.icegl.cn/tvtstore/resourceManager" target="_blank">资源管理器插件</a>`,
	"version": "2.0.1",
	"author": '地虎降天龙',
	"website": 'https://gitee.com/hawk86104',
	"state": 'active',
	"creatTime": '2024-08-09',
	"updateTime": '2026-09-07',
	"tvtstore": 'FREE',
	"require": [],
	"preview": [
		{
			catalog: { type: 'tool', category: 'resources' },
			src: `
			1、全局预加载所有资源：Resource.loadResources()</br>
			2、loading加载等待页</br>
			3、使用已加载资源：Resource.getItem()</br>`,
			type: 'text', "name": "simpleLoading", "title": "简单加载实例", disableSrcBtn: true
		},
		{
			catalog: { type: 'tool', category: 'resources' },
			src: `
			此实例使用了自定义loader:TQK.QuarksLoader</br>
			只需要增加这行代码：Resource.loaderMapping.QuarksLoader = TQK.QuarksLoader</br>
			详细代码查看插件说明或插件用例</br>`,
			type: 'text', "name": "customLoading", "title": "自定义loader加载实例", disableSrcBtn: true
		},
	]
}