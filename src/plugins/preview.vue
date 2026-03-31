<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-18 22:17:49
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-24 11:15:58
-->
<template>
    <div class="absolute menuSelf">
        <div class="btn-just" @click="openTopMune"><MoreCircleOutlined /></div>
    </div>
    <FDrawer v-model:show="showTopMune" placement="top" title="" @ok="showTopMune = false">
        <f-menu mode="vertical" :collapsed="false" inverted @select="menuGoto">
            <template v-for="(item, index) in layoutConfigMenus" :key="index">
                <f-sub-menu v-if="item.children" :value="index">
                    <template #label>{{ item.title }}</template>
                    <template v-for="(oneo, pkey) in item.children">
                        <f-menu-item :value="index * 10 + pkey">
                            <template #label>{{ oneo.title }}</template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
                <f-menu-item v-else :value="index">
                    <template #label>{{ item.title }}</template>
                </f-menu-item>
            </template>
        </f-menu>
    </FDrawer>
    <div class="flex h-full w-full">
        <div style="background-color: #0f1222">
            <FMenu
                mode="vertical"
                expandTrigger="click"
                :defaultExpandAll="detectDeviceType() === 'PC'"
                :collapsed="detectDeviceType() !== 'PC'"
                :inverted="true"
                @select="goto"
            >
                <f-sub-menu value="1">
                    <template #icon>
                        <AppstoreOutlined />
                    </template>
                    <template #label>
                        <div class="flex absolute" style="left: 1px; flex-direction: column; top: 10px">
                            <f-badge value="AllFree" class="tag-fbdge afree-tag" type="success" size="small" />
                        </div>
                        基础功能组件 <FBadge :max="999" :value="getMenusCount().basic" class="count-fbdge big-cf" type="primary" size="small"
                    /></template>
                    <template v-for="(bP, pkey) in filteredData">
                        <f-menu-item v-if="pkey === 'basic'" v-for="(onePlugin, okey) in bP.child" :value="onePlugin.name">
                            <template #label>
                                <div class="flex absolute badge-group">
                                    <template v-for="(lbItem, lbKey) in getleftMenuBadge(onePlugin.name)">
                                        <f-badge v-if="lbItem.show" :value="lbItem.text" class="tag-fbdge" type="primary" size="small" />
                                    </template>
                                </div>
                                <span class="left-m-text">{{ onePlugin.title }}</span>
                                <FBadge :value="onePlugin.preview.length" class="count-fbdge" type="primary" size="small"
                            /></template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
                <f-sub-menu value="2">
                    <template #icon>
                        <PictureOutlined />
                    </template>
                    <template #label>
                        <div class="flex absolute" style="left: 1px; flex-direction: column; top: 10px">
                            <f-badge value="AllFree" class="tag-fbdge afree-tag" type="success" size="small" />
                        </div>
                        样例与组件 <FBadge :max="999" :value="getMenusCount().case" class="count-fbdge big-cf" type="primary" size="small"
                    /></template>
                    <template v-for="(onePlugin, pkey) in filteredData">
                        <f-menu-item v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'caseCenter'" :value="pkey">
                            <template #label>
                                <div class="flex absolute badge-group">
                                    <template v-for="(lbItem, lbKey) in getleftMenuBadge(onePlugin.name)">
                                        <f-badge v-if="lbItem.show" :value="lbItem.text" class="tag-fbdge" type="primary" size="small" />
                                    </template>
                                </div>
                                <span class="left-m-text">{{ onePlugin.title }}</span>
                                <FBadge :value="onePlugin.preview.length" class="count-fbdge" type="primary" size="small" />
                            </template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
                <f-sub-menu value="3">
                    <template #icon>
                        <ClusterOutlined />
                    </template>
                    <template #label
                        >插件应用管理 <FBadge :max="999" :value="getMenusCount().tvtstore" class="count-fbdge big-cf" type="primary" size="small"
                    /></template>
                    <f-menu-item value="tvtPluginUrl">
                        <template #label>
                            <div class="flex absolute badge-group">
                                <f-badge value="tvtstore" class="tag-fbdge" type="danger" size="small" />
                            </div>
                            <span class="left-m-text">插件应用市场</span>
                        </template>
                    </f-menu-item>
                    <template v-for="(onePlugin, pkey) in filteredData">
                        <f-menu-item v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'Tvtstore'" :value="pkey">
                            <template #label>
                                <div class="flex absolute badge-group">
                                    <f-badge value="free" class="tag-fbdge afree-tag" type="success" size="small" v-if="onePlugin.tvtstore === 'FREE'" />
                                </div>
                                <div class="flex absolute" style="top: 3px; right: 30px">
                                    <f-badge :value="onePlugin.version" class="tag-fbdge" type="primary" size="small" />
                                </div>
                                <span class="left-m-text">{{ onePlugin.title }}</span>
                                <FBadge :value="onePlugin.preview.length" class="count-fbdge" type="primary" size="small" />
                            </template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
                <f-sub-menu value="4">
                    <template #icon>
                        <EditOutlined />
                    </template>
                    <template #label
                        >区域场景编辑器 <FBadge :max="999" :value="getMenusCount().zoneEditor" class="count-fbdge big-cf" type="primary" size="small"
                    /></template>
                    <f-menu-item value="zoneEditorUrl">
                        <template #label>
                            <div class="flex absolute badge-group">
                                <f-badge value="zoneEditor" class="tag-fbdge" type="danger" size="small" />
                            </div>
                            <span class="left-m-text">编辑器介绍</span>
                        </template>
                    </f-menu-item>
                    <template v-for="(onePlugin, pkey) in filteredData">
                        <f-menu-item v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'zoneEditor'" :value="pkey">
                            <template #label>
                                <div class="flex absolute badge-group">
                                    <f-badge value="free" class="tag-fbdge afree-tag" type="success" size="small" v-if="onePlugin.tvtstore === 'FREE' || onePlugin.name === 'zone3Deditor'" />
                                </div>
                                <div class="flex absolute" style="top: 3px; right: 30px">
                                    <f-badge :value="onePlugin.version" class="tag-fbdge" type="primary" size="small" />
                                </div>
                                <span class="left-m-text">{{ onePlugin.title }}</span>
                                <FBadge :value="onePlugin.preview.length" class="count-fbdge" type="primary" size="small" />
                            </template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
                <f-sub-menu value="5">
                    <template #icon>
                        <EditOutlined />
                    </template>
                    <template #label
                        >GIS地理空间编辑器 <FBadge :max="999" :value="getMenusCount().gisEditor" class="count-fbdge big-cf" type="primary" size="small"
                    /></template>
                    <f-menu-item value="gisPlaneEditorIntroUrl">
                        <template #label>
                            <div class="flex absolute badge-group">
                                <f-badge value="GIS" class="tag-fbdge" type="danger" size="small" />
                            </div>
                            <span class="left-m-text">编辑器介绍</span>
                        </template>
                    </f-menu-item>
                    <template v-for="(onePlugin, pkey) in filteredData">
                        <f-menu-item v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'gisEditor'" :value="pkey">
                            <template #label>
                                <div class="flex absolute badge-group">
                                    <f-badge value="free" class="tag-fbdge afree-tag" type="success" size="small" v-if="onePlugin.tvtstore === 'FREE'" />
                                </div>
                                <div class="flex absolute" style="top: 3px; right: 30px">
                                    <f-badge :value="onePlugin.version" class="tag-fbdge" type="primary" size="small" />
                                </div>
                                <span class="left-m-text">{{ onePlugin.title }}</span>
                                <FBadge :value="onePlugin.preview.length" class="count-fbdge" type="primary" size="small" />
                            </template>
                        </f-menu-item>
                    </template>
                </f-sub-menu>
            </FMenu>
        </div>
        <div
            id="right-page-list-id"
            class="overflow-scroll relative right-page-list"
            :class="{ 'mt-10': detectDeviceType() === 'PC' }"
            style="height: calc(100vh - 42px - 52px); width: 100%"
        >
            <filterComFixed v-show="detectDeviceType() === 'PC'" />
            <template v-for="(onePlugin, pkey) in filteredData" :key="pkey">
                <template v-if="pkey === 'basic'">
                    <div style="background-color: #f1f1f2" v-for="(one, opkey) in onePlugin.child" :key="opkey" :ref="(el) => (tabListRef[one.name] = el)">
                        <cardList :onePlugin="one" />
                    </div>
                </template>
            </template>
            <template v-for="(onePlugin, pkey) in filteredData" :key="pkey">
                <div style="background-color: #f1f1f2" v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'caseCenter'" :ref="(el) => (tabListRef[pkey] = el)">
                    <cardList :onePlugin="onePlugin" />
                </div>
            </template>
            <template v-for="(onePlugin, pkey) in filteredData" :key="pkey">
                <div style="background-color: #f1f1f2" v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'Tvtstore'" :ref="(el) => (tabListRef[pkey] = el)">
                    <cardList :onePlugin="onePlugin" />
                </div>
            </template>
            <template v-for="(onePlugin, pkey) in filteredData" :key="pkey">
                <div style="background-color: #f1f1f2" v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'zoneEditor'" :ref="(el) => (tabListRef[pkey] = el)">
                    <cardList :onePlugin="onePlugin" />
                </div>
            </template>
            <template v-for="(onePlugin, pkey) in filteredData" :key="pkey">
                <div style="background-color: #f1f1f2" v-if="pkey !== 'basic' && isTvtstore(onePlugin) === 'gisEditor'" :ref="(el) => (tabListRef[pkey] = el)">
                    <cardList :onePlugin="onePlugin" />
                </div>
            </template>
            <UpCircleOutlined class="toTop" @click="scrollToTop" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, provide, watch, onMounted, nextTick } from 'vue'
