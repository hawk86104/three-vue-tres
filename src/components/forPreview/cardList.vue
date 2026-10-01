<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2023-11-03 16:02:49
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-23 11:47:33
-->
<template>
    <FDivider v-if="!catalogMode" titlePlacement="left">{{ onePlugin.title + ' - ' + onePlugin.name }}</FDivider>
    <FSpace v-if="!catalogMode" vertical>
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
    <div :class="catalogMode ? 'catalog-card-grid' : 'flex flex-wrap flex-justify-start content-start mt-6 pl-6'">
        <div class="relative" :class="catalogMode ? 'catalog-card' : 'w-80 mr-10 mb-10'" v-for="(onePreview, okey) in onePlugin.preview" :key="onePreview.id || okey">
            <div v-if="hasStyle(sourcePlugin(onePreview), onePreview.name)" class="tag-sheared" :class="classText(sourcePlugin(onePreview), onePreview.name)">
                {{ hasStyle(sourcePlugin(onePreview), onePreview.name) }}
            </div>
            <FCard :header="catalogMode ? '' : onePreview.title" :shadow="catalogMode ? 'never' : 'hover'">
                <video controls class="w-full max-h-70 h-14em" v-if="onePreview.type === 'video'">
                    <source :src="mediaUrl(onePreview.src)" type="video/mp4" autoplay="true" loop="true" />
                </video>
                <oneImageQr v-else-if="onePreview.type === 'img'" :onePreview="onePreview" :onePlugin="sourcePlugin(onePreview)" />
                <div
                    class="w-full h-48 text-3 text-left mb-2"
                    style="background-color: rgb(55 56 61); overflow: hidden; border-radius: 10px"
                    v-else-if="onePreview.type === 'text'"
                >
                    <div class="p-2" style="color: white" v-html="onePreview.src"></div>
                </div>
                <div v-if="catalogMode" class="catalog-card-heading">
                    <h3 class="catalog-card-title" :title="cardTitle(onePreview)">{{ cardTitle(onePreview) }}</h3>
                    <span
                        v-if="sourceLabel(onePreview) && sourceLabel(onePreview) !== cardTitle(onePreview)"
                        class="catalog-card-origin"
                        :title="sourcePlugin(onePreview).title || sourcePlugin(onePreview).name"
                    >{{ sourceLabel(onePreview) }}</span>
                </div>
                <div v-if="catalogMode && (sourcePlugin(onePreview).author || sourcePlugin(onePreview).tvtstore)" class="catalog-card-meta">
                    <span v-if="sourcePlugin(onePreview).author" class="catalog-card-author" :title="'作者：' + sourcePlugin(onePreview).author">
                        <UserOutlined aria-hidden="true" /><span>{{ sourcePlugin(onePreview).author }}</span>
                    </span>
                    <span v-if="sourcePlugin(onePreview).tvtstore" class="catalog-card-kind">{{ isLocalPlugin(sourcePlugin(onePreview)) ? '本地插件' : sourcePlugin(onePreview).tvtstore === 'FREE' ? '免费插件' : '市场插件' }}</span>
                </div>
                <details v-if="catalogMode && sourcePlugin(onePreview).intro" class="catalog-card-details">
                    <summary>说明与文档</summary><div v-html="sourcePlugin(onePreview).intro"></div>
                </details>
                <div class="catalog-card-actions">
                    <span v-if="sourcePagePath(onePreview) || sourceUrl(onePreview)" class="catalog-card-code">
                        <code v-if="sourcePagePath(onePreview)" class="catalog-card-page" :title="sourcePagePath(onePreview)">{{ sourcePageLabel(onePreview) }}</code>
                        <a v-if="sourceUrl(onePreview)" :href="sourceUrl(onePreview)" target="_blank" rel="noopener noreferrer">源码</a>
                    </span>
                    <a v-if="onePreview.catalog?.promptUrl" :href="onePreview.catalog.promptUrl" target="_blank" rel="noopener noreferrer">Prompt</a>
                    <a v-if="onePreview.catalog?.studioUrl" :href="onePreview.catalog.studioUrl" target="_blank" rel="noopener noreferrer">Studio</a>
                    <oneImageQr :onePreview="onePreview" :onePlugin="sourcePlugin(onePreview)" qr-only />
                    <button type="button" class="catalog-demo-button" @click="toPage(sourcePlugin(onePreview), onePreview)">{{ onePreview.url?.includes('/tvtstore/') ? '查看详情' : 'Web 演示' }} <span aria-hidden="true">↗</span></button>
                </div>
            </FCard>
            <n-popover
                v-if="isEditor(sourcePlugin(onePreview), onePreview.name)"
                trigger="hover"
                placement="top-end"
                :show-arrow="false"
                :theme-overrides="catalogMode ? { color: 'var(--catalog-surface)', textColor: 'var(--catalog-text)', boxShadow: 'var(--catalog-shadow)' } : undefined"
            >
                <template #trigger>
                    <button
                        type="button"
                        aria-label="编辑器引导"
                        class="editor-guide-trigger"
                        :class="catalogMode ? 'catalog-editor-guide' : 'absolute bottom-11 right--3 z-99999'"
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
import { isLocalPlugin } from './catalog'

