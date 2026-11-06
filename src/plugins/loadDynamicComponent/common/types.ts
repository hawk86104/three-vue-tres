/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-12-29 09:38:33
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-29 09:38:38
 */
export interface RemoteComponentConfig {
  name: string
  type: string
  comFile: string
  category?: string
	previewPath?: string
	default?:any
	defaultObject3D?:any
	config?:any
}

export interface RemotePluginConfig {
  name: string
  version: string
  description?: string
  categories?: readonly { id: string; name: string }[]
  defaultCategory?: string
  components: RemoteComponentConfig[]
}
