<template></template>

<script setup lang="ts">
import { useTresExperience } from '@/common/useTresExperience'
import adapter from './scene.js'

const props = defineProps<{
    view: 'above-surface' | 'underwater'
    timeScale: number
    foamThreshold: number
    foamScale: number
    foamDistortion: number
    causticIntensity: number
    causticSpeed: number
    waterClarity: number
}>()
const emit = defineEmits<{ progress: [value: number] }>()

await useTresExperience(adapter, props, value => emit('progress', value))
</script>
