// 内容目录与插件发布方式独立；preview.catalog 优先于插件级 catalog。
export const catalogTypes = [
    { id: 'block', title: 'Blocks 基础能力', categories: { interaction: '基础与交互', material: '材质与 Shader', lighting: '光影与后处理', effects: '特效与动画', ui: 'UI / 标注 / 图表', environment: '环境 / 地面 / 水体', gis: 'GIS / 空间能力', rendering: '模型 / 渲染', physics: '物理 / XR' } },
    { id: 'scene', title: 'Scenes 场景案例', categories: { city: '城市 / GIS', industry: '工业 / 园区', product: '产品 / 电商', medical: '医疗 / 科研', transport: '海洋 / 交通', art: '艺术 / 创意', reality: '高斯 / 实景' } },
    { id: 'application', title: 'Applications 行业应用', categories: { industry: '工业数字孪生', city: '城市 / 园区', logistics: '仓储 / 物流', energy: '能源 / 管网', medical: '医疗 / 科研', data: '数据 / 金融', education: '文旅 / 教育', infrastructure: '机房 / 网络', home: '智能家居' } },
    { id: 'tool', title: 'Tools 创作与工程', categories: { scene: '场景编辑', gis: 'GIS 编辑', animation: '动画编辑', material: '材质编辑', ui: 'UI / 大屏编辑', ai: 'AI 内容生成', integration: '工程集成', resources: '资源 / 动态组件' } },
]

export function createCatalog(configs, remoteCatalog, menuSetup = {}) {
    const entries = []
    for (const [pluginKey, plugin] of Object.entries(configs)) {
        for (const group of plugin.child || [plugin]) {
            const source = group === plugin ? plugin : { ...plugin, ...group, pNode: group.pNode || pluginKey }
            const defaults = remoteCatalog[pluginKey] || {}
            ;(group.preview || []).forEach((preview, index) => {
                const catalog = preview.catalog || group.catalog || plugin.catalog || defaults.preview?.[preview.name] || defaults.catalog || {}
                const type = catalogTypes.find((item) => item.id === catalog.type && item.categories[catalog.category])
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
    const groups = catalogTypes.map((type) => ({
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
