import type { TvTBindingConfig } from './types'

export class BindingManager {
  private bindings = [] as any[]
  private dataSources: Map<string, any>

  constructor(dataSources: Map<string, any>) {
    this.dataSources = dataSources
  }

  bind(bindingConfig: TvTBindingConfig,target:any) {
    const object = target

    const dataSource = this.dataSources.get(bindingConfig.dataSourceId)
    if (!dataSource) {
      console.warn('DataSource not found:', bindingConfig.dataSourceId)
      return
    }

    const handlerFn = new Function(
      'data',
      'object',
      `return (${bindingConfig.handler})(data, object)`
    )

    dataSource.subscribe({
      active: bindingConfig.active,
      fun: (data: any) => {
        handlerFn(data, object)
      }
    })

    this.bindings.push(bindingConfig)
  }
}