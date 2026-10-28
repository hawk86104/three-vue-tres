// Keep models, sky textures and the Draco decoder together when packaging water.
const publicPath = (window as Window & { __INJECTED_PUBLIC_PATH_BY_QIANKUN__?: string }).__INJECTED_PUBLIC_PATH_BY_QIANKUN__
    || import.meta.env.BASE_URL || './'
const base = new URL('plugins/water/oceanWeather/', new URL(publicPath, document.baseURI)).href

export const oceanAsset = (path: string) => `${base}${path}`
