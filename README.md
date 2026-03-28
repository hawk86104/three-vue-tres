# Three-Vue-Tres 🧳🧳🧳 TvT.js 🧳🧳🧳
A Vue 3 wrapper for Three.js using TresJS for building interactive 3D scenes.

文档说明(语言)：[简体中文](./README_zh.md) | English

## 🎉🎉🎊 An Open-Source Framework for Rapid 3D Visualization Project Development 🎊🎉🎉

<p align="center">
    <a href="https://github.com/hawk86104/three-vue-tres" target="_blank">
      <img src="https://img.shields.io/github/stars/hawk86104/three-vue-tres" />
    </a>
    <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/hawk86104/three-vue-tres">
    <img src="https://img.shields.io/github/license/hawk86104/three-vue-tres" />
    <a target="_black" href="https://gitee.com/ice-gl/icegl-three-vue-tres">
      <img src="https://gitee.com/ice-gl/icegl-three-vue-tres/badge/star.svg?theme=dark" alt="gitee-starts" />
    </a>
      <a target="_black" href="https://gitcode.com/hawk86104/icegl-three-vue-tres">
      <img src="https://gitcode.com/hawk86104/icegl-three-vue-tres/star/badge.svg?theme=dark" alt="gitcode-starts" />
    </a>
    <a target="_black" href="https://space.bilibili.com/410503457">
       <img alt="bilibili" src="https://img.shields.io/badge/dynamic/json?url=https://api.bilibili.com/x/relation/stat?vmid=410503457&query=data.follower&color=282c34&label=冰哥B站&labelColor=FE7398&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD7ElEQVR4nO2dW9WrMBCFK6ESkFAJSKiESqgEHCABCZWAhEpAAhL2ecik5dDc%2FpXLBDLfWnlqy0xmJ5BMQnq5CIIgCIIgCIIgCIIgCEIBAHQAemYfrgCunD6wAKAHsEKxALgx+bCQD8%2FS9tmgVqeDr1lLigDgZvDhXso+K9TyTBQRwRJ8AHjntl0Flh5QRAQK%2FmKxPeayWx2OXpBNBKiHvi34b7T2MC4pAvW6twR%2FRwkRKPizBN8CgEcuESj4Lwm+BwBjahEk+H8EwJRKhOaCDzW8e1JLfkUUH1NgmR3XmHffHR1l+72BSs8d7w8U+JDAnZERQMcV+CtUi7dNqFqibB4J7vtrq7xKCuAasbTMXCL4T+5aVk6+2xHUrWdhruAR6HIJcOeu2UHI8zyAe2ytWfEdWz9PVvQ8YAmIQ5dDAB9LFsMVAv8oMO2zAGrC5WNIarRiAuKR9jYEd9pY08aa6uUzIHGRdkgKd8pY0yc1WjEBAqypDYoAG0QAZkQAZkQAZkQAZk4vANQenjsSzS3I%2FwcSbXU5jQBUkRtdf4Rar90v8kSv3+I3ffCCSpk8I%2Fw+lgDkdI%2Fv2rEp2CaiWm1AsDQLlDAD+dlFXLMeAaCSeLZdaSFE5VUQNot38cKuEeBgAsSuG0flVZBmEanbXfNQAsS0fgBYIn2fIu3%2FBBMHEyBmDXlFfA8IzeHb+Ems4WAChKykrVA9ZfsQTL57jXzRg4A5wC%2FA8N4ADiZAZwm2XjW75Qh2KOTfA0p4kygPw28OJcCVgn3nDnYo2EwEYRgGH0qAMyICMCMCMCMCMCMCMCMCMCMCfP3qwHDOQ4AAUekTk8FaBRihJnZdYbvtCGC7LvmkM63GjVDINPFrQgCq5ETXfmMzI90FXzPvfqt7x4rEu%2FZaEcCUxFvgz2zO+BUn6UkoaEEAsptiMSX5e8FoRYCN7cVgb4Vq7U%2FH50Pq4JNP7Qiw8UFnJwcK+tXy+Wj6PLEvPgHSHv5UgwA1IQIwwyFAyLJin9RoxYgAzAQIkPwNmf26busC+OIx5TDqo5nDT+F%2FSS%2F9CYzwb+No49zNy2evkYv0LywGGAXUvp6eSneycqOic0w20k7CNgKE7jJunSGLACTCxF27ylmQc98T5MQUH49swd+I0HPXslLKnT0N+wnkrTKi9JZL%2FL9i1SorMmdeQ4TQQ7OFMxIMzGD45w8nUL1im7efENZLJpgPSw0pfz0cdt4U3230Td%2FTvx2R6d2FrHhEWLkq5PELOMsRPHCPnAZGv1xJteL7jbJiaW3sB2nDvPC%2FosSYvjRQz4cJ6n7KO3rYQL7M+L6nVtfDVRAEQRAEQRAEQRAEIZ5%2FSAXmdfXaoQsAAAAASUVORK5CYII%3D&cacheSeconds=3600">
    </a>
    <a target="_black" href="https://space.bilibili.com/384558900">
       <img alt="bilibili" src="https://img.shields.io/badge/dynamic/json?url=https://api.bilibili.com/x/relation/stat?vmid=384558900&query=data.follower&color=282c34&label=地虎B站&labelColor=FE7398&logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAD7ElEQVR4nO2dW9WrMBCFK6ESkFAJSKiESqgEHCABCZWAhEpAAhL2ecik5dDc%2FpXLBDLfWnlqy0xmJ5BMQnq5CIIgCIIgCIIgCIIgCEIBAHQAemYfrgCunD6wAKAHsEKxALgx+bCQD8%2FS9tmgVqeDr1lLigDgZvDhXso+K9TyTBQRwRJ8AHjntl0Flh5QRAQK%2FmKxPeayWx2OXpBNBKiHvi34b7T2MC4pAvW6twR%2FRwkRKPizBN8CgEcuESj4Lwm+BwBjahEk+H8EwJRKhOaCDzW8e1JLfkUUH1NgmR3XmHffHR1l+72BSs8d7w8U+JDAnZERQMcV+CtUi7dNqFqibB4J7vtrq7xKCuAasbTMXCL4T+5aVk6+2xHUrWdhruAR6HIJcOeu2UHI8zyAe2ytWfEdWz9PVvQ8YAmIQ5dDAB9LFsMVAv8oMO2zAGrC5WNIarRiAuKR9jYEd9pY08aa6uUzIHGRdkgKd8pY0yc1WjEBAqypDYoAG0QAZkQAZkQAZkQAZk4vANQenjsSzS3I%2FwcSbXU5jQBUkRtdf4Rar90v8kSv3+I3ffCCSpk8I%2Fw+lgDkdI%2Fv2rEp2CaiWm1AsDQLlDAD+dlFXLMeAaCSeLZdaSFE5VUQNot38cKuEeBgAsSuG0flVZBmEanbXfNQAsS0fgBYIn2fIu3%2FBBMHEyBmDXlFfA8IzeHb+Ems4WAChKykrVA9ZfsQTL57jXzRg4A5wC%2FA8N4ADiZAZwm2XjW75Qh2KOTfA0p4kygPw28OJcCVgn3nDnYo2EwEYRgGH0qAMyICMCMCMCMCMCMCMCMCMCMCfP3qwHDOQ4AAUekTk8FaBRihJnZdYbvtCGC7LvmkM63GjVDINPFrQgCq5ETXfmMzI90FXzPvfqt7x4rEu%2FZaEcCUxFvgz2zO+BUn6UkoaEEAsptiMSX5e8FoRYCN7cVgb4Vq7U%2FH50Pq4JNP7Qiw8UFnJwcK+tXy+Wj6PLEvPgHSHv5UgwA1IQIwwyFAyLJin9RoxYgAzAQIkPwNmf26busC+OIx5TDqo5nDT+F%2FSS%2F9CYzwb+No49zNy2evkYv0LywGGAXUvp6eSneycqOic0w20k7CNgKE7jJunSGLACTCxF27ylmQc98T5MQUH49swd+I0HPXslLKnT0N+wnkrTKi9JZL%2FL9i1SorMmdeQ4TQQ7OFMxIMzGD45w8nUL1im7efENZLJpgPSw0pfz0cdt4U3230Td%2FTvx2R6d2FrHhEWLkq5PELOMsRPHCPnAZGv1xJteL7jbJiaW3sB2nDvPC%2FosSYvjRQz4cJ6n7KO3rYQL7M+L6nVtfDVRAEQRAEQRAEQRAEIZ5%2FSAXmdfXaoQsAAAAASUVORK5CYII%3D&cacheSeconds=3600">
    </a>
