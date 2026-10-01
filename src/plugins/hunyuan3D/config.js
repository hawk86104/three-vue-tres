/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-28 15:11:28
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-07-29 17:46:06
 */
export default {
    name: 'hunyuan3D',
    title: '结合混元3D图生模型',
    intro: `使用最新的腾迅混元3D图生模型，从图像中生成3D模型，本地部署，AI模型开源，本实践案例也同样开源，可下载模型，也可自动导入tvt.js三维场景中。</br>
    Hunyuan3D-2代码 github地址：<a style="color:#5384ff;" href="https://github.com/Tencent-Hunyuan/Hunyuan3D-2" target="_blank">github.com/Tencent-Hunyuan/Hunyuan3D-2</a></br>
    Hunyuan3D-2模型 huggingface地址：<a style="color:#5384ff;" href="https://huggingface.co/tencent/Hunyuan3D-2" target="_blank">huggingface.co/tencent/Hunyuan3D-2</a></br>
    本地使用说明文档：<a style="color:#5384ff;" href="https://icegl.cn/ask/article/22765.html" target="_blank">icegl.cn/ask/article/22765</a></br>`,
    version: '1.0.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    creatTime: '2025-07-28',
    updateTime: '2025-07-28',
    require: [],
    preview: [
        {
            catalog: { type: 'tool', category: 'ai' },
            src: 'plugins/hunyuan3D/preview/index.webp',
            type: 'img',
            name: 'index',
            title: '导入混元模型',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
    ],
}
