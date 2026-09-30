/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-05-06 15:56:52
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-01-08 10:51:17
 */
export default {
    name: 'digitalPark',
    title: '数字园区',
    intro: '基于园区场景的可视化展示插件',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2024-05-06',
    updateTime: '2024-05-06',
    require: ['resourceManager'],
    preview: [
        { catalog: { type: 'scene', category: 'industry' }, src: 'plugins/digitalPark/preview/simplePark.png', type: 'img', name: 'simplePark', title: '简单园区' },
        { catalog: { type: 'scene', category: 'industry' }, src: 'plugins/digitalPark/innovationHubAr/images/poster.webp', type: 'img', name: 'innovationHubAr', title: 'Innovation Hub AR' },
    ],
}
