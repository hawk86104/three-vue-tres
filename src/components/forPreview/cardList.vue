<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-03 16:02:49
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-23 11:47:33
-->
<template>
    <FDivider titlePlacement="left">{{ onePlugin.title + ' - ' + onePlugin.name }}</FDivider>
    <FSpace vertical>
        <span style="text-decoration: none; color: black">
            <FText
                v-if="props.onePlugin.author"
                class="mt-[-24px] position-absolute right-[12px]"
                @click="toAuthorPage(onePlugin.website)"
                style="color: #0f1222; cursor: pointer"
                size="small"
            >
                <UserOutlined class="position-relative top-[2px]" /> 作者：
                {{ props.onePlugin.author }}
            </FText>
        </span>
        <div class="p-2 ml-13" style="" v-html="props.onePlugin.intro"></div>
    </FSpace>
    <div class="flex flex-wrap flex-justify-start content-start mt-6 pl-6">
        <div class="w-80 mr-10 mb-10 relative" :class="{'overflow-hidden':!isEditor(props.onePlugin, onePreview.name)}" v-for="(onePreview, okey) in onePlugin.preview" :key="okey">
            <template v-if="onePlugin.waitForGit || onePreview.waitForGit">
                <div v-if="hasStyle(props.onePlugin, onePreview.name)" class="tag-sheared" :class="classText(props.onePlugin, onePreview.name)">
                    {{ hasStyle(props.onePlugin, onePreview.name) }}
                </div>
                <FCard :header="onePreview.title" shadow="hover">
                    <div
                        class="w-full h-48 text-5 line-height-1.5em text-left mb-2 text-#5384ff"
                        style="background-color: rgb(55 56 61); overflow: hidden; border-radius: 10px"
                    >
                        <div class="p-2">官网已经更新样例功能，请git 更新代码!</div>
                    </div>
                    <div class="cursor-pointer text-right" style="margin-top: 6px; margin-bottom: -8px" @click="toPage(props.onePlugin, onePreview, true)">
                        点击web端演示
                    </div>
                </FCard>
            </template>
            <template v-else>
                <div v-if="hasStyle(props.onePlugin, onePreview.name)" class="tag-sheared" :class="classText(props.onePlugin, onePreview.name)">
                    {{ hasStyle(props.onePlugin, onePreview.name) }}
                </div>
                <FCard :header="onePreview.title" shadow="hover">
                    <video controls class="w-full max-h-70 h-14em" v-if="onePreview.type === 'video'">
                        <source :src="publicPath + onePreview.src" type="video/mp4" autoplay="true" loop="true" />
                    </video>
                    <oneImageQr v-else-if="onePreview.type === 'img'" :onePreview="onePreview" :onePlugin="onePlugin" />
                    <div
                        class="w-full h-48 text-3 text-left mb-2"
                        style="background-color: rgb(55 56 61); overflow: hidden; border-radius: 10px"
                        v-else-if="onePreview.type === 'text'"
                    >
                        <div class="p-2" style="color: white" v-html="onePreview.src"></div>
                    </div>
                    <div class="cursor-pointer text-right" style="margin-top: 6px; margin-bottom: -8px" @click="toPage(props.onePlugin, onePreview)">
                        点击web端演示
                    </div>
                </FCard>
                <n-popover v-if="isEditor(props.onePlugin, onePreview.name)" trigger="hover" placement="top-end" :show-arrow="false">
                    <template #trigger>
                        <button
                            type="button"
                            aria-label="编辑器引导"
                            class="editor-guide-trigger absolute bottom-11 right--3 z-99999"
                            @click.prevent.stop
                        >
                            <n-icon size="14" class="editor-guide-trigger__icon">
                                <LogoXbox />
                            </n-icon>
                            <span>编辑器</span>
                        </button>
                    </template>
                    <div class="editor-guide-popover">
                        <div class="editor-guide-tip">已规范封装，供给于编辑器生态中，灵活使用</div>
                        <a
                            v-for="item in editorGuideLinks"
                            :key="item.label"
                            :href="item.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="editor-guide-link"
                        >
                            <span class="editor-guide-link__label">{{ item.label }}</span>
                            <span class="editor-guide-link__arrow">↗</span>
                        </a>
                    </div>
                </n-popover>
            </template>
        </div>
    </div>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import { FCard, FDivider, FSpace, FText } from '@fesjs/fes-design'
import { useRouter } from '@fesjs/fes' //fesJS的路由被他自己封装了
import { useForPreviewStore } from '@/stores/forPreview'
import { UserOutlined } from '@fesjs/fes-design/icon'
import oneImageQr from './oneImageQr.vue'
import { loadJweixin, loadWebView } from 'PLS/uniAppView/lib/initScript'
import { NPopover, NIcon } from 'naive-ui'
import { LogoXbox } from '@vicons/ionicons5'

