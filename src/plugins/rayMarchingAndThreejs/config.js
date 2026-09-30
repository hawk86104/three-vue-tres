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
        { catalog: { type: 'block', category: 'rendering' }, src: 'plugins/rayMarchingAndThreejs/preview/光追基础框架.png', type: 'img', name: 'rayMarchingBasic', title: '光追基础框架' },
        { catalog: { type: 'block', category: 'rendering' }, src: 'plugins/rayMarchingAndThreejs/preview/位置变换.png', type: 'img', name: 'rayMarchingTranform', title: '光追基础变换' },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/多个sdf.png', type: 'img', name: 'rayMarchingCombination', title: '光追创建多个实体',
            referenceSource: { title: 'Inigo Quilez  ', url: 'https://iquilezles.org/articles/distfunctions/' }
        },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/创建复杂几何体.png', type: 'img', name: 'rayMarchingFract', title: '光追创建复杂几何体',
        },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/颜色赋值.png', type: 'img', name: 'rayMarchingColor', title: '颜色赋值',
        },
        {
            catalog: { type: 'block', category: 'rendering' },
            src: 'plugins/rayMarchingAndThreejs/preview/蘑菇.png', type: 'img', name: 'rayMarchingMushroom', title: '光追构建蘑菇',
            referenceSource: { title: 'XsBSzh', url: 'https://www.shadertoy.com/view/XsBSzh' }
        },
        { catalog: { type: 'block', category: 'rendering' }, src: 'plugins/rayMarchingAndThreejs/preview/综合案例1.png', type: 'img', name: 'rayMarchingVIew', title: '光追构建复杂体' },
    ],
};