import { defineRouteMeta, useRoute, useRouter } from '@fesjs/fes'
import { FBadge, FDrawer, FMenu, FSubMenu, FMenuItem } from '@fesjs/fes-design'
import { AppstoreOutlined, PictureOutlined, UpCircleOutlined, MoreCircleOutlined, ClusterOutlined, EditOutlined } from '@fesjs/fes-design/icon'
import { getPluginsConfig, getOnlinePluginConfig, detectDeviceType } from '../common/utils'
import { useForPreviewStore } from '@/stores/forPreview'
import cardList from '../components/forPreview/cardList.vue'
import filterComFixed from '../components/forPreview/filterComFixed.vue'

defineRouteMeta({
    name: 'preview',
    title: '开源框架展示',
})

const layoutConfigMenus = window.layoutConfig.menus
const menuGoto = (value: any) => {
    console.log(value)
    if (value.value >= 10) {
        const i1 = Math.floor(value.value / 10)
        const i2 = value.value % 10
        window.location.assign(layoutConfigMenus[i1].children[i2].path)
    } else {
        window.location.assign(layoutConfigMenus[value.value].path)
    }
}

const tabListRef = ref([]) as any
const pluginsConfig = ref({})
pluginsConfig.value = getPluginsConfig() as any
if ((process.env.NODE_ENV === 'development' && process.env.FES_APP_PLSNAME === undefined) || process.env.FES_APP_ONLINE_API) {
    getOnlinePluginConfig(pluginsConfig)
}
const router = useRouter()
const goto = (value: any) => {
    if (value.value === 'tvtPluginUrl') {
        window.open('https://www.icegl.cn/tvtstore', '_blank')
    } else if (value.value === 'zoneEditorUrl') {
        window.open('https://www.icegl.cn/tvtstore/zone3Deditor', '_blank')
    } else if (value.value === 'gisPlaneEditorIntroUrl') {
        window.open('https://www.icegl.cn/tvtstore/gisPlaneEditor', '_blank')
    } else {
        tabListRef.value[value.value]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        router.replace({ hash: `#${value.value}` })
    }
}