</p>

```shell
If you find this project helpful, please click the "Star⭐" button on the top right corner. Your star is my motivation to keep developing. Thank you!
```

## 面向国产化 / 信创环境 Web三维可视化框架 🇨🇳 🚩
具体 国产化 描述文档部分，[点击详情](https://docs.icegl.cn/docs/three-vue-tres/guide/localization.html)
```shell
1️⃣ 国产化硬件支持
2️⃣ 国产操作系统 & 浏览器支持
3️⃣ 国产化开发 / 部署环境
- 您完全可以把tvt.js作为国产化三维可视化项目、数字孪生平台的前端技术底座。
- 我们在所有依赖完全开源的基础上，拥有自主软件知识产权和软件著作权，开源且免费商用。
```

<a style="display:block;width:800px;max-width:100%;" href="https://www.bilibili.com/video/BV1mfCcYeE9E"><img src="./preview/bilibili.gif" alt="tres.js webgl three.js"></a>

# Ecosystem `@ThreeJS @Vue3.x @TresJS`

> Produced by icegl. Permanently open-source and free for commercial use. Ongoing updates. Please click "star⭐" on the top right corner to follow.

This project integrates with three major ecosystems:

- 🎠 ThreeJS \* [Details](https://threejs.org) A renowned browser-based 3D JavaScript library.

- 🍀 Vue3.x \* [Details](https://vuejs.org) Easy to learn and use, excellent performance, rich use cases as a web frontend framework.

- ⚡ TresJS \* [Details](https://tresjs.org) Declarative ThreeJS with Vue3 components for frontend 3D projects.

## 🏥 Preview: [🌏 opensource.icegl.cn](https://opensource.icegl.cn)

- If access is slow, use mirror: [🌏 oss.icegl.cn](http://oss.icegl.cn/)
- If VPN is available, use GitHub Pages mirror: [🌏 https://hawk86104.github.io](https://hawk86104.github.io/)
- Scan QR code for mini program: <img src="./preview/miniqr.jpg" width="166" alt="tres.js webgl three.js">

> 相关技术栈拓扑图 【包含全套项目源码】: 
<a href="./src/plugins/zoneFreeScene/pages/freeTvtStack.vue">git项目源码地址</a>

在线编辑器再次编辑后免费导出源码项目二开 :
<a href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeTvtStack">zone3Deditor页面跳转</a>

<a style="display:block;width:800px;max-width:100%;" href="https://opensource.icegl.cn/#/plugins/zoneFreeScene/freeTvtStack"><img src="https://opensource.icegl.cn/plugins/zoneFreeScene/preview/freeTvtStack.png" alt="tres.js webgl three.js"></a>

<table style="border: none; width: 100%; text-align: center;">
  <tr>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index">
        在线三维场景编辑器：[🪅免费导出源码+二次开发 ]
      </a>
    </td>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://www.icegl.cn/tvtstore/zoneMachinRoom">
        智慧机房：[ 编辑器直接落地项目 ]
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      <a href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index" style="display:block;max-width:100%;">
        <img src="./public/plugins/zone3Deditor/preview/index.png" alt="tres.js webgl">
      </a>
    </td>
    <td style="padding: 10px;">
      <a href="https://www.icegl.cn/tvtstore/zoneMachinRoom" style="display:block;max-width:100%;">
        <img src="https://opensource.icegl.cn/plugins/zoneMachinRoom/preview/index.png" alt="tres.js webgl">
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:10px;font-size:1.2em;">
			<a href="https://www.icegl.cn/tvtstore/zoneRefiningIndustry">
				炼化智能工厂可视化：[ 编辑器直接落地项目 ]
			</a>
		</td>
			  <td style="padding:10px;font-size:1.2em;">
			<a href="https://www.icegl.cn/tvtstore/zoneOfficeFloor">
				智能办公空间：[ 编辑器直接落地项目 ]
			</a>
		</td>

  </tr>
	<tr>
    <td style="padding: 10px;">
			<a href="https://oss.icegl.cn/p/zoneRefiningIndustry/#/plugins/zoneRefiningIndustry/index" style="display:block;max-width:100%;">
				<img src="https://opensource.icegl.cn/plugins/zoneRefiningIndustry/preview/index.png" alt="tres.js webgl">
			</a>
		</td>
				<td style="padding: 10px;">
			<a href="https://oss.icegl.cn/p/zoneOfficeFloor/#/plugins/zoneOfficeFloor/index" style="display:block;max-width:100%;">
				<img src="https://opensource.icegl.cn/plugins/zoneOfficeFloor/preview/index.png" alt="tres.js webgl">
			</a>
		</td>
  </tr>
		<tr>
    <td style="padding:10px;font-size:1.2em;">
			<a href="https://www.icegl.cn/tvtstore/zoneLowAltitudeUAV.html">
				无人机组可视化：[ 编辑器直接落地项目 ]
			</a>
		</td>
		<td style="padding:10px;font-size:1.2em;">
			<a href="https://opensource.icegl.cn/#/#zoneFreeScene">
				低像素炼油厂：[ 免费 ]
			</a>
		</td>
  </tr>
	<tr>
    <td style="padding: 10px;">
			<a href="https://www.icegl.cn/tvtstore/zoneLowAltitudeUAV.html" style="display:block;max-width:100%;">
								<img src="https://cdn.index.icegl.cn/uploads/20250813/010ead9fa5b3e69f00ad337b039784eb.png?imageMogr2/thumbnail/600x" alt="tres.js webgl">
			</a>
		</td>
		<td style="padding: 10px;">
			<a href="https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index?sceneConfig=freeRefiningIndustry" style="display:block;max-width:100%;">
				<img src="https://opensource.icegl.cn/plugins/zoneFreeScene/preview/freeRefiningIndustry.png" alt="tres.js webgl">
			</a>
		</td>
  </tr>
</table>


```shell
If access errors occur due to frequent project updates and builds, please clear browser cache.
```

<a href="https://opensource.icegl.cn"><img src="./preview/p1.gif" alt="three.js tres.js webgl tvt.js"></a>
<a href="https://opensource.icegl.cn"><img src="./preview/p2.gif" alt="three.js tres.js webgl tvt.js"></a>
<a href="https://opensource.icegl.cn"><img src="./preview/p3.gif" alt="three.js tres.js webgl tvt.js"></a>


More demos are available on the preview page.

# Advantages

- 🌈 Frontend Fundamentals \* FesJS [Details](https://fesjs.mumblefe.cn) Integrated libraries for icons, i18n, API calls, state management (Vuex/Pinia), layout/access/route management.

- 🌠 Write 3D visualization projects just like writing Vue3.x [Details](https://tresjs.org/guide) Fully supports latest ThreeJS. Use modern Vue3 syntax and TS/JS interchangeably.

```html
<template>
  <TresCanvas window-size>
    <TresPerspectiveCamera />
    <TresMesh>
      <TresTorusGeometry :args="[1, 0.5, 16, 32]" />
      <TresMeshBasicMaterial color="orange" />
    </TresMesh>
  </TresCanvas>
</template>
<script setup lang="ts">
  import { useLoop } from '@tresjs/core'
	import { useTextures } from 'PLS/basic'
	const pTexture = await useTextures(['./**.jpg', './**.png'])
	const { onLoop } = useLoop()
	onBeforeRender(({ delta }) => {
			// render loop
	})
</script>
```

### Please support with: Follow 💛 Like ⭐ Fork👣

# ✅ Quick Start

```js
1. git clone or download this repo
2. cd to project root
3. yarn // install dependencies [node -v >= 20.18]
4. yarn pre.dev // preview debug mode
5. yarn dev // project debug mode
6. yarn pre.build // build preview
7. yarn build // build project
8. yarn pre.dev.one // preview a specific example/plugin
9. yarn pre.build.one // build a specific example/plugin
10. yarn both // start dev and pre.dev together
```

# 📖 Documentation

## User Guide: [🌏docs.icegl.cn](https://docs.icegl.cn/)
<table style="border: none; width: 100%; text-align: center;">
  <tr>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/editor/threeeditor.html">
        3D Editor: [ 📊Native Editor + Plugin Generator ]
      </a>
    </td>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/editor/goview.html">
        UI Editor: [ 📊GoView Export + Config Import Component ]
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/editor/threeeditor.html" style="display:block;max-width:100%;">
        <img src="https://docs.icegl.cn/editor.png" alt="tres.js webgl">
      </a>
    </td>
    <td style="padding: 10px;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/editor/goview.html" style="display:block;max-width:100%;">
        <img src="./preview/goViewPlugin.png" alt="tres.js webgl">
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/frontend/uniapp.html">
        uniapp Mini Program Ecosystem: [ One Code, Full Platform Solution ]
      </a>
    </td>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/qiankun/introduction.html">
        Qiankun Micro Frontend: [ Seamless Integration into Existing Projects ]
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/frontend/uniapp.html" style="display:block;max-width:100%;">
        <img src="https://cdn.index.icegl.cn/uploads/20250416/e4d22f7669b1525f5c927270865c8373.jpg?imageMogr2/thumbnail/350x" alt="tres.js webgl">
      </a>
    </td>
    <td style="padding: 10px;">
      <a href="https://docs.icegl.cn/docs/three-vue-tres/qiankun/introduction.html" style="display:block;max-width:100%;">
        <img src="https://cdn.index.icegl.cn/uploads/20250416/0fe9fccaaffd82c2e6baba319a2a1ea0.jpg?imageMogr2/thumbnail/350x" alt="tres.js webgl">
      </a>
    </td>
  </tr>
</table>

# 🧩 Rich [Plugin Marketplace 🌏tvtstore](https://www.icegl.cn/tvtstore)
#### [🌏www.icegl.cn/tvtstore](https://www.icegl.cn/tvtstore) contains a variety of project scenarios and features. Plugins are a vital part of the ICE community ecosystem. In the marketplace, both complete applications and functional modules are referred to as plugins.<br/>
<table style="border: none; width: 100%; text-align: center;">
  <tr>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://www.icegl.cn/tvtstore">
        Plugin Marketplace
      </a>
    </td>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://www.icegl.cn/p/tvtdeveloper">
        Become an Author & Join Us
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      <a href="https://www.icegl.cn/tvtstore" style="display:block;max-width:100%;">
        <img src="./preview/tvtstore.png" alt="tres.js webgl">
      </a>
    </td>
    <td style="padding: 10px;">
      <a href="https://www.icegl.cn/p/tvtdeveloper" style="display:block;max-width:100%;">
        <img src="./preview/findyou.png" alt="tres.js webgl">
      </a>
    </td>
  </tr>
</table>

# ❓ Feedback & Support

If you have any questions while using the platform, feel free to reach out through the following methods:

### Q&A Community: [ICE Graphics Community icegl.cn](https://www.icegl.cn/ask)

<a href="https://www.icegl.cn/ask" style="display:block;width:800px;max-width:100%;">
<img src="./preview/ask01.png" alt="Graphics Q&A Community"></a>

#### Community Contributors & Experts: [Ask the Experts](https://icegl.cn/ask/experts)
<a href="https://icegl.cn/ask/experts.html" style="display:block;width:800px;max-width:100%;">
<img src="./preview/ask02.png" alt="Graphics Q&A Community"></a>

### Feel free to join our WeChat and QQ groups. Some groups are already full, but we're always happy to connect and learn WebGL together! Add us on WeChat to join the groups.

<table style="border: none; width: 60%; text-align: center;">
  <tr>
    <td style="padding:10px;font-size:1.2em;">
        WeChat Mini Program Ecosystem
    </td>
    <td style="padding:10px;font-size:1.2em;">
        WeChat Group
    </td>
    <td style="padding:10px;font-size:1.2em;">
      <a href="https://qm.qq.com/q/34V4hTtvbq">
        QQ Group: 795714357
      </a>
    </td>
    <td style="padding:10px;font-size:1.2em;">
        Official Account: ICE Graphics Community
    </td>
  </tr>
  <tr>
    <td style="padding: 10px;">
      <p style="display:block;max-width:100%;">
        <img src="./preview/miniqr.jpg" alt="tres.js webgl">
      </p>
    </td>
    <td style="padding: 10px;">
      <p style="display:block;max-width:100%;">
        <img src="./preview/wx.png" alt="tres.js webgl">
      </p>
    </td>
    <td style="padding: 10px;">
      <a href="https://qm.qq.com/q/34V4hTtvbq" style="display:block;max-width:100%;">
        <img src="./preview/qqq.png" alt="tres.js webgl">
      </a>
    </td>
    <td style="padding: 10px;">
      <p style="display:block;max-width:100%;">
        <img src="./preview/wxgzh.jpg" alt="tres.js webgl">
      </p>
    </td>
  </tr>
</table>

# ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hawk86104/three-vue-tres,hawk86104/vue3-ts-cesium-map-show&type=Date)](https://star-history.com/#hawk86104/three-vue-tres&hawk86104/vue3-ts-cesium-map-show&Date)

# ™️ Copyright Information

This project is released under the Apache 2.0 open-source license, providing free lifetime use and allowing commercial applications.

> If you use this project for commercial purposes, please comply with the Apache 2.0 license and retain the author’s technical support acknowledgment.

-   For secondary development intended for commercial use or open-source competitors, please do not remove or modify the copyright, author statement, or source attribution at the top of the TvT.js source code.
-   Commercial use is allowed, but secondary open-sourcing and charging for it are prohibited.

The copyright information of third-party source code and binary files included in this project will be noted separately.

Follow our official WeChat account to receive the latest updates.
<p align = "left">    
<img src="./preview/wxgzh.jpg" width="300" />
</p>

Copyright © 2022-2026 by 🧊icegl (https://www.icegl.cn)

All rights reserved。