const props = withDefaults(
    defineProps<{
        onePlugin: any
    }>(),
    {},
)
const { menuSetup } = useForPreviewStore()
let publicPath = process.env.BASE_URL

const editorGuideLinks = [
    {
        label: '🖼️ 区域场景编辑器',
        url: 'https://zone3deditor.icegl.cn/#/plugins/zone3Deditor/index',
    },
    {
        label: '🗺️ GIS地理空间编辑器',
        url: 'https://gisplaneeditor.icegl.cn/#/plugins/gisPlaneEditor/index',
    },
]

const toAuthorPage = (url: string) => {
    window.open(url, '_blank')
}

onMounted(async () => {
    await loadJweixin()
    await loadWebView()
})

declare const uni: any

const router = useRouter()

// 小程序 uniapp端的跳转，若自己调试请更换地址  https://oss.icegl.cn
const jumpType = (url: string, addPreUrl: boolean) => {
    if (!uni.getEnv) {
        window.open(url, '_blank')
    } else {
        uni.getEnv((res: any) => {
            if (res.miniprogram) {
                const u = addPreUrl ? 'https://oss.icegl.cn' + url : url
                uni.navigateTo({
                    url: '/pages/debugDemo/onePreview/onePreview?urlPath=' + u,
                })
            } else {
                window.open(url, '_blank')
            }
        })
    }
}
const toPage = (plugin: any, value: any, isOnline = false) => {
    if (value.url) {
        return jumpType(value.url, false)
    }
    let path = `/plugins/${plugin.name}/${value.name}`
    if (plugin.pNode) {
        path = `/plugins/${plugin.pNode}/${plugin.name}/${value.name}`
    }
    if (isOnline) {
        path = 'https://oss.icegl.cn/#' + path
        return jumpType(path, false)
    }
    let routeUrl = router.resolve({
        path: path,
    })
    return jumpType(routeUrl.href, true)
}

const hasStyle = (plugin: any, value: any) => {
    if (menuSetup.value) {
        if (menuSetup.value[plugin.name] && menuSetup.value[plugin.name][value]) {
            if (menuSetup.value[plugin.name][value].taglist === 'editor') {
                // 编辑器标识 特殊处理
                return ''
            }
            return menuSetup.value[plugin.name][value].taglist_text
        }
    }
    return ''
}
const classText = (plugin: any, value: any) => {
    if (menuSetup.value) {
        if (menuSetup.value[plugin.name] && menuSetup.value[plugin.name][value]) {
            return menuSetup.value[plugin.name][value].taglist
        }
    }
    return ''
}
const isEditor = (plugin: any, value: any) => {
    if (menuSetup.value) {
        if (menuSetup.value[plugin.name] && menuSetup.value[plugin.name][value]) {
            return menuSetup.value[plugin.name][value].taglist === 'editor'
        }
    }
    return false
}
</script>

<style>
.fes-divider:not(.is-vertical) .fes-divider-text {
    font-size: 1.2em;
    background-color: #0f1222;
    font-weight: bolder;
    color: white;
}

.fes-divider {
    background-color: #0f1222;
    margin: 0px 10px 0px;
    width: 95%;
}

.fes-card__header {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}
</style>
<style lang="less" scoped>
.tag-sheared {
    background-color: #063667;
    color: white;
    width: 100%;
    height: 12%;
    line-height: 246%;
    text-align: center;
    margin-left: 41%;
    margin-top: 4%;
    position: absolute;
    font-size: 1.1em;
    transform: rotate(45deg);

    &.recommend {
        background-color: #e6698b;
    }

    &.hot {
        background-color: #b51c22;
    }
}

.editor-guide-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border: 1px solid rgba(255, 255, 255, 0.92);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 22px rgba(15, 18, 34, 0.14);
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    cursor: help;
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease;

    &:hover {
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 12px 26px rgba(15, 18, 34, 0.18);
        transform: translateY(-1px);
    }
}

.editor-guide-trigger__icon {
    color: #2563eb;
}

.editor-guide-popover {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 188px;
}

.editor-guide-tip {
    color: #64748b;
    font-size: 11px;
    line-height: 1.45;
    padding: 0 2px 4px;
}

.editor-guide-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    color: #0f172a;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
    text-decoration: none;
    background: #f8fafc;
    transition:
        background-color 0.2s ease,
        color 0.2s ease,
        transform 0.2s ease;

    &:hover {
        background: #eff6ff;
        color: #1d4ed8;
        transform: translateX(1px);
    }
}

.editor-guide-link__label {
    white-space: nowrap;
}

.editor-guide-link__arrow {
    color: #94a3b8;
    font-size: 11px;
}
</style>
