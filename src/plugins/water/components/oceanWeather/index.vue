<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { OrbitControls } from '@tresjs/cientos'
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import type { OceanScene } from './OceanScene'
import OceanExperience from './experience.vue'
import { WEATHER_YEAR, formatWeatherDay, normalizeLocalDate, type WeatherSnapshot } from './weather'
import { defaultSettings, rememberedSettings, presets, type CameraMode, type WaterSettings } from './settings'

const canvasKey = ref(0)
const initialPosition: [number, number, number] = [17, 11, 37]
const initialTarget: [number, number, number] = [-4, 6, -3]
const settings = reactive<WaterSettings>({ ...rememberedSettings })
const weather = reactive<WeatherSnapshot>({ dayOfYear: settings.dayOfYear, timeOfDay: settings.timeOfDay, sunElevation: 0, sunAzimuth: 0 })
const mode = ref<CameraMode>('orbit')
const fps = ref(0)
const speed = ref(0)
const underwater = ref(false)
const loading = ref(true)
const progress = ref(0)
const loadingText = ref('正在加载海岛与木帆船')
const error = ref('')
const panelOpen = ref(true)
const toast = ref('')
let engine: OceanScene | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
const events = new AbortController()
const clockText = computed(() => {
  const minutes = Math.floor(weather.timeOfDay * 60 + 1e-6) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})
const modeOptions: { value: CameraMode; name: string; key: string }[] = [
  { value: 'orbit', name: '环绕', key: '1' }, { value: 'fly', name: '漫游', key: '2' }, { value: 'boat', name: '航行', key: '3' },
]
function selectMode(next: CameraMode) { mode.value = next; engine?.setMode(next) }
function applyPreset() {
  const preset = presets[settings.preset as keyof typeof presets]
  Object.assign(settings, { wind: preset.wind, wavelength: preset.wavelength, dayOfYear: 170, timeOfDay: preset.timeOfDay, animateTime: false, clouds: preset.clouds })
  engine?.setWeatherDate(170, preset.timeOfDay)
}
function seekWeather(event: Event, field: 'dayOfYear' | 'timeOfDay') {
  const control = event.target as HTMLInputElement
  const current = engine?.getWeather() ?? weather
  const value = control.valueAsNumber
  if (!Number.isFinite(value)) { control.value = String(current[field]); return }
  const next = normalizeLocalDate(field === 'dayOfYear' ? value : current.dayOfYear, field === 'timeOfDay' ? value : current.timeOfDay)
  engine?.setWeatherDate(next.dayOfYear, next.timeOfDay)
  Object.assign(weather, next)
  Object.assign(settings, next, { animateTime: false })
}
function toggleTimeAnimation() {
  const current = engine?.getWeather() ?? weather
  Object.assign(settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay, animateTime: !settings.animateTime })
}
function stopTimeForEdit() {
  if (!settings.animateTime) return
  const current = engine?.getWeather() ?? weather
  Object.assign(settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay, animateTime: false })
}
function reset() {
  Object.assign(settings, defaultSettings)
  engine?.setWeatherDate(defaultSettings.dayOfYear, defaultSettings.timeOfDay)
  mode.value = 'orbit'
  engine?.resetCamera()
}
function dive() { mode.value = 'fly'; engine?.underwaterView() }
function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.value = '', 3000)
}
function initialize() {
  engine = undefined
  error.value = ''; loading.value = true; progress.value = 0
  canvasKey.value++
}
function onProgress(percent: number, label: string) { progress.value = percent; loadingText.value = label }
function onError(message: string) { error.value = message; loading.value = false }
function onStats(value: number, submerged: boolean, knots: number) { fps.value = value; underwater.value = submerged; speed.value = knots }
watch(settings, value => engine?.applySettings(value), { deep: true })
onMounted(() => {
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable)) return
    const next = modeOptions.find(option => option.key === event.key)
    if (next) selectMode(next.value)
    if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); settings.paused = !settings.paused }
    if (event.key.toLowerCase() === 'h') panelOpen.value = !panelOpen.value
  }, { signal: events.signal })
})
onBeforeUnmount(() => {
  const current = engine?.getWeather() ?? weather
  Object.assign(rememberedSettings, settings, { dayOfYear: current.dayOfYear, timeOfDay: current.timeOfDay })
  events.abort(); clearTimeout(toastTimer)
})
</script>

