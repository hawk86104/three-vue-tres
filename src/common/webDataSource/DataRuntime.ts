import { DataSource } from './DataSource'
import { BindingManager } from './BindingManager'
import type { TvTDataSourceConfig, TvTBindingConfig } from './types'

export class DataRuntime {
	public dataSources = new Map()
	public bindingManager: BindingManager

	constructor() {
		this.bindingManager = new BindingManager(this.dataSources)
	}

	registerDataSource(config: TvTDataSourceConfig) {
		const ds = new DataSource(config)
		this.dataSources.set(config.id, ds)
		ds.start()
	}

	bind(bindingConfig: TvTBindingConfig, target: any) {
		this.bindingManager.bind(bindingConfig, target)
	}

	destroy() {
		this.dataSources.forEach(ds => ds.stop())
		this.dataSources.clear()
	}
}