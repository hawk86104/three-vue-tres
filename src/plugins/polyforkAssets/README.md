# Polyfork 模型搜索

在项目预览模式（如 `npm run pre.dev`，启用 `FES_APP_PLUGINS=true`）中打开 `/plugins/polyforkAssets/index`。页面默认搜索“叉车”，支持中文和英文关键词、分类、最大三角面数和分页；中文关键词提交后由 `https://translate.icegl.cn/api/translate` 翻译为英文，再搜索 Polyfork。选择结果后请求资产详情，再加载其中的 `download.glb`。

模型加载完成后，点击“修改模型”可在新标签页打开编辑器。编辑器读取 Polyfork 的参数描述和模型程序，按模型支持的类型提供颜色、选项、开关和数值控件，并实时重新生成预览。`bool` 和 `number` 分别按开关和数值处理；模型未提供参数或存在不支持的参数类型时，页面会提示。选择颜色预设时会清除该预设涉及的单独参数覆盖，之后仍可分别调整。

“保存配置”将模型 ID 和修改过的参数保存在当前浏览器；再次打开同一模型会恢复配置。也可以导出 JSON，在同一模型的编辑页导入。配置只保存参数，不包含模型文件。编辑器为方便查看而缩放预览，导出的参数和下面的 `createAsset` 不包含预览缩放。

需要在其他场景恢复编辑结果时，可使用导出的配置：

```js
import { loadPolyforkRemix } from 'PLS/polyforkAssets'

// config 是导出的 JSON：{ version, source, assetId, params }
const { createAsset } = await loadPolyforkRemix(config.assetId)
const model = createAsset(config.params)
scene.add(model) // Polyfork 原始坐标和尺寸
```

编辑器按需从 Polyfork CDN 获取并执行模型程序，使用本项目的 Three.js 实例。目前支持模型程序对 `three`、`three/addons/utils/BufferGeometryUtils.js` 和 `three/addons/math/ConvexHull.js` 的导入；如果 Polyfork 新增其他依赖，需在 `lib/remix.js` 中补充。部署时还需要允许从 Polyfork 跨域读取资源，并允许通过 `blob:` 加载模块的内容安全策略。

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
