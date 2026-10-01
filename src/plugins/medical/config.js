/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-10 16:11:27
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-07 16:52:03
 */

export default {
    name: 'medical',
    title: '医疗行业',
    intro: '医疗行业数字化例子',
    version: '1.0.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    preview: [
        {
            catalog: { type: 'scene', category: 'medical' },
            src: 'plugins/medical/preview/brainStorm.webp',
            type: 'img',
            name: 'brainStorm',
            title: '头脑风暴',
            referenceSource: { title: 'SahilK-Brain', url: 'https://github.com/SahilK-027/Digital-Brain' },
        },
        { catalog: { type: 'scene', category: 'medical' }, src: 'plugins/medical/preview/digitalBrain.webp', type: 'img', name: 'digitalBrain', title: '数字大脑' },
        { catalog: { type: 'scene', category: 'medical' }, src: 'plugins/medical/preview/digitalBrainFloor.webp', type: 'img', name: 'digitalBrainFloor', title: '数字大脑镜面' },
        {
            catalog: { type: 'scene', category: 'medical' },
            src: 'plugins/medical/preview/yuriBrain.webp',
            type: 'img',
            name: 'yuriBrain',
            title: "Yuri's大脑",
            referenceSource: { title: 'Yuri Artiukh', url: 'https://www.youtube.com/watch?v=OCjwL5QbiMg' },
        },
    ],
}
