# 蔚蓝之境：海洋与天气

水插件案例，页面路由为 `/plugins/water/oceanWeather`。场景移植自本地
`vue3-threejs-master` 的 `?scene=ocean`，未包含该项目的其他场景。

场景使用 TresCanvas、OrbitControls 和 Tres 渲染循环；频谱海浪、平面反射、
折射、水下光照与体积云保留原场景的独立渲染通道。相机模式、天气预设、
时间、风速、画质和像素倍率都可在页面中调整；数字键 1–3 切换视角，
W/A/S/D 控制漫游或航行，Q/E 升降，H 收起面板，空格暂停。

模型、贴图、大气数据和 Draco 解码器位于
`public/plugins/water/oceanWeather/`，资源路径由 `assets.ts` 统一处理。
海底重复的礁石、海草和海藻采用实例化，鱼群保留各自的骨骼动画。

原场景使用的 Takram 云和大气模块位于 `vendor/`，复用项目现有的 Three.js
和 postprocessing，不修改项目依赖。模型来源与许可证情况见资源目录下的
`ATTRIBUTION.md`；其中部分参考模型的再分发许可尚未核实。
