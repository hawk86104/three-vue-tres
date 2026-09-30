import { shallowRef } from 'vue'

const CATALOG_TYPES_CACHE_KEY = 'tvt-catalog-types'
const normalizeCatalogTypes = (types) => {
    if (!Array.isArray(types)) return []
    return types.filter((type) => type && typeof type.id === 'string' && type.id && typeof type.title === 'string'
        && Object.prototype.toString.call(type.categories) === '[object Object]')
        .map((type) => ({
            id: type.id,
            title: type.title,
            categories: Object.fromEntries(Object.entries(type.categories).filter(([, title]) => typeof title === 'string')),
        }))
}

const readCachedCatalogTypes = () => {
    try {
        return normalizeCatalogTypes(JSON.parse(localStorage.getItem(CATALOG_TYPES_CACHE_KEY) || '[]'))
    } catch {
        return []
    }
}

// 字典由社区后台发布；缓存仅用于离线时复用，不在前台维护第二份定义。
export const catalogTypes = shallowRef(readCachedCatalogTypes())

export function setCatalogTypes(types) {
    if (!Array.isArray(types)) return
    const normalized = normalizeCatalogTypes(types)
    if (types.length && !normalized.length) return
    catalogTypes.value = normalized
    try {
        localStorage.setItem(CATALOG_TYPES_CACHE_KEY, JSON.stringify(normalized))
    } catch { /* 存储不可用时仍使用本次接口返回的分类 */ }
}

// 内容目录与插件发布方式独立；preview.catalog 优先于插件级 catalog。
export function createCatalog(configs, menuSetup = {}) {
    const entries = []
    for (const [pluginKey, plugin] of Object.entries(configs)) {
        for (const group of plugin.child || [plugin]) {
            const source = group === plugin ? plugin : { ...plugin, ...group, pNode: group.pNode || pluginKey }
            ;(group.preview || []).forEach((preview, index) => {
                const catalog = { ...plugin.catalog, ...group.catalog, ...preview.catalog }
                const type = catalogTypes.value.find((item) => item.id === catalog.type && item.categories[catalog.category])
                const status = menuSetup[group.name]?.[preview.name]
                entries.push({
                    ...preview,
                    catalog,
                    id: `${pluginKey}/${group === plugin ? '' : group.name + '/'}${preview.name}/${index}`,
                    section: type ? `${type.id}/${catalog.category}` : 'unclassified',
                    sourcePluginConfig: source,
                    status: status?.taglist || '',
                    searchText: [preview.name, preview.title, pluginKey, plugin.title, group.title, type?.title, type?.categories[catalog.category], ...(catalog.tags || [])].join(' ').toLocaleLowerCase(),
                })
            })
        }
    }
    return entries
}

export function groupCatalog(entries) {
    const groups = catalogTypes.value.map((type) => ({
        ...type,
        sections: Object.entries(type.categories).map(([category, title]) => {
            const id = `${type.id}/${category}`
            return { id, name: id, title, preview: entries.filter((item) => item.section === id) }
        }).filter((section) => section.preview.length),
    }))
    const unclassified = entries.filter((item) => item.section === 'unclassified')
    if (unclassified.length) groups.push({ id: 'unclassified', title: '待分类', sections: [{ id: 'unclassified', name: 'unclassified', title: '待分类内容', preview: unclassified }] })
    return groups.map((group) => ({ ...group, count: group.sections.reduce((count, section) => count + section.preview.length, 0) }))
}
