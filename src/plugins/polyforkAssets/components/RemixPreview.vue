<template>
    <primitive :object="model" />
</template>

<script setup>
import { useLoop } from '@tresjs/core'

const props = defineProps({ model: { type: Object, required: true } })
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
    props.model.children[0]?.userData.tick?.(elapsed)
})
</script>
