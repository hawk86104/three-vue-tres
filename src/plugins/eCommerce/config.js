/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-01-16 08:58:24
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2024-07-30 09:31:45
 */

export default {
    name: 'eCommerce',
    title: '电商场景',
    intro: '关于电商场景下的例子',
    version: '0.0.1',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    preview: [
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/eCommerce/preview/electricFan.webp',
            type: 'img',
            name: 'electricFan',
            title: '电风扇',
            referenceSource: { title: 'AlvaroSaburido', url: 'https://lab.tresjs.org/experiments/product-landing-page' },
        },
        {
            catalog: { type: 'block', category: 'material' },
            src: 'plugins/eCommerce/preview/ssrtGlass.webp',
            type: 'img',
            name: 'ssrtGlass',
            title: '水晶玻璃化',
            referenceSource: { title: 'Domenicobrz', url: 'https://github.com/Domenicobrz/SS-refraction-through-depth-peeling-in-threejs?tab=readme-ov-file' },
        },
        {
            catalog: { type: 'block', category: 'material' },
            src: 'plugins/eCommerce/preview/stencilMask.webp',
            type: 'img',
            name: 'stencilMask',
            title: '多重门',
            referenceSource: { title: 'jaimetorrealba', url: 'https://lab.jaimetorrealba.com/stencilmask_demos' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/eCommerce/preview/sticker.webp',
            type: 'img',
            name: 'sticker',
            title: '镭射塑料袋',
            referenceSource: { title: 'nikuscs', url: 'https://nikuscs.com/crafts/hybridly-sticker-effect/' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/eCommerce/preview/arrangement.webp',
            type: 'img',
            name: 'arrangement',
            title: '桌面陈设',
            referenceSource: { title: 'react-three-fiber', url: 'https://codesandbox.io/s/szj6p7' },
        },
        {
            catalog: { type: 'scene', category: 'product' },
            src: 'plugins/eCommerce/preview/zipTopCan.webp',
            type: 'img',
            name: 'zipTopCan',
            title: '易拉罐',
            referenceSource: { title: 'mohAmineBrs', url: 'https://tympanus.net/Development/TextureTransition/' },
        },
    ],
}
