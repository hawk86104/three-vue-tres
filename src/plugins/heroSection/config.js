/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-05-07 17:15:49
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-05-07 18:37:13
 */
export default {
    "name": "heroSection",
    "title": "概念网站 HeroSection",
    "intro": "Hero Section是网站的首页顶部区域，通常包含吸引人的图片、标题和简短的描述，用来吸引访问者的注意并引导他们进一步浏览网站内容。这个区域通常是网站最显眼和重要的部分，通过精心设计和内容选择，可以吸引访问者的兴趣，提升用户体验和网站的吸引力。",
    "version": "1.0.1",
    "author": "何贤",
    "website": "站点地址",
    "state": "https://github.com/hexianWeb",
    "creatTime": "2025-02-13",
    "updateTime": "2025-02-13",
    "require": [],
    "preview": [{
        catalog: { type: 'scene', category: 'art' },
        "src": "plugins/heroSection/preview/earthMap.webp",
        "type": "img",
        "name": "earthMap",
        "title": "现代 UI 设计官网",
        disableFPSGraph: false,
        disableSrcBtn: false
    },
    { catalog: { type: 'scene', category: 'art' }, src: 'plugins/heroSection/preview/pointsEarth.webp', type: 'img', name: 'pointsEarth', title: '粒子球' },
    {
        catalog: { type: 'scene', category: 'art' },
        src: 'plugins/heroSection/preview/particleEarth.webp', type: 'img', name: 'particleEarth', title: '粒子地球',
        referenceSource: { title: 'tsl-scifi-earth', url: 'https://github.com/hexianWeb/tsl-scifi-earth' },
    },
    ]
}
