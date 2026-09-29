/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-10-16 10:53:09
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-05-15 09:40:18
 */
// 放工具函数
import { request } from '@fesjs/fes'

const OSS_ASSET_PREFIX = 'https://oss.icegl.cn/'
const REMOTE_PLUGIN_MENU_URL = 'https://www.icegl.cn/addons/tvt/pluginsforpreivew/index'

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const isPlainObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]'

const findStringBetween = (str) => {
    const regex = /\/([^/]+)(?=\/[^/]*$)/
    const match = str.match(regex)
    if (match && match[1]) {
        return match[1]
    }
    return null
}

export const getPluginsConfig = () => {
    // 获得插件列表 根据插件目录
    if (!window.pluginsConfig) {
        let modulePaths = import.meta.glob('PLS/*/config.js', { eager: true })
        if (process.env.FES_APP_PLSNAME !== undefined) {
            const filteredModules = Object.fromEntries(
                Object.entries(modulePaths).filter(([path]) => path.startsWith(`/src/plugins/${process.env.FES_APP_PLSNAME}/config.js`)),
            )
            modulePaths = filteredModules
        }
        const config = {}
        for (const path of Object.keys(modulePaths)) {
            const name = findStringBetween(path)
            if (!name) {
                continue
            }
            config[name] = modulePaths[path].default
        }
        window.pluginsConfig = config
    }
    //检查插件依赖关系
    if(process.env.FES_APP_PLSNAME === undefined) {
        for (const name of Object.keys(window.pluginsConfig)) {
            if (window.pluginsConfig[name].require) {
                window.pluginsConfig[name].require.forEach((req) => {
                    // eslint-disable-next-line no-undefined
                    const re = window.pluginsConfig[req] !== undefined
                    if (!re) {
                        console.error(`${req}插件_未安装，请到插件市场下载安装:https://icegl.cn/tvtstore/${req}`)
                        // window.open(`https://icegl.cn/tvtstore/${req}`, '_blank')
                        const features = 'width=600,height=350'
                        window.open(`https://icegl.cn/tvtstore/${req}`, req, features)
                        // FMessage.warning?.({
                        //     content: `${req}插件_未安装，请到插件市场下载安装:https://icegl.cn/tvtstore/${req}`,
                        //     colorful: true,
                        //     duration: 10,
                        // })
                    }
                })
            }
        }
    }
    return window.pluginsConfig
}

const getRemotePluginMenuUrl = () => REMOTE_PLUGIN_MENU_URL

const requestRemotePluginMenu = () =>
    request(getRemotePluginMenuUrl(), {}, {
        method: 'get',
    })

const isRelativeUrl = (src) => typeof src === 'string' && src && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:|blob:)/i.test(src)