const route = useRoute()
onMounted(() => {
    nextTick(() => {
        const hash = route.hash
        const tabdom = hash.startsWith('#') ? hash.slice(1) : (hash as any)
        if (tabdom) {
            tabListRef.value[tabdom]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    })
})

const scrollToTop = () => {
    document.querySelector('.right-page-list')?.scrollTo({ top: 0, behavior: 'smooth' })
}

// const expandedKeys = ref(['1','2','3'])

const filterFixedInputValue = ref('')
provide('filterFixedInputValue', filterFixedInputValue)

const filterObjects = (obj: any, searchString: string): any => {
    if (!searchString) {
        return filterMenuSetup(menuSetupFilter.value)
    }
    const result = {} as any
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const item = obj[key]
            if (typeof item === 'object') {
                if (key === 'basic') {
                    const bItem = Object.values(filterObjects(item.child, searchString))
                    if (bItem.length) {
                        result[key] = {}
                        Object.assign(result[key], item, { child: bItem })
                    }
                    continue
                }
                const hasMatchInTitleOrName =
                    (item.title && item.title.toLocaleLowerCase().includes(searchString)) || (item.name && item.name.toLocaleLowerCase().includes(searchString))
                if (hasMatchInTitleOrName) {
                    result[key] = item
                    continue
                } else {
                    const filteredPreview = item.preview.filter((previewItem: any) => {
                        return (
                            (previewItem.name && previewItem.name.toLocaleLowerCase().includes(searchString)) ||
                            (previewItem.title && previewItem.title.toLocaleLowerCase().includes(searchString))
                        )
                    })
                    if (filteredPreview.length > 0) {
                        result[key] = { ...item, preview: filteredPreview }
                    }
                }
            }
        }
    }
    return result
}
let filteredData = ref(pluginsConfig.value) as any
watch(filterFixedInputValue, (newValue: any) => {
    filteredData.value = filterObjects(pluginsConfig.value, newValue.toLocaleLowerCase())
})

