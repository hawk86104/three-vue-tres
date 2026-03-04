import { DataRuntime } from './DataRuntime'
import { useSeek } from 'PLS/basic'
import { watch, nextTick } from 'vue'

let runtime: DataRuntime | null = null
let dataSourceInitialized = false

export const useWebDataRuntime = () => {

	// 1️⃣ 获取单例 runtime
	if (!runtime) {
		runtime = new DataRuntime()
	}

	// 2️⃣ 初始化数据源（只执行一次）
	const initializeDataSources = (dataSources: any[]) => {
		if (dataSourceInitialized) return

		dataSources.forEach((ds: any) => {
			runtime!.registerDataSource(ds)
		})

		dataSourceInitialized = true
	}

	// 3️⃣ 绑定场景对象
	const bindScenes = (bindings: any[], hasAllFinished: any) => {
		watch(hasAllFinished, (newVal) => {
			if (newVal) {
				nextTick(() => {
					setTimeout(() => {
						const scene = window.globalTvtuseTres?.scene
						bindings.forEach(b => {
							let target: any = null
							target = useSeek().seek(scene, 'uuid', b.objectId)
							if (!target) {
								console.warn('绑定数据源目标对象未找到:', b.objectId)
							} else {
								runtime!.bind(b, target)
							}
						})
					}, 1500)
				})
			}
		}, { immediate: true })
	}

	return {
		runtime,
		initializeDataSources,
		bindScenes
	}
}