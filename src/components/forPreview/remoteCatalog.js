// 线上插件尚未发布 catalog 字段时的明确迁移配置。线上自身 catalog 发布后优先使用。
const entry = (type, category) => ({ type, category })
const b = (category) => entry('block', category)
const s = (category) => entry('scene', category)
const a = (category) => entry('application', category)
const t = (category) => entry('tool', category)

export default {
    zone3Deditor: { catalog: t('scene'), preview: { pluginOne: s('industry') } },
    eMRIscan: { catalog: a('medical') },
    digitalMapBlock: { catalog: b('gis'), preview: { baseFloorA: b('environment'), baseFloorB: b('environment'), particlesTextureEnv: b('effects'), flyLines: b('effects'), spaceLines: b('effects'), cubeAnnotationHtml: b('ui'), cubeAnnotationMeshUI: b('ui'), mapShowHtml: s('city'), mapShowMeshUI: s('city'), scenarioA: s('city'), scenarioB: s('city') } },
    tvtAirport: { catalog: s('transport') },
    tvtSubstation: { catalog: a('energy') },
    networkLinkTopology: { catalog: a('infrastructure'), preview: { editor: t('ui') } },
    AIModels: { catalog: t('ai') },
    tvtViewHelper: { catalog: b('interaction') },
    tvtCharts: { catalog: b('ui'), preview: { shippingMonitoring: a('logistics'), sampleCar: a('data') } },
    showCabinet: { catalog: a('infrastructure') },
    tvtVolumeRendering: { catalog: b('rendering'), preview: { temperatureCreater: t('resources'), roomTemperature: s('industry'), earthTemperature: s('city'), earthNcFile: s('city') } },
    dxf2mesh: { catalog: t('resources') },
    metaHuman: { catalog: b('rendering') },
    humanMedicine: { catalog: a('medical') },
    indoorMap: { catalog: s('city') },
    topoEditor: { catalog: t('ui') },
    topoProject: { catalog: a('infrastructure') },
    communityMetaverse: { catalog: a('education') },
    singleLayerEarth: { catalog: b('gis') },
    useThreeGeospatial: { catalog: b('gis') },
    smartPark: { catalog: a('city') },
    zoneMachinRoom: { catalog: a('infrastructure') },
    zoneRefiningIndustry: { catalog: a('industry') },
    smartFactory: { catalog: a('industry'), preview: { sceneModel: s('industry') } },
    zoneOfficeFloor: { catalog: s('industry') },
    smartOilDepot: { catalog: a('energy') },
    zoneLowAltitudeUAV: { catalog: s('transport') },
    zonePixelLowMachinRoom: { catalog: s('industry') },
    superFactory: { catalog: a('industry') },
    zonePlasticProducts: { catalog: s('industry') },
    zoneSmartWarehouse: { catalog: a('logistics') },
    flameFires: { catalog: b('effects') },
    txWikiChart: { catalog: a('data') },
    map2BuildingRoad: { catalog: t('gis') },
    materialEditor: { catalog: t('material') },
    gisPlaneEditor: { catalog: t('gis'), preview: { sceneConfig1: s('city'), sceneConfig2: s('city') } },
    animationEditor: { catalog: t('animation') },
    freeDigitalHome: { catalog: a('home'), preview: { demo: s('industry') } },
    yht: { catalog: a('education') },
}
