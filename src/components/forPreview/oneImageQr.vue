<template>
    <div v-if="hasPreview">
        <FTooltip mode="popover" :offset="-248" placement="bottom" :getContainer="getContainer" :disabled="detectDeviceType() !== 'PC'">
            <FImage class="w-full max-h-70 h-14em" fit="contain" :src="imgSrc()" lazy />
            <template #content>
                <div class="one-image-qr-popover">
                    <div class="one-item-qrcode">
                        <span>H5移动端</span>
                        <FImage class="one-item-qrcode__image" :src="urlMobile" @error="errH5Img">
                            <template #placeholder>
                                <div class="image-slot">
                                    <div class="image-slot">生成中<span class="dot">...</span></div>
                                </div>
                            </template>
                        </FImage>
                    </div>
                    <div class="one-item-qrcode" style="border-left: 2px #a2a2a2 dashed">
                        <span>微信小程序</span>
                        <FImage class="one-item-qrcode__image" :src="urlmini" @error="errMiNiImg">
                            <template #placeholder>
                                <div class="image-slot">
                                    <div class="image-slot">生成中<span class="dot">...</span></div>
                                </div>
                            </template>
                        </FImage>
                    </div>
                </div>
            </template>
        </FTooltip>
    </div>
    <div v-else>
        <FImage class="w-full max-h-70 h-14em" fit="contain" :src="imgSrc()" lazy />
    </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { FImage, FTooltip } from '@fesjs/fes-design'
import { detectDeviceType } from '../../common/utils'

const props = defineProps({
    onePreview: {
        default: {
            src: '',
            type: '',
            name: '',
            url: '',
        },
    },
    onePlugin: {
        default: {},
    } as any,
})

const publicPath = process.env.BASE_URL
const imgSrc = () => {
    let url = props.onePreview.src
    if (!url.startsWith('http')) {
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

const refreshQrImage = async (generateUrl: string, imageUrl: string, target: typeof urlMobile) => {
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

const getContainer = (container: any) => {
    return document.querySelector('#right-page-list-id')
}
</script>
<style lang="less">
.fes-tooltip-confirm,
.fes-tooltip-popover {
    background-color: #000000ab;
}
.one-image-qr-popover {
    width: 360px;
    height: 220px;
    display: flex;
    justify-content: center;
    align-items: center;
}
.one-item-qrcode {
    width: 50%;
    color: white;
    text-align: center;
    font-size: 16px;
    font-weight: bolder;
    &__image {
        width: 160px;
        height: 160px;
        margin: 8px auto;
        display: block;

        img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
    }
}
</style>
<style lang="less" scoped></style>