const props = withDefaults(
    defineProps<{
        onePlugin: any
        catalogMode?: boolean
    }>(),
    { catalogMode: false },
)
const { menuSetup } = useForPreviewStore()
const publicPath = process.env.BASE_URL || '/'
const localPages = import.meta.glob('/src/plugins/*/pages/**/*.vue')
const sourcePlugin = (preview: any) => preview.sourcePluginConfig || props.onePlugin
const cardTitle = (preview: any) => preview.title || preview.name
const sourceLabel = (preview: any) => {
    const plugin = sourcePlugin(preview)
    return plugin.title || plugin.name
}
const mediaUrl = (src: string) => /^(https?:|data:|blob:)/.test(src) || src.startsWith('//') ? src : publicPath + src
const sourcePagePath = (preview: any) => {
    const plugin = sourcePlugin(preview)
    if (plugin.remotePluginMenu) return ''
    const page = plugin.pNode ? plugin.pNode + '/pages/' + plugin.name : plugin.name + '/pages'
    const path = 'src/plugins/' + page + '/' + preview.name + '.vue'
    return localPages['/' + path] ? path : ''
}
const sourcePageLabel = (preview: any) => {
    const plugin = sourcePlugin(preview)
    return plugin.pNode ? `${plugin.pNode} → ${plugin.name}/${preview.name}` : `${plugin.name} → ${preview.name}`
}
const sourceUrl = (preview: any) => {
    const plugin = sourcePlugin(preview)
    if (preview.disableSrcBtn) return ''
    if (preview.catalog?.sourceUrl) return preview.catalog.sourceUrl
    if (plugin.remotePluginMenu || preview.url) return ''
    const path = sourcePagePath(preview)
    return path ? 'https://gitee.com/ice-gl/icegl-three-vue-tres/blob/master/' + path : ''
}

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
    if (typeof uni === 'undefined' || !uni.getEnv) {
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
const toPage = (plugin: any, value: any) => {
    if (value.url) {
        return jumpType(value.url, false)
    }
    let path = `/plugins/${plugin.name}/${value.name}`
    if (plugin.pNode) {
        path = `/plugins/${plugin.pNode}/${plugin.name}/${value.name}`
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
.catalog-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 20px; }
.catalog-card { min-width: 0; transition: transform .28s cubic-bezier(.2, .7, .2, 1); }
.catalog-card :deep(.fes-card) {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1px solid var(--catalog-border);
    border-radius: 14px;
    background: var(--catalog-surface);
    color: var(--catalog-text);
    overflow: hidden;
    transition: border-color .18s, box-shadow .18s;
}
.catalog-card:hover :deep(.fes-card), .catalog-card:focus-within :deep(.fes-card) { border-color: var(--catalog-accent); box-shadow: var(--catalog-shadow); }
.catalog-card :deep(.fes-card__body) { display: flex; flex-direction: column; flex: 1; padding: 12px; color: var(--catalog-text); }
.catalog-card :deep(.preview-thumbnail), .catalog-card video {
    display: block;
    width: 100%;
    height: auto;
    max-height: none;
    aspect-ratio: 16 / 10;
    border-radius: 9px;
    background: var(--catalog-raised);
    object-fit: contain;
}
.catalog-card :deep(.preview-thumbnail img) { width: 100%; height: 100%; object-fit: contain; transition: transform .5s cubic-bezier(.2, .7, .2, 1); }
.catalog-card :deep(.fes-img__placeholder), .catalog-card :deep(.fes-img__error) { background: var(--catalog-raised); color: var(--catalog-muted); }
.catalog-card-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 9px; margin: 16px 2px 0; }
.catalog-card-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; margin: 0; color: var(--catalog-text); font-size: 15px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; transition: color .18s; }
.catalog-card:hover .catalog-card-title { color: var(--catalog-accent); }
.catalog-card-origin { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 8px; border: 1px solid color-mix(in srgb, var(--catalog-accent) 20%, transparent); border-radius: 6px; background: var(--catalog-active); color: var(--catalog-accent); font-size: 10px; font-weight: 500; line-height: 1.6; }
.catalog-card-meta { display: flex; align-items: center; gap: 10px; margin: 9px 2px 0; color: var(--catalog-faint); font-size: 11px; line-height: 1.6; }
.catalog-card-author { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.catalog-card-author > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-card-author > :first-child { flex-shrink: 0; font-size: 12px; }
.catalog-card-kind { flex-shrink: 0; margin-left: auto; }
.catalog-card-details { margin: 14px 2px 0; padding-top: 10px; border-top: 1px solid var(--catalog-border); font-size: 12px; color: var(--catalog-muted); overflow-wrap: anywhere; }
.catalog-card-details summary { cursor: pointer; }
.catalog-card-details summary:hover { color: var(--catalog-text); }
.catalog-card-details div { max-height: 180px; overflow: auto; padding-top: 8px; }
.catalog-card-details :deep(a) { color: var(--catalog-accent); }
.catalog-card-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.catalog-card .catalog-card-actions { margin-top: auto; padding: 16px 2px 2px; }
.catalog-card-code { display: inline-flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
.catalog-card-code a { flex-shrink: 0; }
.catalog-card-page { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--catalog-muted, #496bb4); font-family: inherit; font-size: 12px; line-height: 1.5; }
.catalog-card-actions a { color: var(--catalog-muted, #496bb4); font-size: 12px; text-decoration: none; }
.catalog-card-actions a:hover { color: var(--catalog-accent, #334e90); }
.catalog-demo-button { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; border: 0; border-radius: 7px; padding: 7px 11px; color: var(--catalog-button-text, #fff); background: var(--catalog-button, #334e90); font-size: 12px; cursor: pointer; transition: filter .18s; }
.catalog-demo-button:hover { filter: brightness(1.12); }
.catalog-demo-button span { transition: transform .18s; }
.catalog-demo-button:hover span { transform: translate(1px, -1px); }
.catalog-card-actions :is(a, button):focus-visible, .catalog-card-details summary:focus-visible { outline: 2px solid var(--catalog-accent, #334e90); outline-offset: 3px; }
.catalog-card > .tag-sheared { z-index: 1; width: auto; height: auto; right: 20px; top: 20px; margin: 0; padding: 2px 8px; font-size: 11px; line-height: 1.5; border-radius: 5px; transform: none; }
.catalog-card .catalog-editor-guide { position: absolute; top: 20px; left: 20px; z-index: 1; background: var(--catalog-surface); color: var(--catalog-accent); border-color: var(--catalog-border); box-shadow: none; }
.catalog-card .catalog-editor-guide .editor-guide-trigger__icon { color: inherit; }
@media (hover: hover) and (pointer: fine) {
    .catalog-card:hover { transform: translateY(-3px) scale(1.008); }
    .catalog-card:hover :deep(.preview-thumbnail img) { transform: scale(1.055); }
}
@media (prefers-reduced-motion: reduce) {
    .catalog-card, .catalog-card :deep(.fes-card), .catalog-card :deep(.preview-thumbnail img), .catalog-card-title, .catalog-demo-button, .catalog-demo-button span { transition: none; }
    .catalog-card:hover, .catalog-card:hover :deep(.preview-thumbnail img), .catalog-demo-button:hover span { transform: none; }
}

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
    color: var(--catalog-muted, #64748b);
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
    color: var(--catalog-text, #0f172a);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
    text-decoration: none;
    background: var(--catalog-raised, #f8fafc);
    transition:
        background-color 0.2s ease,
        color 0.2s ease,
        transform 0.2s ease;

    &:hover {
        background: var(--catalog-hover, #eff6ff);
        color: var(--catalog-accent, #1d4ed8);
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
