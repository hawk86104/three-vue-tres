<template>
    <canvas ref="canvasRef" class="weather-canvas" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type WeatherConfig = Record<string, any>
type Particle = {
    x: number
    y: number
    speed: number
    size: number
    drift: number
    alpha: number
    phase: number
}
type LightningPoint = {
    x: number
    y: number
}

const props = withDefaults(
    defineProps<{
        wState?: WeatherConfig
    }>(),
    {
        wState: () => ({}),
    },
)

const weather = computed(() => props.wState || {})
const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let frameId = 0
let lastTime = 0
let resizeObserver: ResizeObserver | null = null
let viewWidth = 0
let viewHeight = 0
let pixelRatio = 1

const rainParticles: Particle[] = []
const snowParticles: Particle[] = []
let lightningAlpha = 0
let lightningCooldown = 40
let lightningPoints: LightningPoint[] = []

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

const hexToRgba = (color = '#ffffff', alpha = 1) => {
    const safeColor = color.replace('#', '')
    const normalized = safeColor.length === 3
        ? safeColor.split('').map((item) => `${item}${item}`).join('')
        : safeColor.padEnd(6, 'f').slice(0, 6)
    const value = Number.parseInt(normalized, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getRainConfig = () => weather.value?.rainConfig || {}
const getSnowConfig = () => weather.value?.snowConfig || {}

const syncCanvasSize = () => {
    const canvas = canvasRef.value
    const host = canvas?.parentElement
    if (!canvas || !host) {
        return
    }

    const rect = host.getBoundingClientRect()
    viewWidth = Math.max(1, rect.width)
    viewHeight = Math.max(1, rect.height)
    pixelRatio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(viewWidth * pixelRatio))
    canvas.height = Math.max(1, Math.round(viewHeight * pixelRatio))
    canvas.style.width = `${viewWidth}px`
    canvas.style.height = `${viewHeight}px`
    ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
}

const createRainParticle = (fromTop = false): Particle => ({
    x: randomBetween(-viewWidth * 0.1, viewWidth * 1.05),
    y: fromTop ? randomBetween(-viewHeight * 0.2, 0) : randomBetween(0, viewHeight),
    speed: randomBetween(0.85, 1.25),
    size: randomBetween(0.75, 1.25),
    drift: randomBetween(0.7, 1.4),
    alpha: randomBetween(0.5, 0.9),
    phase: randomBetween(0, Math.PI * 2),
})

const createSnowParticle = (fromTop = false): Particle => ({
    x: randomBetween(-20, viewWidth + 20),
    y: fromTop ? randomBetween(-viewHeight * 0.2, 0) : randomBetween(0, viewHeight),
    speed: randomBetween(0.8, 1.3),
    size: randomBetween(0.7, 1.3),
    drift: randomBetween(0.5, 1.6),
    alpha: randomBetween(0.45, 0.95),
    phase: randomBetween(0, Math.PI * 2),
})

const syncParticles = () => {
    const rainTarget = weather.value?.isRain ? clamp(Number(getRainConfig().count) || 0, 0, 800) : 0
    const snowTarget = weather.value?.isSnow ? clamp(Number(getSnowConfig().count) || 0, 0, 800) : 0

    while (rainParticles.length < rainTarget) {
        rainParticles.push(createRainParticle())
    }
    if (rainParticles.length > rainTarget) {
        rainParticles.length = rainTarget
    }

    while (snowParticles.length < snowTarget) {
        snowParticles.push(createSnowParticle())
    }
    if (snowParticles.length > snowTarget) {
        snowParticles.length = snowTarget
    }
}

const buildLightningPath = () => {
    lightningPoints = []
    let x = randomBetween(viewWidth * 0.2, viewWidth * 0.8)
    let y = 0
    lightningPoints.push({ x, y })

    const endHeight = randomBetween(viewHeight * 0.24, viewHeight * 0.48)
    while (y < endHeight) {
        x += randomBetween(-viewWidth * 0.04, viewWidth * 0.04)
        y += randomBetween(viewHeight * 0.04, viewHeight * 0.1)
        lightningPoints.push({ x, y })
    }
}

const triggerLightning = (strength: number) => {
    lightningAlpha = clamp(0.18 + strength * 0.32, 0.18, 0.72)
    lightningCooldown = randomBetween(80, 220)
    buildLightningPath()
}

const drawLightning = (strength: number) => {
    if (!ctx || lightningAlpha <= 0 || lightningPoints.length < 2) {
        return
    }

    ctx.save()
    ctx.fillStyle = `rgba(255, 255, 255, ${lightningAlpha * 0.2})`
    ctx.fillRect(0, 0, viewWidth, viewHeight)

    ctx.beginPath()
    ctx.moveTo(lightningPoints[0].x, lightningPoints[0].y)
    lightningPoints.forEach((point) => ctx.lineTo(point.x, point.y))

    ctx.lineWidth = 3 + strength * 3
    ctx.strokeStyle = `rgba(175, 215, 255, ${lightningAlpha})`
    ctx.shadowBlur = 20
    ctx.shadowColor = 'rgba(200, 230, 255, 0.9)'
    ctx.stroke()

    ctx.lineWidth = 1.2
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, lightningAlpha + 0.25)})`
    ctx.shadowBlur = 0
    ctx.stroke()
    ctx.restore()
}

const render = (now: number) => {
    frameId = window.requestAnimationFrame(render)
    if (!ctx) {
        return
    }

    const delta = lastTime ? clamp((now - lastTime) / 16.67, 0.5, 2.5) : 1
    lastTime = now
    syncParticles()
    ctx.clearRect(0, 0, viewWidth, viewHeight)

    const rainConfig = getRainConfig()
    const snowConfig = getSnowConfig()
    const hasRain = Boolean(weather.value?.isRain)
    const hasSnow = Boolean(weather.value?.isSnow)

    if (!hasRain && !hasSnow && lightningAlpha <= 0) {
        lightningCooldown = 40
        lightningPoints = []
        return
    }

    if (hasRain) {
        const speed = Number(rainConfig.speed) || 10
        const size = Number(rainConfig.size) || 5
        const intensity = Number(rainConfig.intensity) || 1
        const color = rainConfig.color || '#ffffff'
        const lineLength = 10 + size * 1.8 + intensity * 7
        const lineWidth = Math.max(0.5, size * 0.18)
        const fallSpeed = 8 + speed * 0.42
        const driftSpeed = 1.6 + intensity * 0.8

        rainParticles.forEach((particle, index) => {
            particle.y += fallSpeed * particle.speed * delta
            particle.x += driftSpeed * particle.drift * delta
            if (particle.y > viewHeight + lineLength || particle.x > viewWidth + 40) {
                rainParticles[index] = createRainParticle(true)
                return
            }

            const alpha = clamp((0.25 + intensity * 0.18) * particle.alpha, 0.18, 0.9)
            ctx.beginPath()
            ctx.lineWidth = lineWidth * particle.size
            ctx.strokeStyle = hexToRgba(color, alpha)
            ctx.moveTo(particle.x, particle.y)
            ctx.lineTo(particle.x - driftSpeed * 2.4, particle.y - lineLength * particle.size)
            ctx.stroke()
        })
    }

    if (hasSnow) {
        const speed = Number(snowConfig.speed) || 10
        const size = Number(snowConfig.size) || 5
        const intensity = Number(snowConfig.intensity) || 1
        const color = snowConfig.color || '#ffffff'
        const fallSpeed = 0.8 + speed * 0.12
        const swaySize = 0.7 + intensity * 0.55

        snowParticles.forEach((particle, index) => {
            particle.phase += 0.02 * delta
            particle.y += fallSpeed * particle.speed * delta
            particle.x += Math.sin(particle.phase) * swaySize * particle.drift * delta

            if (particle.y > viewHeight + 20 || particle.x < -30 || particle.x > viewWidth + 30) {
                snowParticles[index] = createSnowParticle(true)
                return
            }

            const radius = Math.max(0.7, size * 0.32 * particle.size)
            const alpha = clamp((0.28 + intensity * 0.16) * particle.alpha, 0.2, 0.9)
            ctx.beginPath()
            ctx.fillStyle = hexToRgba(color, alpha)
            ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2)
            ctx.fill()
        })
    }

    if (hasRain && rainConfig.lightning) {
        lightningCooldown -= delta
        const lightningStrength = Number(rainConfig.lightningStrength) || 0.55
        const triggerRate = 0.003 + lightningStrength * 0.002
        if (lightningCooldown <= 0 && Math.random() < triggerRate) {
            triggerLightning(lightningStrength)
        }
        if (lightningAlpha > 0) {
            drawLightning(lightningStrength)
            lightningAlpha = Math.max(0, lightningAlpha - (0.035 + lightningStrength * 0.01) * delta)
        }
    } else {
        lightningAlpha = 0
        lightningPoints = []
    }
}

onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) {
        return
    }

    ctx = canvas.getContext('2d')
    if (!ctx) {
        return
    }

    syncCanvasSize()
    const host = canvas.parentElement
    if (host && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => syncCanvasSize())
        resizeObserver.observe(host)
    }
    frameId = window.requestAnimationFrame(render)
})

onBeforeUnmount(() => {
    if (frameId) {
        window.cancelAnimationFrame(frameId)
    }
    resizeObserver?.disconnect()
})
</script>

<style lang="scss" scoped>
.weather-canvas {
    position: absolute;
    inset: 0;
    z-index: 10;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
</style>
