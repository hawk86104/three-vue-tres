# Polyfork 模型搜索

在项目预览模式（如 `npm run pre.dev`，启用 `FES_APP_PLUGINS=true`）中打开 `/plugins/polyforkAssets/index`。页面默认搜索“叉车”，支持中文和英文关键词、分类、最大三角面数和分页；中文关键词提交后由 `https://translate.icegl.cn/api/translate` 翻译为英文，再搜索 Polyfork。选择结果后请求资产详情，再加载其中的 `download.glb`。

模型加载完成后，点击“修改模型”可在新标签页打开编辑器。编辑器读取 Polyfork 的参数描述和模型程序，按模型支持的类型提供颜色、选项、开关和数值控件，并实时重新生成预览。`bool` 和 `number` 分别按开关和数值处理；模型未提供参数或存在不支持的参数类型时，页面会提示。选择颜色预设时会清除该预设涉及的单独参数覆盖，之后仍可分别调整。

编辑器根据模型实际能力显示以下面板：

- **部件 / 骨骼**：按模型声明的关节显示旋转或滑动按钮。点击后部件从当前模型的初始姿态平滑运动至声明的终点，再次点击复位；未指定运动轴或范围时使用 Polyfork 的默认值。可在展开的列表中显示或隐藏命名部件，当前参数下不存在的关节按钮不可用，只有骨骼节点、没有独立对象的部位不能单独隐藏。
- **IK**：支持模型声明的机械臂和腿部 IK。机械臂以模型坐标输入目标点并显示目标与剩余距离；腿部在平地上进行沿直线、循环复位的行走预览。IK 控制的关节与手动关节操作互斥。
- **贴花**：选择模型声明的区域，可先查看示例再上传 SVG 标志；应用后相机自动转向该区域，也可点击“查看位置”。SVG 不超过 256 KB，渐变和透明效果按静态画面显示，动画不会播放；当前每个模型配置保存一个标志和目标区域。不声明贴花区域的模型会显示提示。

`mobile-crane-671d3f` 会显示模型声明的转台、吊臂、支腿和车轮等动作按钮，行为与 [Polyfork 示例](https://polyfork.dev/asset/mobile-crane-671d3f)一致。

“保存配置”将模型 ID、修改过的参数、部件可见性和动作按钮状态、IK 设置及 SVG 贴花保存在当前浏览器；再次打开同一模型会恢复。也可以导出 JSON，在同一模型的编辑页导入。旧版参数和部件、骨骼姿态仍可导入；旧版动画播放设置不再恢复。配置不包含 Polyfork 模型文件。编辑器为方便查看而缩放预览，配置不包含预览缩放。

需要在其他场景恢复编辑结果时，可使用导出的配置：

```js
import { loadPolyforkRemix } from 'PLS/polyforkAssets'

// config 是导出的 JSON：{ version, source, assetId, params, controls }
const { createAsset } = await loadPolyforkRemix(config.assetId)
const model = createAsset(config.params)
scene.add(model) // Polyfork 原始坐标和尺寸；此示例只恢复参数
```

`controls` 中的部件、骨骼、IK 和贴花设置目前由编辑器恢复；其他场景需要自行应用这些设置。编辑器按需从 Polyfork CDN 获取并执行模型及官方辅助程序，使用本项目的 Three.js 实例。目前支持模型程序对 `three`、`three/addons/utils/BufferGeometryUtils.js`、`three/addons/math/ConvexHull.js` 和 `three/addons/geometries/DecalGeometry.js` 的导入；如果 Polyfork 新增其他依赖，需在 `lib/remix.js` 中补充。部署时需要允许从 Polyfork 跨域读取资源，以及内容安全策略中的 `script-src blob:` 和 `img-src blob:`。

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
