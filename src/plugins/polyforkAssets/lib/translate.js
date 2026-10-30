const translateUrl = 'https://translate.icegl.cn/api/translate'

export async function translateToEnglish(query) {
    const params = new URLSearchParams({ q: query })
    let response
    try {
        response = await fetch(`${translateUrl}?${params}`)
    } catch {
        throw new Error('无法连接翻译服务，请检查网络或跨域配置，也可以使用英文关键词')
    }
    if (!response.ok) throw new Error(`翻译服务返回 ${response.status}`)

    const result = await response.json().catch(() => null)
    const translation = typeof result?.translation === 'string' ? result.translation.trim() : ''
    if (!result?.success || !translation) throw new Error('翻译服务没有返回有效结果')
    return translation
}
