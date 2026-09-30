# TvT.js 预览目录迁移

一级为内容类型，二级为能力或行业，小案例以卡片展示。插件目录、依赖、演示路径和预览资源不因分类调整而迁移。

## 配置约定

- 本地每个 `preview` 使用 `catalog: { type, category }` 明确分类。
- 类型：`block`、`scene`、`application`、`tool`；分类键及中文标题见 `src/components/forPreview/catalog.js`。
- 元数据优先级：案例 catalog → 子目录 catalog → 插件 catalog → 线上兼容配置。
- 线上兼容配置见 `src/components/forPreview/remoteCatalog.js`；未知内容进入“待分类”，不按名称前缀或 tvtstore 猜分类。
- `tvtstore` 仅表示分发属性；热、新、荐、编辑器来自既有状态接口，可与搜索叠加筛选。
- 可选 `catalog.tags` 参与搜索；`sourceUrl`、`promptUrl`、`studioUrl` 仅在实际配置时提供对应入口。源码按钮还遵守 `disableSrcBtn`，默认仅显示存在的本地页面。
- 左侧计数随搜索、状态筛选更新；点击分类后右侧仅展示该分类的匹配卡片。
- 原 `#插件名`、`#basic子目录` 链接进入该来源的首个分类；新链接使用 `#类型/分类`。

## 分类结果

2026-09-29 本地 271 项，线上补充 91 项。线上归类以当前配置中的标题、简介和入口为依据，未对商业应用业务流程进行运行验证。

| 一级目录 | 数量 |
| --- | ---: |
| Blocks 基础能力 | 239 |
| Scenes 场景案例 | 67 |
| Applications 行业应用 | 25 |
| Tools 创作与工程 | 31 |

## 逐项迁移表

