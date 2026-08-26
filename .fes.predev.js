/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-10-16 10:53:09
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-06-01 16:00:37
 */
import { defineBuildConfig } from '@fesjs/fes'
import { readFileSync } from 'node:fs'
import { posix } from 'node:path'
import fg from 'fast-glob'
// import viteCompression from 'vite-plugin-compression'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'
import addExtraScriptPlugin from './src/common/addExtraScriptPlugin.js'

const PLUGIN_SOURCE_GLOB = '**/*.{vue,js,ts,jsx,tsx}'
const pluginPredevEntries = fg.sync('src/plugins/*/predev.config.json').flatMap((configFile) => {
    const { sources = [] } = JSON.parse(readFileSync(configFile, 'utf8'))
    return sources.map((source) => posix.join(posix.dirname(configFile), source, PLUGIN_SOURCE_GLOB))
})

function scanPluginSources(entries) {
    return {
        name: 'predev-scan-plugin-sources',
        apply: 'serve',
        async configResolved(config) {
            const unoContext = config.plugins
                .find((plugin) => plugin.name === 'unocss:api')
                ?.api?.getContext()
            if (!unoContext || !entries.length) return

            // 在页面打开前完成插件样式扫描，避免首次懒加载触发 UnoCSS 全局热更新。
            const unoConfig = await unoContext.getConfig()
            unoConfig.content = {
                ...unoConfig.content,
                filesystem: [...(unoConfig.content?.filesystem || []), ...entries],
            }
        },
    }
}

export default defineBuildConfig({
    layout: {
        title: 'TvT.js',
        navigation: 'top',
        multiTabs: false,
        isFixedHeader: true,
        logo: 'logo.png',
        menus: [
            {
                name: 'preview',
                path: '/',
                title: '📀 预览演示',
            },
            {
                path: 'https://gitee.com/ice-gl/icegl-three-vue-tres',
                title: '📜 源码地址',
            },
            {
                title: '📚 说明文档',
                children: [
                    {
                        path: 'http://docs.icegl.cn',
                        title: '🧊 TvT框架文档',
                    },
                    {
                        path: 'https://threejs.org/docs/index.html#manual/zh/introduction/Creating-a-scene',
                        title: '🎲 three.js',
                    },
                    {
                        path: 'https://tresjs.org/guide/',
                        title: '⚡ tres.js',
                    },
                    {
                        path: 'https://fesjs.mumblefe.cn/',
                        title: '💠 fes.js',
                    },
                ],
            },
            {
                path: 'https://www.bilibili.com/video/BV1LH4y1p7Yn',
                title: '📀 TvT视频教程',
            },
            {
                path: 'https://www.icegl.cn/tvtstore',
                title: '🧩 插件市场',
            },
            {
                title: '🪢 编辑器生态',
                children: [
                    {
                        path: 'https://dcser.icegl.cn',
                        title: '🪡 动态组件服务',
                    },
                    {
                        path: 'https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index',
                        title: '🖼️ 区域场景编辑器',
                    },
                    {
                        path: 'https://gisplaneeditor.icegl.cn/#/plugins/gisPlaneEditor/index',
                        title: '🗺️ GIS地理空间编辑器',
                    },
                    {
                        path: 'https://animationeditor.icegl.cn/#/plugins/animationEditor/index',
                        title: '🐛 草履虫动画编辑器',
                    },
                    {
                        path: 'https://materialeditor.icegl.cn/#/plugins/materialEditor/index',
                        title: '🎨 材质编辑器',
                    },
                ],
            },
            {
                title: '🧊 ICEGL官网社区',
                children: [
                    {
                        path: 'https://www.icegl.cn/',
                        title: '🧊 ICEGL官网',
                    },
                    {
                        path: 'https://www.icegl.cn/ask',
                        title: '🙋‍♀️ 社区问答',
                    },
                ],
            },
            {
                title: '👨‍🏫 课程中心',
                children: [
                    {
                        path: 'https://icegl.cn/courses',
                        title: '🌁 WebGL初/中/高级教程',
                    },
                    {
                        path: 'https://www.bilibili.com/video/BV1iR4y1C7LQ/',
                        title: '🏙 WebGL Shader初级教程',
                    },
                    {
                        path: 'http://m.study.163.com/provider/480000002303414/index.htm?share=2&shareId=480000002303414',
                        title: '🌇 WebGL Shader中级教程',
                    },
                ],
            },
            {
                path: 'https://www.icegl.cn/tvtstore/uniAppView',
                title: '🪅 小程序生态',
            },
            {
                path: 'https://www.icegl.cn/d/demand/post',
                title: '🪢 定制开发',
            },
            {
                path: 'https://www.icegl.cn/p/tvtdeveloper.html',
                title: '💫 加入我们',
            },
        ],
    },
    viteOption: {
        optimizeDeps: {
            entries: ['index.html', ...pluginPredevEntries],
        },
        plugins: [
            console.log('正在加载 TvT.js...'),
            scanPluginSources(pluginPredevEntries),
            addExtraScriptPlugin(),
        ],
        server: {
            proxy: {
                // 开发代理服务器配置
                '/api.icegl': {
                    target: 'https://www.icegl.cn/',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api.icegl/, ''),
                },
                // 天地图本地代理
                '/tianditu.map': {
                    target: 'https://t0.tianditu.gov.cn/',
                    changeOrigin: true,
                    headers: {
                        Origin: 'opensource.icegl.cn',
                        Referer: 'http://opensource.icegl.cn',
                    },
                    rewrite: (path) => path.replace(/^\/tianditu.map/, ''),
                }
            },
        },
        build:{
	        reportCompressedSize: false,
            cssMinify: false,
            minify: 'esbuild',
        }
    },
})
