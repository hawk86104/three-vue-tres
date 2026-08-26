<template></template>

<script setup lang="ts">
import { useTresExperience } from '@/common/useTresExperience'
import adapter from './scene.js'

const props = defineProps<{
    bounces: number
    ior: number
    aberrationStrength: number
    chromaticAberration: boolean
    correctMips: boolean
}>()
const emit = defineEmits<{ progress: [value: number] }>()

await useTresExperience(adapter, props, value => emit('progress', value))
</script>
