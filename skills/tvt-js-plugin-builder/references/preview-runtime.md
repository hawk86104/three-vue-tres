# 预览中心与运行时

## 预览中心分类

`src/plugins/preview.vue` 当前按下面规则分类：

- `basic` -> 基础功能分组区
- `tvtstore` 未声明 -> `caseCenter`
- `tvtstore` 已声明且插件名以 `zone` 开头 -> `zoneEditor`
- `tvtstore` 已声明且插件名不以 `zone` 开头 -> `Tvtstore`

计数方式：

- `basic` 汇总所有 `child[].preview.length`
- 其他分类使用顶层 `preview.length`

## 两条不同的线上数据链路

不要把下面两条远程链路混为一谈：

1. `menuSetup`
   - 从 `src/app.jsx` 触发
   - 开发环境下 `FES_APP_PLUGINS=true` 时执行，或显式开启 `FES_APP_ONLINE_API` 时执行
   - 作用是徽标、筛选、编辑器标记等标签型元数据

2. `getOnlinePluginConfig()`
   - 从 `src/plugins/preview.vue` 触发
   - 只在开发环境且未设置 `FES_APP_PLSNAME` 时执行，或显式开启 `FES_APP_ONLINE_API` 时执行
   - 作用是把线上发布菜单补充合并到本地预览配置

## 线上菜单合并规则

`getOnlinePluginConfig()` 的范围是收敛过的：

- 跳过 `basic`
- 跳过已声明 `tvtstore` 的插件
- 始终以本地配置为事实源
- 仅给已有本地插件追加缺失的预览项
- 只有本地不存在该插件时，才整项补进来
- 线上新增的条目会标记 `waitForGit`

这意味着插件市场和区域编辑器条目即使线上存在数据，也仍以本地配置为准。

## 预览卡片行为

行为由 `cardList.vue`、`oneImageQr.vue`、`suspenseLayout.vue` 共同决定：

- `type: img` -> 图片卡片
- `type: text` -> 文本卡片
- `type: video` -> 视频卡片
- 有 `url` -> 直接跳转到声明目标
- 没有 `url` -> 跳本地 `/plugins/...` 路由
- `disableFPSGraph` -> 在路由预览页隐藏 FPS 面板
- `disableSrcBtn` -> 在路由预览页隐藏源码按钮
- `referenceSource` -> 在路由预览页显示参考出处

## 二维码与外链预览

`oneImageQr.vue` 只有在具备线上 API 相关行为时才会显示二维码浮层。

需要注意：

- 某些外链 `url` 会刻意跳过二维码预览，例如插件市场和 bilibili 链接
- 即便是 `url` 型条目，也仍然需要稳定的 `name`
- 远程 `https://...` 预览图是合法用法

## 搜索、哈希与筛选

这些交互要视为正式行为，不是偶然实现：

- 左侧菜单点击后滚动到对应分区
- 路由 hash 会同步更新
- 页面初始化时会根据 hash 定位
- 关键字搜索会筛选插件标题和预览标题或名称
- 复选筛选来源于 `menuSetup`
- `editor` 标签主要改变卡片侧的行为，不会重写插件结构本身
