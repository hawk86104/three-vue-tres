/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-09 16:11:43
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-07-10 16:35:01
 */
export default {
    name: 'tvtMqtt',
    title: '接入mtqq最佳实践',
    intro: '接入mtqq，实现mqtt协议和三维场景的交互，包含:mqttTvt.js封装类。调试面板，以及和模型交互的示例。',
    version: '1.0.0',
    author: '地虎降天龙',
    website: 'https://gitee.com/hawk86104',
    state: 'active',
    require: [],
    creatTime: '2025-07-09',
    updateTime: '2025-07-09',
    preview: [
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/tvtMqtt/preview/index.png',
            type: 'img',
            name: 'index',
            title: 'MQTT调试面板',
            disableFPSGraph: true,
            disableSrcBtn: false,
        },
        {
            catalog: { type: 'tool', category: 'integration' },
            src: 'plugins/tvtMqtt/preview/withModel.png',
            type: 'img',
            name: 'withModel',
            title: 'MQTT与模型交互',
            disableFPSGraph: false,
            disableSrcBtn: false,
        },
    ],
}
