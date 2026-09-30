<template>
    <div v-if="!qrOnly" class="preview-image-frame">
        <FImage class="preview-thumbnail w-full max-h-70 h-14em" fit="contain" :src="imgSrc()" :alt="onePreview.title || onePreview.name" :lazy="false" />
    </div>
    <template v-else-if="hasPreview">
        <button ref="qrTrigger" type="button" class="mobile-preview-trigger" :aria-label="'移动端预览：' + (onePreview.title || onePreview.name)" :aria-expanded="showQr" @mouseenter="openQr" @mouseleave="scheduleQrClose" @click.stop="openQr" @focus="openQr" @blur="closeQr" @keydown.esc.stop="closeQr">
            <QrCodeOutline /><span>移动端预览</span>
        </button>
        <NPopover
            v-model:show="showQr"
            trigger="manual"
            placement="top-end"
            :x="qrPosition.x"
            :y="qrPosition.y"
            :show-arrow="false"
            :theme-overrides="{ color: 'var(--catalog-surface, #fff)', textColor: 'var(--catalog-text, #18181b)', borderRadius: '14px', boxShadow: '0 12px 40px #00000030' }"
            @clickoutside="onQrClickOutside"
        >
            <div class="one-image-qr-popover" @mouseenter="cancelQrClose" @mouseleave="scheduleQrClose">
                <div class="qr-popover-heading">
                    <div><strong>扫码体验</strong><p>{{ onePreview.title || onePreview.name }}</p></div>
                    <button type="button" aria-label="关闭二维码" @mousedown.prevent @click="closeQr"><CloseOutline /></button>
                </div>
                <div class="qr-popover-grid">
                    <div class="one-item-qrcode">
                        <FImage class="one-item-qrcode__image" :src="urlMobile" alt="H5移动端二维码" @error="errH5Img">
                            <template #placeholder><span class="qr-image-status">加载中…</span></template>
                            <template #error><span class="qr-image-status">二维码暂不可用</span></template>
                        </FImage>
                        <strong>H5 移动端</strong><span>手机浏览器打开</span>
                    </div>
                    <div class="one-item-qrcode">
                        <FImage class="one-item-qrcode__image" :src="urlmini" alt="微信小程序二维码" @error="errMiNiImg">
                            <template #placeholder><span class="qr-image-status">加载中…</span></template>
                            <template #error><span class="qr-image-status">二维码暂不可用</span></template>
                        </FImage>
                        <strong>微信小程序</strong><span>微信扫一扫打开</span>
                    </div>
                </div>
            </div>
        </NPopover>
    </template>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { FImage } from '@fesjs/fes-design'
import { NPopover } from 'naive-ui'
import { CloseOutline, QrCodeOutline } from '@vicons/ionicons5'

const props = defineProps({
    onePreview: {
        default: {
            src: '',
            title: '',
            type: '',
            name: '',
            url: '',
        },
    },
    onePlugin: {
        default: {},
    } as any,
    qrOnly: Boolean,
})

const showQr = ref(false)
const qrTrigger = ref<HTMLButtonElement | null>(null)
const qrPosition = ref({ x: 0, y: 0 })
let qrCloseTimer: ReturnType<typeof setTimeout> | undefined
const cancelQrClose = () => clearTimeout(qrCloseTimer)
const closeQr = () => {
    cancelQrClose()
    showQr.value = false
}
const onQrClickOutside = (event: MouseEvent) => {
    if (!qrTrigger.value?.contains(event.target as Node)) closeQr()
}
const scheduleQrClose = () => {
    cancelQrClose()
    if (showQr.value) qrCloseTimer = setTimeout(closeQr, 180)
}
const openQr = (event: Event) => {
    cancelQrClose()
    const trigger = event.currentTarget as HTMLElement
    const card = trigger.closest('.fes-card') || trigger
    // 对齐卡片右边界，纵向仍放在操作按钮上方。
    qrPosition.value = { x: card.getBoundingClientRect().right, y: trigger.getBoundingClientRect().top }
    showQr.value = true
}
watch(showQr, (visible, _, onCleanup) => {
    if (!visible) return
    // 手动定位的浮层在页面位置变化时收起，避免与卡片错位。
    window.addEventListener('scroll', closeQr, true)
    window.addEventListener('resize', closeQr)
    onCleanup(() => {
        cancelQrClose()
        window.removeEventListener('scroll', closeQr, true)
        window.removeEventListener('resize', closeQr)
    })
})
const publicPath = process.env.BASE_URL || '/'
const imgSrc = () => {
    let url = props.onePreview.src
    if (!/^(https?:|data:|blob:|\/\/)/.test(url)) {
        url = publicPath + url
    }
    return url
}

