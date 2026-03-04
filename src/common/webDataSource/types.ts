export interface TvTDataSourceConfig {
  id: string
  url: string
  method?: 'GET' | 'POST'
  interval?: number
  headers?: Record<string, string>
  body?: any
}

export interface TvTBindingConfig {
  id: string
  active?: boolean
  objectId: string
  dataSourceId: string
  handler: string
}