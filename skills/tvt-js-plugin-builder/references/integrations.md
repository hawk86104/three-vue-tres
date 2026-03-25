# 集成约束

## qiankun

本地实现里和 qiankun 直接相关的点：

- `.fes.js` 开启 qiankun 微前端模式
- `src/app.jsx` 会判断 `qiankunWindow.__POWERED_BY_QIANKUN__`
- `src/app.jsx` 会读取并暴露 `__INJECTED_PUBLIC_PATH_BY_QIANKUN__`
- `src/app.jsx` 暴露 qiankun 生命周期钩子
- `src/app.jsx` 通过 `onGlobalStateChange` 接收宿主全局状态

当你在改面向 qiankun 的场景时：

- 避免默认全屏假设
- 避免不必要的全局副作用
- 优先使用容器感知的尺寸方案
- 与宿主通信时保持接口显式

## uni-app 与小程序 WebView

本地实现里和 uni-app 相关的点：

- `src/plugins/uniAppView/lib/initScript.js` 会加载桥接脚本
- `src/components/forPreview/cardList.vue` 已经包含适配小程序环境的跳转逻辑
- 本地预览跳转会根据容器检测，在 `window.open` 和 `uni.navigateTo` 之间切换

当页面需要跑在 uni-app 或小程序 WebView 里：

- 路由路径要稳定
- 浏览器专属 API 要做防护
- 数据交换优先显式桥接或消息机制
- 除非页面明确只给桌面端用，否则不要写死桌面交互假设

## zone3Deditor

把 `zone3Deditor` 当成特殊集成目标，而不是普通开源页面插件：

- 仓库里有 `src/plugins/zone3Deditor/config.js`
- 仓库里有预览资源
- 仓库里没有完整的 `src/plugins/zone3Deditor/pages` 编辑器源码
- 它的 preview 条目是远程 `url` 驱动的

当请求涉及 zone-editor 导出或复用：

- 优先组件化和配置驱动的场景结构
- 资源路径保持稳定
- 避免未声明的跨插件耦合
- 明确说明结果只是普通 TvT.js 页面，还是需要继续保持编辑器导出友好

## GoView

GoView 相关工作常常横跨插件和集成边界：

- `goView` 同时包含外链预览项和本地路由案例
- `.fes.js` 会把 GoView 共享 SCSS 注入到 `goView` 和 `zone3Deditor`
- GoView 的导入导出更适合保持配置驱动，而不是把结构硬编码到页面内部

当你在处理 GoView 风格场景时：

- 保持配置导入模式
- 保持与现有 SCSS 注入行为兼容
- 避免破坏外部 UI 组合方式的假设