const withOssPrefix = (src) => OSS_ASSET_PREFIX + src.replace(/^\.\//, '').replace(/^\//, '')

const normalizePreviewSrc = (preview) => {
    if (preview?.type === 'img' && isRelativeUrl(preview.src)) {
        return {
            ...preview,
            src: withOssPrefix(preview.src),
        }
    }
    return preview
}

const getPreviewList = (previews) => (Array.isArray(previews) ? previews.filter(isPlainObject) : [])

const normalizeRemotePluginConfig = (pluginConfig) => {
    if (!isPlainObject(pluginConfig)) {
        return pluginConfig
    }
    return {
        ...pluginConfig,
        remotePluginMenu: true,
        preview: getPreviewList(pluginConfig.preview).map(normalizePreviewSrc),
    }
}

const getMenuConfigs = (menuPayload) => {
    const configs =
        menuPayload?.configs ||
        menuPayload?.data?.configs ||
        menuPayload?.result?.configs ||
        menuPayload?.code?.configs ||
        menuPayload?.code?.menuList?.configs ||
        menuPayload?.data ||
        menuPayload?.result ||
        menuPayload
    return isPlainObject(configs) ? configs : {}
}

const isValidRemotePluginConfig = (pluginConfig) =>
    isPlainObject(pluginConfig) &&
    typeof pluginConfig.name === 'string' &&
    pluginConfig.name &&
    typeof pluginConfig.title === 'string' &&
    pluginConfig.title &&
    (pluginConfig.preview === undefined || Array.isArray(pluginConfig.preview))

const isValidRemoteMenuPayload = (menuPayload) => {
    const configs = getMenuConfigs(menuPayload)
    return Object.keys(configs).some((key) => isValidRemotePluginConfig(configs[key]))
}

const mergeRemotePluginMenu = (remoteMenu, local) => {
    if (!isValidRemoteMenuPayload(remoteMenu)) {
        console.log('在线插件菜单配置格式异常，已使用本地插件菜单')
        return local
    }
    const remoteConfigs = getMenuConfigs(remoteMenu)
    const result = { ...local }

    for (const olKey in remoteConfigs) {
        if (!hasOwn(remoteConfigs, olKey) || olKey === 'basic') {
            continue
        }
        const olItem = remoteConfigs[olKey]
        if (!isValidRemotePluginConfig(olItem) || olItem.tvtstore === undefined || result[olKey]) {
            continue
        }
        result[olKey] = normalizeRemotePluginConfig(olItem)
    }

    return result
}

export const getOnlinePluginConfig = (plConfig) =>
    requestRemotePluginMenu()
        .then((res) => {
            plConfig.value = mergeRemotePluginMenu(res, plConfig.value)
        })
        .catch((err) => {
            console.log(err, '请连接网络，获得在线插件菜单配置')
        })

// 通过名称查找预览配置
function findPreviewByName(previews, name) {
    return previews.find((preview) => preview.name === name)
}
// 在子配置中查找预览配置
function findChildPreviewByName(children, childName, previewName) {
    const child = children.find((chi) => chi.name === childName)
    if (child && child.preview) {
        return child.preview.find((preview) => preview.name === previewName)
    }
    return null
}
export const getOnePluginConfig = (pName, oName, cName) => {
    // 获得所有插件配置
    const modulePaths = import.meta.glob('PLS/*/config.js', { eager: true })

    // 遍历插件配置路径
    for (const path in modulePaths) {
        const config = modulePaths[path].default
        const pluginName = findStringBetween(path)

        // 匹配插件名称
        if (pluginName === pName) {
            // 根据页面参数名查找预览配置
            if (oName && config.preview) {
                const preview = findPreviewByName(config.preview, oName)
                if (preview) return { config, preview }
            }
            // 根据子页面参数名查找子配置
            else if (cName && config.child) {
                const childPreview = findChildPreviewByName(config.child, oName, cName)
                if (childPreview) return { config, preview: childPreview }
            }
            // 如果没有找到具体配置，返回默认配置
            return { config }
        }
    }
    // 如果没有找到匹配的插件配置，返回null
    return null
}
export const hasPlugin = (ename, cname) => {
    const config = getOnePluginConfig(ename, null, null)
    const re = config
    if (!re) {
        console.error(`${cname}_未安装，请到插件市场下载安装:https://icegl.cn/tvtstore/${ename}`)
        window.open(`https://icegl.cn/tvtstore/${ename}`, '_blank')
    }
    return re
}

export const detectDeviceType = () => {
    const ua = navigator.userAgent
    const width = window.innerWidth

    // 基于用户代理字符串的初步判断
    const isMobileUA = /Mobi|Android|iPhone/i.test(ua)
    const isTabletUA = /iPad|Tablet|Nexus 7|Nexus 10|KFAPWI/i.test(ua)

    if (isMobileUA) {
        return isTabletUA ? 'Tablet' : 'Mobile'
    }
    // 基于屏幕尺寸的进一步判断
    if (width <= 480) {
        return 'Mobile'
    }
    if (width <= 900) {
        return 'Tablet'
    }
    return 'PC'
}