<template>
  <section class="water-scene" aria-label="海洋场景">
    <div class="water-canvas">
      <TresCanvas :key="canvasKey" :dpr="settings.pixelRatio" :antialias="true" :alpha="false" :shadows="true"
        power-preference="high-performance" :tone-mapping="ACESFilmicToneMapping"
        :tone-mapping-exposure="0.95" :shadow-map-type="PCFSoftShadowMap" :output-color-space="SRGBColorSpace">
        <TresPerspectiveCamera :position="initialPosition" :fov="48" :near="0.15" :far="16000" />
        <OrbitControls make-default :target="initialTarget" :enable-damping="true" :damping-factor="0.065"
          :min-distance="3" :max-distance="650" :max-polar-angle="Math.PI * 0.78" />
        <OceanExperience :settings="settings" @engine="engine = $event" @progress="onProgress"
          @ready="loading = false" @error="onError" @weather="Object.assign(weather, $event)" @stats="onStats" />
      </TresCanvas>
    </div>
    <aside class="camera-panel glass-panel" aria-label="视角控制">
      <div class="fps-readout"><strong :class="{ slow: fps < 30 }">{{ fps || '—' }}</strong><span>FPS</span></div>
      <div class="camera-modes">
        <button v-for="option in modeOptions" :key="option.value" :class="{ active: mode === option.value }" :aria-pressed="mode === option.value" @click="selectMode(option.value)"><b>{{ option.key }}</b><span>{{ option.name }}</span></button>
      </div>
      <div class="camera-help" v-if="mode === 'orbit'"><span>旋转视角 <kbd>左键</kbd></span><span>平移视角 <kbd>右键</kbd></span><span>拉近 / 远离 <kbd>滚轮</kbd></span></div>
      <div class="camera-help" v-else-if="mode === 'fly'"><span>前后 / 左右 <kbd>W A S D</kbd></span><span>下潜 / 上浮 <kbd>Q / E</kbd></span><span>加速漫游 <kbd>Shift</kbd></span><span>转动视角 <kbd>左键</kbd></span></div>
      <div class="camera-help" v-else><span>前进 / 后退 <kbd>W / S</kbd></span><span>左转 / 右转 <kbd>A / D</kbd></span><span>航行速度 <em>{{ speed.toFixed(1) }} kn</em></span></div>
      <button class="dive-button" @click="dive">⌁ <span>探索水下世界</span></button>
    </aside>
    <button class="panel-toggle glass-panel" :aria-expanded="panelOpen" @click="panelOpen = !panelOpen" :title="panelOpen ? '隐藏参数 H' : '显示参数 H'">{{ panelOpen ? '收起参数 ›' : '‹ 场景参数' }}</button>
    <aside v-show="panelOpen" class="settings-panel glass-panel" aria-label="海洋参数">
      <header class="panel-heading"><div>WATER <b>& WEATHER</b></div><span>OCEAN · ATMOSPHERE</span></header>
      <div class="settings-body">
        <label class="select-control"><span>天气预设 <small>ENVIRONMENT</small></span><select v-model="settings.preset" aria-label="环境预设" @change="applyPreset"><option v-for="(_, name) in presets" :key="name">{{ name }}</option></select></label>
        <details class="weather-group" open>
          <summary>local date <small>太阳与季节</small></summary>
          <div class="weather-content">
            <div class="weather-location">{{ WEATHER_YEAR }} · 东京 · 本地太阳时 <span>{{ formatWeatherDay(weather.dayOfYear) }}</span></div>
            <div class="weather-control">
              <label for="weather-day">dayOfYear <small>年内日期</small></label>
              <input class="number-input" type="number" min="1" max="365" step="1" :value="weather.dayOfYear" aria-label="dayOfYear 数值" @focus="stopTimeForEdit" @change="seekWeather($event, 'dayOfYear')" />
              <input id="weather-day" :value="weather.dayOfYear" aria-label="dayOfYear" type="range" min="1" max="365" step="1" :style="{ '--fill': `${(weather.dayOfYear - 1) / 364 * 100}%` }" @input="seekWeather($event, 'dayOfYear')" />
            </div>
            <div class="weather-control">
              <label for="weather-hour">timeOfDay <small>{{ clockText }}</small></label>
              <input class="number-input" type="number" min="0" max="24" step="0.1" :value="Number(weather.timeOfDay.toFixed(2))" aria-label="timeOfDay 数值" @focus="stopTimeForEdit" @change="seekWeather($event, 'timeOfDay')" />
              <input id="weather-hour" :value="weather.timeOfDay" aria-label="timeOfDay" type="range" min="0" max="24" step="0.01" :style="{ '--fill': `${weather.timeOfDay / 24 * 100}%` }" @input="seekWeather($event, 'timeOfDay')" />
            </div>
            <div class="weather-control">
              <label for="weather-speed">speed <small>播放速度</small></label><output>{{ settings.timeSpeed.toFixed(2) }}</output>
              <input id="weather-speed" v-model.number="settings.timeSpeed" aria-label="太阳时间 speed" type="range" min="-0.5" max="0.5" step="0.01" :style="{ '--fill': `${(settings.timeSpeed + 0.5) * 100}%` }" />
            </div>
            <button class="animate-button" :class="{ running: settings.animateTime }" :aria-pressed="settings.animateTime" :aria-label="settings.animateTime ? '太阳时间 stop' : '太阳时间 animate'" @click="toggleTimeAnimation">{{ settings.animateTime ? '■ stop' : '▶ animate' }}</button>
            <div class="sun-readout"><span>太阳高度 <b>{{ weather.sunElevation.toFixed(1) }}°</b></span><span>方位 <b>{{ weather.sunAzimuth.toFixed(1) }}°</b></span></div>
            <p class="weather-hint">日期与时间可拖动或输入；拖动会停止播放。</p>
          </div>
        </details>
        <details class="weather-group" open>
          <summary>clouds <small>体积云</small></summary>
          <div class="weather-content">
            <label class="switch-control"><span>animate <small>云层移动</small></span><input v-model="settings.animateClouds" aria-label="体积云 animate" type="checkbox" role="switch" /><i /></label>
            <label class="range-control"><span>coverage <small>云层覆盖</small><output>{{ Math.round(settings.clouds * 100) }}%</output></span><input v-model.number="settings.clouds" aria-label="云层覆盖" type="range" min="0" max="1" step="0.01" :style="{ '--fill': `${settings.clouds * 100}%` }" /></label>
            <label class="range-control"><span>speed <small>移动速度</small><output>{{ settings.cloudSpeed.toFixed(1) }}×</output></span><input v-model.number="settings.cloudSpeed" aria-label="云层移动速度" type="range" min="0" max="5" step="0.1" :style="{ '--fill': `${settings.cloudSpeed / 5 * 100}%` }" /></label>
          </div>
        </details>
        <details class="weather-group">
          <summary>atmosphere <small>大气</small></summary>
          <div class="weather-content">
            <label class="range-control"><span>exposure <small>天空曝光</small><output>{{ settings.skyExposure.toFixed(1) }}</output></span><input v-model.number="settings.skyExposure" aria-label="大气曝光" type="range" min="0.5" max="20" step="0.1" :style="{ '--fill': `${(settings.skyExposure - 0.5) / 19.5 * 100}%` }" /></label>
            <label class="switch-control"><span>haze <small>大气薄雾</small></span><input v-model="settings.haze" aria-label="大气薄雾 haze" type="checkbox" role="switch" /><i /></label>
          </div>
        </details>
        <details class="weather-group">
          <summary>ocean <small>海况与渲染</small></summary>
          <div class="weather-content">
            <label class="select-control"><span>渲染质量 <small>QUALITY</small></span><select v-model="settings.quality" aria-label="渲染质量"><option>Low</option><option>Medium</option><option>High</option><option>Ultra</option></select></label>
            <label class="range-control"><span>风速 <small>WIND SPEED</small><output>{{ settings.wind.toFixed(1) }} m/s</output></span><input v-model.number="settings.wind" aria-label="风速" type="range" min="0" max="30" step="0.1" :style="{ '--fill': `${settings.wind / 30 * 100}%` }" /></label>
            <label class="range-control"><span>主波波长 <small>WAVELENGTH</small><output>{{ settings.wavelength }} m</output></span><input v-model.number="settings.wavelength" aria-label="主波波长" type="range" min="10" max="120" step="1" :style="{ '--fill': `${(settings.wavelength - 10) / 110 * 100}%` }" /></label>
            <label class="range-control pixel-control"><span>像素倍率 <small>PIXEL RATIO</small><output>{{ settings.pixelRatio.toFixed(2) }}×</output></span><input v-model.number="settings.pixelRatio" aria-label="像素倍率" type="range" min="0.5" max="2" step="0.25" :style="{ '--fill': `${(settings.pixelRatio - 0.5) / 1.5 * 100}%` }" /></label>
            <label class="switch-control"><span>浮力探针 <small>BUOYANCY</small></span><input v-model="settings.buoyancyProbes" aria-label="浮力探针" type="checkbox" role="switch" /><i /></label>
            <label class="switch-control"><span>尾流探针 <small>WAKE</small></span><input v-model="settings.wakeProbes" aria-label="尾流探针" type="checkbox" role="switch" /><i /></label>
          </div>
        </details>
        <label class="switch-control pause-all"><span>暂停全部 <small>海水 · 天气</small></span><input v-model="settings.paused" aria-label="暂停时间" type="checkbox" role="switch" /><i /></label>
        <button class="primary-button" @click="reset">重置场景 <span>↺</span></button>
        <div class="secondary-actions"><button @click="engine?.screenshot(); notify('场景截图已生成')">保存画面</button><button @click="engine?.fullscreen().catch(() => notify('当前浏览器未允许全屏'))">全屏浏览 ⛶</button></div>
        <a class="reference-link" href="https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-3d-tiles-renderer-integration--tokyo" target="_blank" rel="noopener noreferrer">THREE-GEOSPATIAL · 天气参考 ↗</a>
        <a class="reference-link" href="https://www.threejswaterpro.com/" target="_blank" rel="noopener noreferrer">THREE.JS WATER PRO · 海洋参考 ↗</a>
      </div>
    </aside>
    <div class="scene-caption"><span class="caption-rule" /><div><small>01 / INTERACTIVE ENVIRONMENT</small><h1>蔚蓝之境<span>THE OPEN WATER</span></h1><p>{{ underwater ? '水下漫游 · Q 下潜 / E 上浮' : '海风、浪涌与光的实时交汇' }}</p></div></div>
    <div class="scene-status"><i :class="{ paused: settings.paused }" />{{ settings.paused ? '时间已暂停' : underwater ? 'UNDERWATER' : 'LIVE OCEAN' }}<span>WebGL 2</span></div>
    <Transition name="fade"><div v-if="toast" class="toast" role="status">{{ toast }}</div></Transition>
    <div v-if="loading || error" class="loading-overlay"><div class="loading-card glass-panel" role="status" aria-live="polite">
      <div class="loading-symbol">≈</div><h2>{{ error ? '场景加载遇到问题' : '驶向蔚蓝之境' }}</h2><p>{{ error || loadingText }}</p>
      <template v-if="!error"><div class="loading-track"><i :style="{ width: `${Math.max(progress, 4)}%` }" /></div><small>{{ progress }}% · 首次加载需要编译水面着色器</small></template>
      <button v-else class="primary-button" @click="initialize">重新加载</button>
    </div></div>
  </section>
</template>

<style scoped src="./water-scene.css"></style>