const createQrCacheKey = (value: string) => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `v2-${value.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

let hasPreview = true
let comUrl = 'https://oss.icegl.cn/#/plugins/'
if (props.onePreview.url) {
    comUrl = props.onePreview.url
    if (props.onePreview.url.startsWith('https://www.icegl.cn/tvtstore/') || props.onePreview.url.startsWith('https://www.bilibili.com/')) {
        hasPreview = false
    }
} else {
    if (props.onePlugin.pNode) {
        comUrl += props.onePlugin.pNode + '/'
    }
    comUrl += props.onePlugin.name + '/'
    comUrl += props.onePreview.name + '/'
}
if (!process.env.FES_APP_ONLINE_API) {
    hasPreview = false
}
const imgName = createQrCacheKey(comUrl)
const encodedComUrl = encodeURIComponent(comUrl)
const miniPre = encodeURIComponent(`https://www.icegl.cn/addons/tvt/mini/onePreview?urlPath=${encodedComUrl}`)
const qrStyleParams = 'logo=1&labelalignment=center&background=%23ffffff&size=360&padding=12&logosize=32&errorlevel=quartile'
const mobileQrSrc = `https://www.icegl.cn/uploads/qrcode/b-${imgName}.png`
const miniQrSrc = `https://www.icegl.cn/uploads/qrcode/m-${imgName}.png`
const urlMobile = ref(mobileQrSrc)
const urlmini = ref(miniQrSrc)
const regenerationAttempted = new Set<string>()

const refreshQrImage = async (generateUrl: string, imageUrl: string, target: typeof urlMobile) => {
    // 一个二维码只尝试生成一次，避免图片服务异常时反复请求。
    if (regenerationAttempted.has(imageUrl)) return
    regenerationAttempted.add(imageUrl)
    try {
        const response = await fetch(generateUrl)
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }
        target.value = `${imageUrl}?t=${Date.now()}`
    } catch (error) {
        console.error('Error generating QR code:', error)
    }
}

const errH5Img = () => {
    const generateUrl = `https://icegl.cn/addons/qrcode/index/show?text=${encodedComUrl}&foreground=%23333333&${qrStyleParams}&imgName=b-${imgName}`
    refreshQrImage(generateUrl, mobileQrSrc, urlMobile)
}
const errMiNiImg = () => {
    const generateUrl = `https://icegl.cn/addons/qrcode/index/show?text=${miniPre}&foreground=%2300367b&${qrStyleParams}&imgName=m-${imgName}`
    refreshQrImage(generateUrl, miniQrSrc, urlmini)
}

</script>
<style lang="less" scoped>
.preview-image-frame { overflow: hidden; border-radius: 9px; }
.mobile-preview-trigger { display: inline-flex; align-items: center; gap: 5px; padding: 6px 0; border: 0; background: transparent; color: var(--catalog-muted, #62626e); font: inherit; font-size: 12px; cursor: pointer; }
.mobile-preview-trigger svg { width: 15px; height: 15px; }
.mobile-preview-trigger:hover, .mobile-preview-trigger[aria-expanded='true'] { color: var(--catalog-accent, #5384ff); }
.mobile-preview-trigger:focus-visible { outline: 2px solid var(--catalog-accent, #5384ff); outline-offset: 3px; border-radius: 4px; }
.one-image-qr-popover {
    width: min(344px, calc(100vw - 56px));
    color: var(--catalog-text, #18181b);
}
.qr-popover-heading { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 14px; }
.qr-popover-heading strong { font-size: 14px; }
.qr-popover-heading p { margin: 4px 0 0; color: var(--catalog-muted, #62626e); font-size: 12px; overflow-wrap: anywhere; }
.qr-popover-heading button { flex-shrink: 0; display: grid; place-items: center; padding: 4px; border: 0; border-radius: 5px; background: var(--catalog-raised, #f4f4f5); color: var(--catalog-muted, #62626e); cursor: pointer; }
.qr-popover-heading svg { width: 16px; height: 16px; }
.qr-popover-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.one-item-qrcode { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; text-align: center; }
.one-item-qrcode__image { display: block; width: 100%; aspect-ratio: 1; padding: 6px; margin-bottom: 5px; box-sizing: border-box; border-radius: 10px; overflow: hidden; background: #fff; }
.one-item-qrcode__image :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.one-item-qrcode strong { font-size: 12px; font-weight: 600; }
.one-item-qrcode > span { color: var(--catalog-muted, #62626e); font-size: 11px; }
.qr-image-status { display: grid; place-items: center; height: 100%; color: #62626e; font-size: 12px; }
</style>
