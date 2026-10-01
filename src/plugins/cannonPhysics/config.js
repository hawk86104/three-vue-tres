/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-12-30 11:15:55
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-01-02 13:58:17
 */
export default {
    name: 'cannonPhysics',
    title: 'Cannon物理引擎',
    intro: `各种基于Cannon.js物理引擎的例子<br>
    详细文档请查看：<a style="color: #5384ff;" href="https://pmndrs.github.io/cannon-es/" target="_blank">cannon-es</a>`,
    version: '1.0.0',
    author: '地虎降天龙',
    website: 'www.icegl.cn',
    state: 'active',
    creatTime: '2024-12-30',
    updateTime: '2024-12-30',
    require: [],
    preview: [
        {
            catalog: { type: 'block', category: 'physics' },
            src: 'plugins/cannonPhysics/preview/theBasic.webp',
            type: 'img',
            name: 'theBasic',
            title: '基础实例',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
        {
            catalog: { type: 'block', category: 'physics' },
            src: 'plugins/cannonPhysics/preview/terrainBalls.webp',
            type: 'img',
            name: 'terrainBalls',
            title: '地形球',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
    ],
}
