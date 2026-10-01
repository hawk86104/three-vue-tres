// WebP 容器规范：https://developers.google.com/speed/webp/docs/riff_container
const PLAYBACK_RATE = 2
const fourCC = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))

export function createPreviewWebp(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer)
    if (bytes.length < 12 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') return null

    const view = new DataView(buffer)
    const end = view.getUint32(4, true) + 8
    if (end > bytes.length) throw new Error('Incomplete WebP')

    const animation = bytes.slice(0, end)
    const animationView = new DataView(animation.buffer)
    const posterChunks: Uint8Array<ArrayBuffer>[] = []
    let frameCount = 0
    let posterSize = 12
    for (let offset = 12; offset < end;) {
        if (offset + 8 > end) throw new Error('Incomplete WebP chunk')
        const size = view.getUint32(offset + 4, true)
        const next = offset + 8 + size + (size % 2)
        if (next > end) throw new Error('Incomplete WebP chunk')
        const type = fourCC(bytes, offset)
        const chunk = bytes.slice(offset, next)
        if (type === 'ANMF') {
            if (size < 16) throw new Error('Incomplete WebP frame')
            frameCount += 1
            // ANMF 的帧时长是从 payload 第 12 字节起的 24 位毫秒数。
            const durationOffset = offset + 20
            const duration = bytes[durationOffset] | (bytes[durationOffset + 1] << 8) | (bytes[durationOffset + 2] << 16)
            const fasterDuration = Math.max(20, Math.round(duration / PLAYBACK_RATE))
            animation[durationOffset] = fasterDuration & 0xff
            animation[durationOffset + 1] = (fasterDuration >> 8) & 0xff
            animation[durationOffset + 2] = (fasterDuration >> 16) & 0xff
            if (frameCount > 1) {
                offset = next
                continue
            }
        } else if (type === 'ANIM') {
            if (size < 6) throw new Error('Incomplete WebP animation')
            // 首帧容器只播放一次；悬停容器循环播放。
            new DataView(chunk.buffer).setUint16(12, 1, true)
            animationView.setUint16(offset + 12, 0, true)
        }
        posterChunks.push(chunk)
        posterSize += chunk.length
        offset = next
    }
    if (frameCount < 2) return null

    // 保留首帧的画布、偏移、透明度和色彩信息，只移除后续帧。
    const header = bytes.slice(0, 12)
    new DataView(header.buffer).setUint32(4, posterSize - 8, true)
    return {
        poster: new Blob([header, ...posterChunks], { type: 'image/webp' }),
        animation: new Blob([animation], { type: 'image/webp' }),
    }
}
