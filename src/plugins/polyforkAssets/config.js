/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-10-30 10:52:11
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-10-30 12:28:58
 */
export default {
    name: 'polyforkAssets',
    title: 'Polyfork 模型搜索',
    intro: '通过 Polyfork REST API 搜索模型，并直接加载其免费低模 GLB。',
    version: '1.1.0',
    state: 'active',
    creatTime: '2026-10-30',
    updateTime: '2026-10-30',
    require: [],
    preview: [{
        catalog: { type: 'tool', category: 'resources' },
        src: '搜索 Polyfork 模型，选择结果后在三维场景中查看。<a href="https://polyfork.dev" target="_blank" rel="noopener noreferrer">了解更多</a>',
        type: 'text',
        name: 'index',
        title: '搜索并加载模型',
        disableFPSGraph: true,
        disableSrcBtn: false,
    }],
}