| 来源 / 案例 | 名称 | 新目录 |
| --- | --- | --- |
| tvtViewHelper/index | 最佳实践 | Blocks 基础能力 / 基础与交互 |
| basic/base/shapesPage | 图形合集组件 | Blocks 基础能力 / 基础与交互 |
| basic/controls/playerControls | 玩家控制器 | Blocks 基础能力 / 基础与交互 |
| industry4/planeClipping | 飞机剖面 | Blocks 基础能力 / 基础与交互 |
| industry4/collectTriangles | 喷漆收集三角形 | Blocks 基础能力 / 基础与交互 |
| operationTool/explode | 炸开与还原 | Blocks 基础能力 / 基础与交互 |
| operationTool/frameSelect | 框选实例 | Blocks 基础能力 / 基础与交互 |
| operationTool/drawArrows | 绘制箭头 | Blocks 基础能力 / 基础与交互 |
| operationTool/navigation | 导航 | Blocks 基础能力 / 基础与交互 |
| useViewportGizmo/index | 调用示例 | Blocks 基础能力 / 基础与交互 |
| basic/materials/physicalDiffractionGrating | 物理衍射光栅 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/raytracedDiamond | BVH光追钻石 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/transmissionMaterial | 玻璃材质2 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/solidClippingMaterial | 裁剪材质补色 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/layerMaterial | 图层材质 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/outline | outline | Blocks 基础能力 / 材质与 Shader |
| basic/materials/clearcoat | 反光漆图层 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/liquidMetal | 液态金属 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/jumpingBlockMaterial | 跳动块动画材质 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/instancedMeshCustomShaderMaterial | instanced和继承材质 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/vertexSnapping | 顶点捕捉材质 | Blocks 基础能力 / 材质与 Shader |
| basic/materials/materialSelector | 多材质切换组件 | Blocks 基础能力 / 材质与 Shader |
| eCommerce/ssrtGlass | 水晶玻璃化 | Blocks 基础能力 / 材质与 Shader |
| eCommerce/stencilMask | 多重门 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/argestCircle | 细胞 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/shadertoyMaterial | shadertoyMaterial | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/noiseContourPage | 噪音轮廓 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/lightning | 闪电 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/tunnel | 隧道 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/superTunnel | 超级隧道 | Blocks 基础能力 / 材质与 Shader |
| shadertoyToThreejs/superPipeline | 超级管道 | Blocks 基础能力 / 材质与 Shader |
| tsl/basicTsl | 最基本的TSL应用 | Blocks 基础能力 / 材质与 Shader |
| tsl/tsg-case-1 | TSG案例1 - 物体随相机变化 | Blocks 基础能力 / 材质与 Shader |
| tsl/tsg-case-2 | TSG案例2 - 参数控制 | Blocks 基础能力 / 材质与 Shader |
| tsl/tsg-case-3 | TSG案例3 - 故障效果 | Blocks 基础能力 / 材质与 Shader |
| tsl/tsg-case-4 | TSG案例4 - 溶解效果 | Blocks 基础能力 / 材质与 Shader |
| visualArts/voxelizedShader | 物体体素化 | Blocks 基础能力 / 材质与 Shader |
| basic/shine/shader | 着色器方式 | Blocks 基础能力 / 光影与后处理 |
| basic/shine/geometricGlow | geometric缩放 | Blocks 基础能力 / 光影与后处理 |
| basic/shine/fakeGlow | FakeGlow | Blocks 基础能力 / 光影与后处理 |
| basic/shine/effectComposerShaderPass | 后期处理-图层+ShaderPass | Blocks 基础能力 / 光影与后处理 |
| basic/tresProcessing/fusion | 融合多个后期效果 | Blocks 基础能力 / 光影与后处理 |
| basic/tresProcessing/outlinePass | 外边框处理 | Blocks 基础能力 / 光影与后处理 |
| digitalCity/buildingsPassA | 建筑物后期A | Blocks 基础能力 / 光影与后处理 |
| industry4/deviceLight | 设备发光 | Blocks 基础能力 / 光影与后处理 |
| postProcessing/webglFrameBuffer | WebGL帧缓冲DEMO | Blocks 基础能力 / 光影与后处理 |
| postProcessing/webglPostProcessing | WebGL后处理DEMO | Blocks 基础能力 / 光影与后处理 |
| projectionShadow/accumulativeShadows | 软阴影 | Blocks 基础能力 / 光影与后处理 |
| projectionShadow/causticsDemo | 投射 | Blocks 基础能力 / 光影与后处理 |
| visualArts/volumetricLightGodray | 电影体积光 | Blocks 基础能力 / 光影与后处理 |
| digitalMapBlock/particlesTextureEnv | 粒子垂直飞环境 | Blocks 基础能力 / 特效与动画 |
| digitalMapBlock/flyLines | 飞线门 | Blocks 基础能力 / 特效与动画 |
| digitalMapBlock/spaceLines | 间隔线 | Blocks 基础能力 / 特效与动画 |
| flameFires/flameFireComponent | 大型横向喷火 | Blocks 基础能力 / 特效与动画 |
| flameFires/flame4RealComponent | 仿真火焰B | Blocks 基础能力 / 特效与动画 |
| basic/base/shaderParticles | 着色器实践 | Blocks 基础能力 / 特效与动画 |
| digitalCity/radars | 雷达 | Blocks 基础能力 / 特效与动画 |
| digitalCity/diffuseCircle | 扩散圈球 | Blocks 基础能力 / 特效与动画 |
| digitalCity/depthBufferDiffuse | 带深度的半球扩散 | Blocks 基础能力 / 特效与动画 |
| digitalCity/weather | 天气 | Blocks 基础能力 / 特效与动画 |
| digitalCity/lightningStorm | 闪电 | Blocks 基础能力 / 特效与动画 |
| digitalCity/stylizedTornado | 漫画龙卷风 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fog | 迷雾 | Blocks 基础能力 / 特效与动画 |
| digitalCity/smoke | 烟 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireA | 火A🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireB | 火B🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireC | 火C🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireD | 火D🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireE | 火E🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireF | 火F🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/volumetricFluidFire | WebGPU体积流体火焰 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fireBall | 火球🔥效果 | Blocks 基础能力 / 特效与动画 |
| digitalCity/buildingsEffectA | 建筑物效果A | Blocks 基础能力 / 特效与动画 |
| digitalCity/roadLines | 道路飞线 | Blocks 基础能力 / 特效与动画 |
| digitalCity/flyLines | 飞线 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fence | 围栏 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fencePlusPage | 高级围栏 | Blocks 基础能力 / 特效与动画 |
| digitalCity/fenceWave | 波浪围栏 | Blocks 基础能力 / 特效与动画 |
| digitalCity/regionGlow | 区域内发光 | Blocks 基础能力 / 特效与动画 |
| digitalCity/rectangleGlowPage | 矩形渐变区域 | Blocks 基础能力 / 特效与动画 |
| digitalCity/particleFirefly | 粒子萤火虫 | Blocks 基础能力 / 特效与动画 |
| earthSample/pointsScan | 点扫描 | Blocks 基础能力 / 特效与动画 |
| earthSample/highlightScan | 高光扫描 | Blocks 基础能力 / 特效与动画 |
| floor/circleWave | 花纹圈动画 | Blocks 基础能力 / 特效与动画 |
| floor/cartoonMagicZone | 卡通能量圈 | Blocks 基础能力 / 特效与动画 |
| floor/lineMagicZone | 线条能量圈 | Blocks 基础能力 / 特效与动画 |
| floor/particleBasePage | 粒子底座 | Blocks 基础能力 / 特效与动画 |
| floor/ribbonArrowPage | 滚动箭头组件 | Blocks 基础能力 / 特效与动画 |
| industry4/dissolveEffect | 溶解特效 | Blocks 基础能力 / 特效与动画 |
| industry4/dissolveEffectPlus | 高级溶解特效 | Blocks 基础能力 / 特效与动画 |
| industry4/flexiblePipePage | 伸缩管线 | Blocks 基础能力 / 特效与动画 |
| industry4/flexiblePipe2Page | 伸缩管线2 | Blocks 基础能力 / 特效与动画 |
| industry4/tslGearsForkedPage | TSL齿轮分叉 | Blocks 基础能力 / 特效与动画 |
| visualArts/windLine | 流动风线 | Blocks 基础能力 / 特效与动画 |
| visualArts/bubble | 泡泡 | Blocks 基础能力 / 特效与动画 |
| visualArts/repulsionEffect | 排斥效果 | Blocks 基础能力 / 特效与动画 |
| visualArts/lightNoise | 光噪声 | Blocks 基础能力 / 特效与动画 |
| visualArts/fragmentModel | 碎片模型 | Blocks 基础能力 / 特效与动画 |
| visualArts/revealEffect | 揭露动画效果 | Blocks 基础能力 / 特效与动画 |
| visualArts/imgParticle | 图片粒子化 | Blocks 基础能力 / 特效与动画 |
| digitalMapBlock/cubeAnnotationHtml | 立方体标注Html | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalMapBlock/cubeAnnotationMeshUI | 立方体标注MeshUI | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showStackedBar | 层叠柱状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showPie | 饼状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showColumn | 柱状融合图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showArrowColumn | 箭头柱状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showRingColumn | 圆环状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showColumnar | 一列排柱状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showMultipleBar | 多条柱状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showSingleArea | 单个区域状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| tvtCharts/showMultipleArea | 多个区域状图 | Blocks 基础能力 / UI / 标注 / 图表 |
| basic/htmls/component3UI | 引用UI组件 | Blocks 基础能力 / UI / 标注 / 图表 |
| basic/htmls/websiteReflector | 网页电脑+镜面 | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalCity/heatmap | 热力图 | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalCity/heatmap2 | 建筑物-热力图 | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalCity/buildingsMarkA | 建筑物标记A | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalCity/coneAnchorA | 浮锚标识A | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalCity/coneAnchorB | 浮锚标识B | Blocks 基础能力 / UI / 标注 / 图表 |
| goView/goViewComPage | 配置组件化 | Blocks 基础能力 / UI / 标注 / 图表 |
| heatMap/simpleExample | 简单例子 | Blocks 基础能力 / UI / 标注 / 图表 |
| heatMap/heatmapExample | heatmap.js例子 | Blocks 基础能力 / UI / 标注 / 图表 |
| heatMap/heatmapClick | heatmap鼠标点击 | Blocks 基础能力 / UI / 标注 / 图表 |
| operationTool/tagging | 几何体标注 | Blocks 基础能力 / UI / 标注 / 图表 |
| operationTool/legend | 动态图例（高级版本支持后处理效果，可定制开发） | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/divIllustrate | DIV说明样例 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/echartSample | Echart表格样例 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/sizeMark | 尺寸样式 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/scrollPartical | 滚动粒子 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/loadingManagerStyle | 资源加载器Loading | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/threeMeshUIstyle | MeshUI简单样式 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/bannerLabel | 精灵图文字 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/domPanelPage | dom面板 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/spriteImgPage | 精灵图片 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/svgComPage | svg组件 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/line2RoundedRectPage | 矩形线边框 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/lineArrowPage | 箭头线组件 | Blocks 基础能力 / UI / 标注 / 图表 |
| UIdemo/generalFontPage | 标准三维字体组件 | Blocks 基础能力 / UI / 标注 / 图表 |
| digitalMapBlock/baseFloorA | 底座A | Blocks 基础能力 / 环境 / 地面 / 水体 |
| digitalMapBlock/baseFloorB | 底座B | Blocks 基础能力 / 环境 / 地面 / 水体 |
| digitalCity/wetPuddleRain | 雨天地面积水 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| digitalCity/clouds | 云☁️ | Blocks 基础能力 / 环境 / 地面 / 水体 |
| digitalCity/clouds2 | 云彩2☁️ | Blocks 基础能力 / 环境 / 地面 / 水体 |
| digitalCity/cityRiver | 城市河流 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/rippleFloor | 波纹地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/mechaFloor | 机甲地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/hexagonalWall | 六面柱地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/rubberTilesPage | 橡胶地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/simpleReflector | 简单镜面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/meshReflectionFloor | 通用镜面地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/reflectorShader | 镜面材质着色器 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/reflectorDiffuse | fiber镜面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/reflectorDUDV | dudv镜面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/reflectorRoundedBoxPage | RoundedBox镜面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/showFloor | 地板模型拼接+镜面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/videoFloor | video动态底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/imgFloor | 图片动态底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/canvasFloor | canvas动态底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/digitalGround | 数字动态底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/hexGridGround | 网格动态底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/whiteFloor | 白色边缘模糊 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/gridPlus | 网格扩展 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/gridFloor | 网格地板 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/grass | 草地 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/topoBasePage | 拓扑底座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/hexagonalFloorPage | 六面地板组件化 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| floor/dynamicRotatingBase | 动态旋转基座 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxA | 单张:矩形图:着色器渲染 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxD | 单张:矩形图:scene:env/background | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxB | 单张:HDR渲染:着色器渲染 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxC | 单张:HDR渲染:scene:env/background | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxE | 多张:矩形图:scene:env/background | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/skyBoxF | 多张:HDR渲染:scene:env/background | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/newEnvironment | 移植R3F的Environment | Blocks 基础能力 / 环境 / 地面 / 水体 |
| skyBox/basiceEnvPage | 基础版环境贴图 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/spectralCascadeOcean | 频谱级联海洋 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/stylizedAboveBelowOcean | 风格化水上/水下海洋 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/submergedSnellOcean | 水下斯涅尔海洋 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/staticWaterPage | 静态水 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/tilingCaustics | 波纹A | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/waterGlass | 波浪B | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/waveC | 波浪C | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/threeExampleOcean | three例子-海洋 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/customWater | 自定义水 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/realWater | 真实水 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/iceFloor | 冰面 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| water/gerstnerWaterPage | 海洋波浪组件 | Blocks 基础能力 / 环境 / 地面 / 水体 |
| singleLayerEarth/index | 单层地球基础用法 | Blocks 基础能力 / GIS / 空间能力 |
| useThreeGeospatial/atmosphere | 大气层 | Blocks 基础能力 / GIS / 空间能力 |
| useThreeGeospatial/clouds | 叠加云层 | Blocks 基础能力 / GIS / 空间能力 |
| useThreeGeospatial/tilesAtmosphere | 倾斜摄影+大气层 | Blocks 基础能力 / GIS / 空间能力 |
| AMapGIS/cubeMesh | 正方体实例 | Blocks 基础能力 / GIS / 空间能力 |
| AMapGIS/buildings | 建筑物 | Blocks 基础能力 / GIS / 空间能力 |
| digitalCity/buildings | 建筑物 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-base | 干净的模板 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-3dtiles | 加载3dtiles与控制视点 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-icon | 图标组件与文字组件 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-particle-icon | 海量图标与点击交互 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-css2d | css2d组件 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-position | 位置组件与3d模型的复合使用 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-flyline | 飞线组件的详细示例 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-line | 线组件的详细示例 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-building | 建筑组件 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-face | 多边形面与围墙组件 | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-tres-canvas | 使用原始TresCanvas搭配geokit | Blocks 基础能力 / GIS / 空间能力 |
| geokit/case-tvt-3dtilesBuildings | 加载tvt建筑白膜组件 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/streamLines | 流光线展示 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/tileMap | 地图瓦片展示 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/renderer3DTiles | 3DTiles展示 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/obliquePhotoPage | 倾斜摄影组件化 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/3DTilesComPage | 3DTiles组件化 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/cesiumIon | cesiumIon倾斜摄影 | Blocks 基础能力 / GIS / 空间能力 |
| simpleGIS/threeTileEx | threeTile使用实例 | Blocks 基础能力 / GIS / 空间能力 |
| tvtVolumeRendering/rawDataPre | rawData预览 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/rawDataZip | rawData压缩Zip例子 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/rawDataImg | rawData转图片例子 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/rawDataSurfaceSection | 基于rawData的面剖 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/nrrdPre | nrrd预览 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/nrrdOrthographicCamera | nrrd文件正交相机 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/nrrdSurfaceSection | 基于nrrd的面剖 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/earthJson | 读取json文件示例 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/ncFile | nc气象文件以及面剖 | Blocks 基础能力 / 模型 / 渲染 |
| tvtVolumeRendering/debugNcFile | 调试nc文件气象通用色例 | Blocks 基础能力 / 模型 / 渲染 |
| metaHuman/panePage | metaHuman | Blocks 基础能力 / 模型 / 渲染 |
| gaussianSplatting/plyPage | 点云实例 | Blocks 基础能力 / 模型 / 渲染 |
| gaussianSplatting/splatPage | splat组件 | Blocks 基础能力 / 模型 / 渲染 |
| gaussianSplatting/gs3DcomPage | 通用格式的高斯 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingBasic | 光追基础框架 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingTranform | 光追基础变换 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingCombination | 光追创建多个实体 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingFract | 光追创建复杂几何体 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingColor | 颜色赋值 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingMushroom | 光追构建蘑菇 | Blocks 基础能力 / 模型 / 渲染 |
| rayMarchingAndThreejs/rayMarchingVIew | 光追构建复杂体 | Blocks 基础能力 / 模型 / 渲染 |
| volumeRendering/basicVolume | 基础体积渲染 | Blocks 基础能力 / 模型 / 渲染 |
| cannonPhysics/theBasic | 基础实例 | Blocks 基础能力 / 物理 / XR |
| cannonPhysics/terrainBalls | 地形球 | Blocks 基础能力 / 物理 / XR |
| webxr/theBasic | 简单实例 | Blocks 基础能力 / 物理 / XR |
| webxr/ballShooter | 小球射击 | Blocks 基础能力 / 物理 / XR |
| webxr/interactiveBtns | UI交互 | Blocks 基础能力 / 物理 / XR |
| digitalMapBlock/mapShowHtml | 地图展示Html | Scenes 场景案例 / 城市 / GIS |
| digitalMapBlock/mapShowMeshUI | 地图展示MeshUI | Scenes 场景案例 / 城市 / GIS |
| digitalMapBlock/scenarioA | 融合场景A | Scenes 场景案例 / 城市 / GIS |
| digitalMapBlock/scenarioB | 融合场景B | Scenes 场景案例 / 城市 / GIS |
| tvtVolumeRendering/earthTemperature | 雷达温度展示 | Scenes 场景案例 / 城市 / GIS |
| tvtVolumeRendering/earthNcFile | nc文件结合地图展示 | Scenes 场景案例 / 城市 / GIS |
| indoorMap/buildsShow | 建筑物展示 | Scenes 场景案例 / 城市 / GIS |
| indoorMap/buildsGis | 建筑物结合地图 | Scenes 场景案例 / 城市 / GIS |
| indoorMap/oneFloor | 一层商户展示 | Scenes 场景案例 / 城市 / GIS |
| indoorMap/allFloor | 多层商户展示 | Scenes 场景案例 / 城市 / GIS |
| gisPlaneEditor/sceneConfig1 | 多套倾斜摄影3D | Scenes 场景案例 / 城市 / GIS |
| gisPlaneEditor/sceneConfig2 | 南京黑金漂亮地图 | Scenes 场景案例 / 城市 / GIS |
| digitalCity/city2 | 城市新模型 | Scenes 场景案例 / 城市 / GIS |
| earthSample/earthA | 样式A | Scenes 场景案例 / 城市 / GIS |
| earthSample/menuA | 菜单A | Scenes 场景案例 / 城市 / GIS |
| geokit/case-real-1 | 实战案例1 | Scenes 场景案例 / 城市 / GIS |
| geokit/case-real-2 | 实战案例2 | Scenes 场景案例 / 城市 / GIS |
| geokit/case-real-3 | 实战案例3 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/chinaMap | 中国地图展示 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/jiangSuMap | 江苏地图展示 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/googleMapsExample | googleMaps演示 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/mapBuildings | 地图和3DTiles结合 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/cloundSate | 卫星云图 | Scenes 场景案例 / 城市 / GIS |
| simpleGIS/radraImg | 雷达图 | Scenes 场景案例 / 城市 / GIS |
| zone3Deditor/pluginOne | 导出插件案例 | Scenes 场景案例 / 工业 / 园区 |
| tvtVolumeRendering/roomTemperature | 机房温度展示 | Scenes 场景案例 / 工业 / 园区 |
| smartFactory/sceneModel | 工厂模型 | Scenes 场景案例 / 工业 / 园区 |
| zoneOfficeFloor/index | 实例 | Scenes 场景案例 / 工业 / 园区 |
| zonePixelLowMachinRoom/index | 实例 | Scenes 场景案例 / 工业 / 园区 |
| zonePlasticProducts/index | 简单预览 | Scenes 场景案例 / 工业 / 园区 |
| freeDigitalHome/demo | 不连接homeassitant的展示 | Scenes 场景案例 / 工业 / 园区 |
| digitalPark/simplePark | 简单园区 | Scenes 场景案例 / 工业 / 园区 |
| digitalPark/innovationHubAr | Innovation Hub AR | Scenes 场景案例 / 工业 / 园区 |
| industry4/deviceLightReflector | 设备发光+镜面+表格说明 | Scenes 场景案例 / 工业 / 园区 |
| industry4/alternator | 发电机展示 | Scenes 场景案例 / 工业 / 园区 |
| tresEditor/svelteMachine | 编辑器半出Svelte机械 | Scenes 场景案例 / 工业 / 园区 |
| zoneFreeScene/freeRefiningIndustry | 低像素炼油厂 | Scenes 场景案例 / 工业 / 园区 |
| eCommerce/electricFan | 电风扇 | Scenes 场景案例 / 产品 / 电商 |
| eCommerce/sticker | 镭射塑料袋 | Scenes 场景案例 / 产品 / 电商 |
| eCommerce/arrangement | 桌面陈设 | Scenes 场景案例 / 产品 / 电商 |
| eCommerce/zipTopCan | 易拉罐 | Scenes 场景案例 / 产品 / 电商 |
| industry4/showCar | 911展示 | Scenes 场景案例 / 产品 / 电商 |
| industry4/showLambo | Lambo展示 | Scenes 场景案例 / 产品 / 电商 |
| industry4/su7 | 来吧，小米su7 | Scenes 场景案例 / 产品 / 电商 |
| industry4/bikeConfigurator | Bike Configurator | Scenes 场景案例 / 产品 / 电商 |
| tresEditor/coffeeDemo | 编辑器直出咖啡☕️ | Scenes 场景案例 / 产品 / 电商 |
| medical/brainStorm | 头脑风暴 | Scenes 场景案例 / 医疗 / 科研 |
| medical/digitalBrain | 数字大脑 | Scenes 场景案例 / 医疗 / 科研 |
| medical/digitalBrainFloor | 数字大脑镜面 | Scenes 场景案例 / 医疗 / 科研 |
| medical/yuriBrain | Yuri's大脑 | Scenes 场景案例 / 医疗 / 科研 |
| tvtAirport/index | 机场三维案例 | Scenes 场景案例 / 海洋 / 交通 |
| zoneLowAltitudeUAV/index | 配置直出源码 | Scenes 场景案例 / 海洋 / 交通 |
| zoneLowAltitudeUAV/secondaryCoding | 二次开发 | Scenes 场景案例 / 海洋 / 交通 |
| zoneFreeScene/freeShipSea | 海洋船运 | Scenes 场景案例 / 海洋 / 交通 |
| earthSample/lowpolyPlanet | 低像素多边形 | Scenes 场景案例 / 艺术 / 创意 |
| earthSample/smokeEarth | 烟雾球 | Scenes 场景案例 / 艺术 / 创意 |
| heroSection/earthMap | 现代 UI 设计官网 | Scenes 场景案例 / 艺术 / 创意 |
| heroSection/pointsEarth | 粒子球 | Scenes 场景案例 / 艺术 / 创意 |
| heroSection/particleEarth | 粒子地球 | Scenes 场景案例 / 艺术 / 创意 |
| visualArts/porcelainBrassSubmarine | 瓷器黄铜潜艇 | Scenes 场景案例 / 艺术 / 创意 |
| visualArts/biineBee | Biine Bee | Scenes 场景案例 / 艺术 / 创意 |
| visualArts/roomup | 日式会厅 | Scenes 场景案例 / 艺术 / 创意 |
| visualArts/mirror | 玻璃 | Scenes 场景案例 / 艺术 / 创意 |
| visualArts/galaxy | 银河 | Scenes 场景案例 / 艺术 / 创意 |
| zoneFreeScene/freeTvtStack | TvT.js技术栈 | Scenes 场景案例 / 艺术 / 创意 |
| gaussianSplatting/hunyuanSpzPage | 混元SPZ | Scenes 场景案例 / 高斯 / 实景 |
| zoneFreeScene/freeHYworld | 混元世界 | Scenes 场景案例 / 高斯 / 实景 |
| zoneRefiningIndustry/index | 炼化智能工厂可视化 | Applications 行业应用 / 工业数字孪生 |
| smartFactory/index | 三维智能工厂 | Applications 行业应用 / 工业数字孪生 |
| superFactory/superFactory | 超级工厂 | Applications 行业应用 / 工业数字孪生 |
| smartPark/smartPark | 智慧园区 | Applications 行业应用 / 城市 / 园区 |
| tvtCharts/shippingMonitoring | 航运三维检测台 | Applications 行业应用 / 仓储 / 物流 |
| zoneSmartWarehouse/secondaryCoding | 简单预览 | Applications 行业应用 / 仓储 / 物流 |
| tvtSubstation/index | 数字发电厂 | Applications 行业应用 / 能源 / 管网 |
| smartOilDepot/index | 油气储运三维可视化 | Applications 行业应用 / 能源 / 管网 |
| eMRIscan/debugger | 调试界面 | Applications 行业应用 / 医疗 / 科研 |
| eMRIscan/ui | UI界面 | Applications 行业应用 / 医疗 / 科研 |
| humanMedicine/humanMedicine | UI大屏界面 | Applications 行业应用 / 医疗 / 科研 |
| humanMedicine/humanMedicineTest | 模型调试界面 | Applications 行业应用 / 医疗 / 科研 |
| tvtCharts/sampleCar | 样例结合：汽车销量 | Applications 行业应用 / 数据 / 金融 |
| txWikiChart/columnar | 柱状图 | Applications 行业应用 / 数据 / 金融 |
| txWikiChart/pie | 饼图 | Applications 行业应用 / 数据 / 金融 |
| txWikiChart/wiki | 腾讯商业演化知识图谱 | Applications 行业应用 / 数据 / 金融 |
| communityMetaverse/index | ICE社区元宇宙 | Applications 行业应用 / 文旅 / 教育 |
| yht/index | 浏览页 | Applications 行业应用 / 文旅 / 教育 |
| yht/tribute | 献花留念卡 | Applications 行业应用 / 文旅 / 教育 |
| networkLinkTopology/caseA | 网络链路拓扑三维大屏展示系统 | Applications 行业应用 / 机房 / 网络 |
| networkLinkTopology/readConfig | 读取配置文件的项目 | Applications 行业应用 / 机房 / 网络 |
| showCabinet/index | 机柜展示带UI | Applications 行业应用 / 机房 / 网络 |
| topoProject/index | 拓扑项目 | Applications 行业应用 / 机房 / 网络 |
| zoneMachinRoom/index | 智慧机房 | Applications 行业应用 / 机房 / 网络 |
| freeDigitalHome/tts | 连接homeassitant的展示 | Applications 行业应用 / 智能家居 |
| zone3Deditor/img | 编辑器本体 | Tools 创作与工程 / 场景编辑 |
| tresEditor/threeEditor | three原生Editor | Tools 创作与工程 / 场景编辑 |
| map2BuildingRoad/index | 地图转建筑道路白模 | Tools 创作与工程 / GIS 编辑 |
| gisPlaneEditor/index | 编辑器本体 | Tools 创作与工程 / GIS 编辑 |
| animationEditor/index | 动画编辑器 | Tools 创作与工程 / 动画编辑 |
| materialEditor/index | 材质编辑器 | Tools 创作与工程 / 材质编辑 |
| postProcessing/postProcessingEditor | 后处理编辑器 | Tools 创作与工程 / 材质编辑 |
| networkLinkTopology/editor | 链路拓扑编辑器 | Tools 创作与工程 / UI / 大屏编辑 |
| topoEditor/index | 弹窗用法与自动布局 | Tools 创作与工程 / UI / 大屏编辑 |
| goView/goViewGF | goView项目纯前端 | Tools 创作与工程 / UI / 大屏编辑 |
| goView/index | 简单场景读取json配置 | Tools 创作与工程 / UI / 大屏编辑 |
| AIModels/panePage | AIModels | Tools 创作与工程 / AI 内容生成 |
| hunyuan3D/index | 导入混元模型 | Tools 创作与工程 / AI 内容生成 |
| goView/chartDataAPIPage | 测试数据接口联动 | Tools 创作与工程 / 工程集成 |
| qiankunTvt/other | 嵌入后台演示版本 | Tools 创作与工程 / 工程集成 |
| qiankunTvt/theBasic | 简单实例 | Tools 创作与工程 / 工程集成 |
| qiankunTvt/events | 通讯实例 | Tools 创作与工程 / 工程集成 |
| qiankunTvt/other | 其他场景移植 | Tools 创作与工程 / 工程集成 |
| tresEditor/simpleImport | 插件生成器 | Tools 创作与工程 / 工程集成 |
| tvtMqtt/index | MQTT调试面板 | Tools 创作与工程 / 工程集成 |
| tvtMqtt/withModel | MQTT与模型交互 | Tools 创作与工程 / 工程集成 |
| uniAppView/h5demo | 简单UI交互 | Tools 创作与工程 / 工程集成 |
| uniAppView/threedemo | 三维交互 | Tools 创作与工程 / 工程集成 |
| tvtVolumeRendering/temperatureCreater | 温度体数据生成器 | Tools 创作与工程 / 资源 / 动态组件 |
| dxf2mesh/dxf2meshPage | dxf2mesh | Tools 创作与工程 / 资源 / 动态组件 |
| gaussianSplatting/glb | 转glb | Tools 创作与工程 / 资源 / 动态组件 |
| gaussianSplatting/hy2plyPage | 混元2ply | Tools 创作与工程 / 资源 / 动态组件 |
| loadDynamicComponent/basic | 简单读取实例 | Tools 创作与工程 / 资源 / 动态组件 |
| loadDynamicComponent/readConfig | 读取远程配置实例 | Tools 创作与工程 / 资源 / 动态组件 |
| resourceManager/simpleLoading | 简单加载实例 | Tools 创作与工程 / 资源 / 动态组件 |
| resourceManager/customLoading | 自定义loader加载实例 | Tools 创作与工程 / 资源 / 动态组件 |

## 验证边界

- 已进行配置覆盖、原字段保持、卡片唯一键、Vue / TypeScript 语法解析与 diff 检查。
- 遵守 AGENTS.md，未运行 build/dev/debug，也未启动浏览器验证。
- 原有 `floor/meshReflectionFloor` 配置缺少对应 pages 文件；本次保留原配置并隐藏该项无效的默认源码入口，原演示入口需要另外修复。
