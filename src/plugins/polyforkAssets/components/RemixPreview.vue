<template>
    <primitive :object="model" />
</template>

<script setup>
import { useLoop } from '@tresjs/core'

const props = defineProps({ model: { type: Object, required: true }, onFrame: { type: Function, required: true } })
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta, elapsed }) => {
    props.onFrame(delta, elapsed)
})
</script>
