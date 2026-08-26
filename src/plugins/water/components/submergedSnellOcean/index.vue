<template></template>

<script setup lang="ts">
import { useTresExperience } from '@/common/useTresExperience'
import adapter from './scene.js'

const props = defineProps<{
    timeScale: number
    exposureEV: number
    lutIntensity: number
    vignette: number
    mediumOcclusion: number
}>()
const emit = defineEmits<{ progress: [value: number] }>()

await useTresExperience(adapter, props, value => emit('progress', value))
</script>
