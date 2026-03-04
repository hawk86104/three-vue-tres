import type { TvTDataSourceConfig } from './types'

export class DataSource {
  constructor(public config: TvTDataSourceConfig) {}

  private timer: any = null
  private listeners: any[] = []
  private hasFetched = false

  start() {
    const interval = this.config.interval ?? 5000

    // interval = 0 → 只执行一次
    if (interval === 0) {
      this.fetch()
      return
    }

    // 先执行一次
    this.fetch()

    this.timer = setInterval(() => {
      this.fetch()
    }, interval)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  subscribe(cb: any) {
    this.listeners.push(cb)    // 如果是单次模式，并且还没请求过
    if (this.config.interval === 0 && !this.hasFetched) {
      this.fetch()
    }
  }

  private async fetch() {
    try {
      // 如果没有有效监听者，不请求
      if (
        this.listeners.length === 0 ||
        this.listeners.every(cb => cb.active === false)
      ) {
        return
      }

      const res = await fetch(this.config.url, {
        method: this.config.method || 'GET',
        headers: this.config.headers,
        body: this.config.body
          ? JSON.stringify(this.config.body)
          : undefined
      })

      const data = await res.json()
      this.hasFetched = true

      this.listeners.forEach(cb => {
        if (cb.active !== false) {
          cb.fun(data)
        }
      })
    } catch (err) {
      console.error('[DataSource Error]', err)
    }
  }
}