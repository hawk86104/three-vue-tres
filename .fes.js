/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-10-16 10:53:09
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-31 11:44:50
 */
// import { resolve } from 'path';
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { defineBuildConfig } from '@fesjs/fes'
import { templateCompilerOptions } from '@tresjs/core'
// eslint-disable-next-line import/no-unresolved
import UnoCSS from 'unocss/vite'
// eslint-disable-next-line import/no-extraneous-dependencies
import glsl from 'vite-plugin-glsl'
import federation from '@originjs/vite-plugin-federation'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const timeStamp = new Date().getTime()
const combinedIsCustomElement = (tag) => tag.startsWith('iconify-icon') || templateCompilerOptions.template.compilerOptions.isCustomElement(tag)

export default defineBuildConfig({
    mountElementId: 'tvt-app',
    title: 'TvT.js',
    publicPath: './', // './' 若在线部署用于生产环境 且 是使用qiankun微前端时，需要配置base为主应用地址 https://cos.icegl.cn/qiankun/tvt/
    access: {
        roles: {
            admin: ['*'],
            manager: ['/'],
        },
    },
    layout: {
        navigation: null,
    },
    enums: {
        status: [
            ['0', '无效的'],
            ['1', '有效的'],
        ],
    },
    qiankun: {
        micro: {
            useDevMode: true,
        },
    },
    //add by 地虎降天龙
    viteVuePlugin: {
        template: {
            compilerOptions: {
                isCustomElement: (tag) => combinedIsCustomElement(tag),
            },
        },
    },
    viteOption: {
        plugins: [
            UnoCSS({
                /* options */
            }),
            glsl({
                warnDuplicatedImports: false, // 禁用重复导入警告
            }),
            federation({
                name: 'tvt-host',
                remotes: {
                    home: {
                        // 必须默认引用一个 不然会报错：ReferenceError: __rf_placeholder__shareScope is not defined
                        external: `Promise.resolve('https://dcser.icegl.cn/assets/remoteEntry.js')`,
                        externalType: "promise"
                    }
                },
                shared: {
                    vue: {},
                    three: { version: '0.180.0' },
                    // "@tresjs/cientos": { version: '5.2.0' },
                    // "@tresjs/core": { version: '5.2.0' },
                    // three: { import: false, generate: false }
                }
            })
        ],
        build: {
            target: 'esnext', // 或者 'es2020' 以支持 BigInt
            chunkSizeWarningLimit: 1000, // 单位为KB
            rollupOptions: {
                output: {
                    minifyInternalExports: false,
                    manualChunks: {
                        three: ['three'],
                        '3d-tiles-renderer': ['3d-tiles-renderer'],
                    },
                    // manualChunks (id) {
                    //     // 自定义拆分策略，例如将特定的第三方库拆分为单独的 chunk
                    //     if (id.includes('node_modules')) {
                    //         const texts = id.toString().split('node_modules/')[1].split('/')[0]
                    //         // if (texts) {
                    //         //     console.log(id.toString(), texts)
                    //         // }
                    //         return texts
                    //     }
                    // },
                    format: 'es',
                    chunkFileNames: `js/[name].[hash]${timeStamp}.js`,
                    entryFileNames: `js/[name].[hash]${timeStamp}.js`,
                    assetFileNames: `[ext]/[name].[hash]${timeStamp}.[ext]`,
                    name: 'TvT.js',
                },
            },
            sourcemap: false,
            minify: 'terser',
        },
        // 全局 css 注册
        css: {
            preprocessorOptions: {
                scss: {
                    // javascriptEnabled: true,
                    // additionalData: `@import "src/plugins/goView/lib/scss/style.scss";`,
                    additionalData: (content, filename) => {
                        if (filename.includes('src/plugins/goView') || filename.includes('src/plugins/zone3Deditor')) {
                            return `@import "src/plugins/goView/lib/scss/style.scss";\n${content}`
                        }
                        return content
                    }
                },
            },
        },
        server: {
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            host: '0.0.0.0',
            proxy: {
                '/resource.cos': {
                    target: 'https://opensource.cdn.icegl.cn',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/resource.cos/, ''),
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
    },
    alias: {
        PLS: join(__dirname, './src/plugins'),
    },
    // { find: 'pls', replacement: resolve(__dirname, './src/plugins') },
    // { '@': join(__dirname, '/src') }
})