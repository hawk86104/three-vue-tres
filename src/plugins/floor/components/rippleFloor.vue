<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: Jsonco
 * @Date: 2025-06-05 09:50:35
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-13 19:48:33
-->
<template>
    <TresMesh :rotation-x="-Math.PI / 2">
        <TresPlaneGeometry :args="[10, 10]" />
        <CustomShaderMaterial
            :baseMaterial="THREE.MeshBasicMaterial"
            :uniforms="shaderUniforms"
            :vertex-shader="vertexShader"
            :fragment-shader="fragmentShader"
            :side="THREE.DoubleSide"
            silent
        />
    </TresMesh>
   
</template>

<script setup lang="ts">
import { onMounted, watch, reactive } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { CustomShaderMaterial } from '@tresjs/cientos'

const props = withDefaults(
    defineProps<{
        color?: string
        flySpeed?: number
        flyIntensity?: number
        dotSize?: number
        lineColor?: string
        floorColor1?: string
        floorColor2?: string
        gridSize?: number
        lineWidth?: number
        paused?: boolean
    }>(),
    {
        color: '#ffed00',
        flySpeed: 3.0,
        flyIntensity: 0.3,
        dotSize: 0.03,
        lineColor: '#66f5ff',
        floorColor1: '#4c6480',
        floorColor2: '#acb4c0',
        gridSize: 50.0,
        lineWidth: 0.02,
        paused: false
    },
)




// 飞线网格地板shader uniforms
const shaderUniforms = reactive({
    time: { value: 0 },
    color1: { value: new THREE.Color(props.floorColor1) },
    color2: { value: new THREE.Color(props.floorColor2) },
    lineColor: { value: new THREE.Color(props.lineColor) },
    flyLineColor: { value: new THREE.Color(props.lineColor) },
    gridSize: { value: props.gridSize },
    lineWidth: { value: props.lineWidth },
    flySpeed: { value: props.flySpeed },
    flyIntensity: { value: props.flyIntensity },
    dotSize: { value: props.dotSize }
})

// 飞线网格地板shader代码
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        csm_Position = position;
    }
`

const fragmentShader = `
    uniform float time;
    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 lineColor;
    uniform vec3 flyLineColor;
    uniform float gridSize;
    uniform float lineWidth;
    uniform float flySpeed;
    uniform float flyIntensity;
    uniform float dotSize;
    varying vec2 vUv;
    
    void main() {
        // 缩放UV以创建网格
        vec2 scaledUv = vUv * gridSize;
        
        // 创建棋盘格图案
        vec2 cellIndex = floor(scaledUv);
        float checkValue = mod(cellIndex.x + cellIndex.y, 2.0);
        vec3 baseColor = (checkValue < 1.0) ? color1 : color2;
        
        // 创建基础网格线
        vec2 gridUv = fract(scaledUv);
        
        // 基础垂直线
        float verticalLine = abs(gridUv.x - 0.5) / fwidth(gridUv.x);
        float verticalMask = 1.0 - smoothstep(0.0, lineWidth, verticalLine);
        
        // 基础水平线
        float horizontalLine = abs(gridUv.y - 0.5) / fwidth(gridUv.y);
        float horizontalMask = 1.0 - smoothstep(0.0, lineWidth, horizontalLine);
        
        // 组合基础线条
        float baseLineMask = max(verticalMask, horizontalMask);
        vec3 colorWithLines = mix(baseColor, lineColor, baseLineMask);
        
        // 创建飞线效果
        // 垂直线飞线
        float flyVertical = sin(gridUv.y * 6.28 + time * flySpeed) * flyIntensity;
        float flyVerticalLine = abs(gridUv.x - 0.5 + flyVertical) / fwidth(gridUv.x);
        float flyVerticalMask = 1.0 - smoothstep(0.0, lineWidth * 0.5, flyVerticalLine);
        
        // 水平线飞线
        float flyHorizontal = sin(gridUv.x * 6.28 + time * flySpeed * 0.7) * flyIntensity;
        float flyHorizontalLine = abs(gridUv.y - 0.5 + flyHorizontal) / fwidth(gridUv.y);
        float flyHorizontalMask = 1.0 - smoothstep(0.0, lineWidth * 0.5, flyHorizontalLine);
        
        // 组合飞线
        float flyLineMask = max(flyVerticalMask, flyHorizontalMask);
        
        // 添加飞线的发光效果
        float glowVertical = exp(-flyVerticalLine * 2.0) * 0.3;
        float glowHorizontal = exp(-flyHorizontalLine * 2.0) * 0.3;
        float glowMask = max(glowVertical, glowHorizontal);
        
        // 创建节点效果 - 在网格正方形的四个顶点
        float dotRadius = dotSize;
        float dotFeather = dotSize * 0.3;
        
        // 计算到四个顶点的距离
        vec2 topLeft = vec2(0.0, 0.0);
        vec2 topRight = vec2(1.0, 0.0);
        vec2 bottomLeft = vec2(0.0, 1.0);
        vec2 bottomRight = vec2(1.0, 1.0);
        
        float distTopLeft = length(gridUv - topLeft);
        float distTopRight = length(gridUv - topRight);
        float distBottomLeft = length(gridUv - bottomLeft);
        float distBottomRight = length(gridUv - bottomRight);
        
        // 找到最近顶点的距离
        float minDist = min(min(distTopLeft, distTopRight), min(distBottomLeft, distBottomRight));
        
        // 在最近顶点附近绘制节点
        float dotMask = 1.0 - smoothstep(dotRadius - dotFeather, dotRadius + dotFeather, minDist);
        
        // 飞线经过节点时的增强效果
        float nodeGlow = dotMask * flyLineMask * 3.0;
        
        // 组合所有效果
        vec3 finalColor = colorWithLines;
        
        // 添加飞线颜色
        finalColor = mix(finalColor, flyLineColor, flyLineMask);
        
        // 添加发光效果
        finalColor += flyLineColor * glowMask;
        finalColor += flyLineColor * nodeGlow;
        
        // 添加节点 - 使用飞线颜色而不是白色
        finalColor = mix(finalColor, flyLineColor, dotMask);
        
        csm_DiffuseColor = vec4(finalColor, 1.0);
    }
`



const { onBeforeRender } = useLoop()
let elapsedTime = 0

onBeforeRender(({ delta }) => {
    // 飞线网格地板动画
    if (!props.paused) {
        elapsedTime += delta
        shaderUniforms.time.value = elapsedTime
    }
})


// 更新飞线网格地板uniforms
const updateFloorUniforms = () => {
    shaderUniforms.color1.value = new THREE.Color(props.floorColor1)
    shaderUniforms.color2.value = new THREE.Color(props.floorColor2)
    shaderUniforms.lineColor.value = new THREE.Color(props.lineColor)
    shaderUniforms.flyLineColor.value = new THREE.Color(props.lineColor)
    shaderUniforms.gridSize.value = props.gridSize
    shaderUniforms.lineWidth.value = props.lineWidth
    shaderUniforms.flySpeed.value = props.flySpeed
    shaderUniforms.flyIntensity.value = props.flyIntensity
    shaderUniforms.dotSize.value = props.dotSize
}

onMounted(() => {
    // 初始化飞线网格地板uniforms
    updateFloorUniforms();
});

// 监听飞线网格地板参数变化
watch(
    () => [
        props.flySpeed,
        props.flyIntensity,
        props.dotSize,
        props.lineColor,
        props.floorColor1,
        props.floorColor2,
        props.gridSize,
        props.lineWidth
    ],
    updateFloorUniforms
)







</script>
