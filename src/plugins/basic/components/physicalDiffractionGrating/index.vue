<template></template>

<script setup lang="ts">
import { useTresExperience } from '@/common/useTresExperience'
import adapter from './scene.js'

const props = defineProps<{
    pitchNm: number
    reliefNm: number
    coherenceUm: number
    azimuthSigma: number
    grooveAngle: number
    gain: number
    stars: boolean
    lightTemperature: number
    lightPower: number
}>()
const emit = defineEmits<{ progress: [value: number] }>()

await useTresExperience(adapter, props, value => emit('progress', value))
</script>
