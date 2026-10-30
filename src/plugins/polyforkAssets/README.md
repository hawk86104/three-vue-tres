# Polyfork 模型搜索

在项目预览模式（如 `npm run pre.dev`，启用 `FES_APP_PLUGINS=true`）中打开 `/plugins/polyforkAssets/index`。页面默认搜索 `truck`，支持中文和英文关键词、分类、最大三角面数和分页；中文关键词提交后由 `https://translate.icegl.cn/api/translate` 翻译为英文，再搜索 Polyfork。选择结果后请求资产详情，再加载其中的 `download.glb`。

翻译服务目前允许 `https://opensource.icegl.cn` 和 `http://localhost:8000` 跨域访问；使用其他域名、端口或 `127.0.0.1` 时需确认已加入服务的跨域白名单。翻译失败时可以直接输入英文关键词搜索。

也可以在其他 TvT.js 插件中使用：

```js
import { searchPolyforkAssets, addPolyforkAsset } from 'PLS/polyforkAssets'

const result = await searchPolyforkAssets({ q: 'truck', class: 'vehicle', max_triangles: 5000 })
if (result.assets.length) {
    const { model, asset, animationRoot, animations } = await addPolyforkAsset(
        scene, result.assets[0].id, [0, 0, 0], { maxSize: 3 },
    )
}
```

模型从 Polyfork CDN 直接加载，不需要 API key。加入场景前会根据模型初始包围盒等比例缩放，使最长边默认为 3 个场景单位（可通过 `maxSize` 调整），水平居中并以底部作为放置位置。`model` 是加入场景的组，`animationRoot` 是原始 GLTF 场景，可用作 `AnimationMixer` 的根对象；演示页不自动播放动画。遇到 429 时按 `Retry-After` 暂停请求；若浏览器无法读取该响应头，则等待 60 秒。模型使用须遵守 [Polyfork 许可说明](https://polyfork.dev/licensing)。

Polyfork 对提供给其他用户的选模功能要求使用标识产品的 User-Agent；本演示由浏览器直接请求，使用浏览器默认 User-Agent。对外发布前需向 Polyfork 确认如何满足这一要求。
