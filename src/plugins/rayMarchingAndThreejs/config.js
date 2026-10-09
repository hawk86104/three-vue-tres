export default {
    name: 'rayMarchingAndThreejs',
    title: '基于Threejs的光线行进',
    intro: 'Threejs框架下的光线行进的应用案例',
    version: '0.0.1',
    author: 'Jsonco',
    website: "https://space.bilibili.com/410503457",
    state: 'active',
    "creatTime": "2024-02-22",
    "updateTime": "2024-03-10",
    require: [],
    preview: [
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/创建复杂几何体.webp', type: 'img', name: 'rayMarchingFract', title: '光追创建复杂几何体',
        },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/颜色赋值.webp', type: 'img', name: 'rayMarchingColor', title: '颜色赋值',
        },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/蘑菇.webp', type: 'img', name: 'rayMarchingMushroom', title: '光追构建蘑菇',
            referenceSource: { title: 'XsBSzh', url: 'https://www.shadertoy.com/view/XsBSzh' }
        },
        { catalog: { type: 'block', category: 'rendering' }, src: 'plugins/rayMarchingAndThreejs/preview/综合案例1.webp', type: 'img', name: 'rayMarchingVIew', title: '光追构建复杂体' },
    ],
};