const { menuSetup } = useForPreviewStore()

function filterMenuSetup(msFilter: any) {
    if (msFilter.length === 0) {
        return pluginsConfig.value
    }
    const result = {} as any
    msFilter.forEach((tag: any) => {
        if (menuSetup.value) {
            for (const key in menuSetup.value) {
                if (menuSetup.value.hasOwnProperty(key)) {
                    for (const key2 in menuSetup.value[key]) {
                        if (menuSetup.value[key].hasOwnProperty(key2)) {
                            if (menuSetup.value[key][key2].taglist === tag) {
                                if (pluginsConfig.value[key]?.preview) {
                                    const filteredPreview = pluginsConfig.value[key].preview.filter((item: any) => item.name === key2)
                                    if (filteredPreview) {
                                        if (result[key]) {
                                            result[key].preview = result[key].preview.concat(filteredPreview)
                                        } else {
                                            result[key] = { ...pluginsConfig.value[key], preview: filteredPreview }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    })

    return result
}
const menuSetupFilter = ref([])
provide('menuSetupFilter', menuSetupFilter)
watch(menuSetupFilter, (newValue: any) => {
    filteredData.value = filterMenuSetup(newValue)
})
const getleftMenuBadge = (name: string) => {
    const tagOne = {
        recommend: { show: false, text: '荐' },
        new: { show: false, text: '新' },
        hot: { show: false, text: '热' },
        editor: { show: false, text: '热' },
    } as any
    if (menuSetup.value && menuSetup.value[name]) {
        const tmpOne = menuSetup.value[name]
        for (const key in tmpOne) {
            tagOne[tmpOne[key].taglist].show = true
            if (tmpOne[key].taglist === 'editor') {
                // 编辑器标识 特殊处理
                tagOne[tmpOne[key].taglist].show = false
            } 
        }
    }
    return tagOne
}

// 区分是否是案例中心的 还是 插件市场的
const isTvtstore = (onePlugin: any) => {
    if (typeof onePlugin.tvtstore !== 'undefined') {
        if (onePlugin.name.startsWith('zone')) {
            return 'zoneEditor'
        } else if (onePlugin.name.startsWith('gis')) {
            return 'gisEditor'
        } else {
            return 'Tvtstore'
        }
    } else {
        return 'caseCenter'
    }
}
const getMenusCount = () => {
    const reCount = {
        basic: 0,
        case: 0,
        tvtstore: 0,
        zoneEditor: 0,
        gisEditor: 0,
    }
    for (const key in filteredData.value) {
        if (filteredData.value.hasOwnProperty(key)) {
            if (key === 'basic') {
                for (const key2 in filteredData.value[key].child) {
                    if (filteredData.value[key].child.hasOwnProperty(key2)) {
                        reCount.basic += filteredData.value[key].child[key2].preview.length
                    }
                }
            } else {
                if (isTvtstore(filteredData.value[key]) === 'Tvtstore') {
                    reCount.tvtstore += filteredData.value[key].preview.length
                } else if (isTvtstore(filteredData.value[key]) === 'caseCenter') {
                    reCount.case += filteredData.value[key].preview.length
                } else if (isTvtstore(filteredData.value[key]) === 'zoneEditor') {
                    reCount.zoneEditor += filteredData.value[key].preview.length
                } else if (isTvtstore(filteredData.value[key]) === 'gisEditor') {
                    reCount.gisEditor += filteredData.value[key].preview.length
                }
            }
        }
    }
    return reCount
}
const showTopMune = ref(false)
const openTopMune = () => {
    showTopMune.value = true
}
</script>

<style lang="less">
@media (max-width: 900px) {
    #tvt-app > section > div > header > div.fes-menu.is-horizontal.is-inverted.layout-menu {
        display: none;
    }
    .fes-layout-container {
        z-index: 9999;
        position: absolute;
        overflow: visible !important;
    }
    .menuSelf {
        z-index: 99999;
        right: 0px;
        top: -40px;
        .btn-just {
            color: #fff;
            width: 1.5em;
            font-size: 1.5em;
            cursor: pointer;
            display: flex;
        }
    }
    body > div.fes-drawer.fes-drawer-top > {
        div.fes-drawer-mask {
            z-index: 9999 !important;
        }
        .fes-drawer-container {
            z-index: 9999 !important;
            .fes-drawer-wrapper {
                width: 100%;
                height: 520px;
                background: #ff000000;
                padding-top: 50px;
                .fes-drawer-close {
                    margin-top: 7px;
                    padding-right: 13px;
                    color: white;
                }
            }
            .fes-drawer-body-container {
                background: #0f1222;
            }
        }
    }
    .fes-popper-wrapper {
        z-index: 9999 !important;
        overflow: scroll;
        scrollbar-width: thin;
        height: 100vh;
    }
}
.layout-logo {
    /* margin-right: 6.2em !important; */
    width: 12.5rem !important;
    max-width: 181px;
    padding: 0 !important;
    justify-content: center !important;
    margin: 0 !important;
}

.fes-menu.is-vertical.is-inverted .fes-menu-item,
.fes-menu.is-horizontal.is-inverted .fes-menu-item {
    font-size: 0.93em;
    font-weight: 100;
}

.fes-menu.is-vertical.is-inverted {
    overflow: hidden;
    height: calc(100vh - 54px);
    overflow: scroll;
}

.fes-menu.is-vertical.is-inverted::-webkit-scrollbar {
    display: none;
}

.main-layout .layout-header {
    overflow: hidden;
}

.fes-checkbox-group {
    margin-bottom: 5px;
    margin-right: 20px;
}

.count-fbdge {
    span {
        border-radius: 3px !important;
        background-color: #0f1222 !important;
        border: white 1px solid;
        scale: 0.8;
        padding: 1px !important;
        margin-top: 2px;
        height: 15px;
    }
}

.tag-fbdge {
    span {
        border-radius: 2px !important;
        padding: 0px !important;
    }
}
&.afree-tag {
    span {
        border-radius: 2px !important;
        padding: 2px !important;
    }
}

.fes-menu.is-vertical .fes-menu-item-wrapper {
    height: 46px !important;
}
</style>
<style lang="less" scoped>
.toTop {
    position: fixed;
    right: 20px;
    bottom: 20px;
    font-size: 26px;
    font-weight: bold;
    color: #0f1222;
    cursor: pointer;
}

.count-fbdge {
    position: absolute;
    right: 13px;
    top: 13.8px;
}
&.big-cf {
    position: relative;
    left: -2px;
    right: auto;
    top: 0px;
}

.tag-fbdge {
    scale: 0.8;
    margin-bottom: -3px;
    margin-top: 1px;
}

.left-m-text {
    width: 95%;
    display: block;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
}
.badge-group {
    left: 1px;
    flex-direction: column;
    top: 2px;
}
@media (max-width: 900px) {
    .badge-group {
        left: -3px;
        top: -4px;
    }
    .tag-fbdge[data-v-470f55ee] {
        scale: 0.8;
        margin-bottom: -5px;
        margin-top: 0px;
    }
}
</style>
