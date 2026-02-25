/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-03-27 22:08:16
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-02-25 10:52:34
 */

import environmentForLightformers from './components/environmentForLightformers.vue'
import skyBoxAmesh from './components/skyBoxAmesh.vue'
import skyBoxBmesh from './components/skyBoxBmesh.vue'
import skyBoxDmesh from './components/skyBoxDmesh.vue'
import groundProjectedEnv from './components/groundProjectedEnvCom.vue'
import basiceEnv from './components/basiceEnv.vue'

const HDRfileList = {
	sunset: 'belfast_sunset_puresky_1k.hdr',
	desert: 'desert_1k.hdr',
	room: 'abandoned_games_room_02_1k.hdr',
	canary: 'canary_wharf_1k.hdr',
	outdoor: 'outdoor_umbrellas_1k.hdr',
	haven: 'poly_haven_studio_1k.hdr',
	shanghai: 'shanghai_bund_1k.hdr',
	hangar: 'small_hangar_01_1k.hdr',
	snowy: 'snowy_forest_path_01_1k.hdr',
}
// const HDRfilePath = process.env.NODE_ENV === 'development' ? 'resource.cos' : 'https://opensource.cdn.icegl.cn'
const HDRfilePath = './plugins/skyBox/hdr/'

export { environmentForLightformers, skyBoxAmesh, groundProjectedEnv, skyBoxBmesh, skyBoxDmesh, basiceEnv, HDRfileList, HDRfilePath }
