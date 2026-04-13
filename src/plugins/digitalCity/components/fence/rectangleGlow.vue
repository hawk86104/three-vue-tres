<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2025-07-04 08:50:42
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-04-13 14:24:13
-->
<template>
    <TresGroup>
        <TresMesh :rotation="[Math.PI / 2, 0, 0]">
            <TresPlaneGeometry :args="[w, h]" />
            <CustomShaderMaterial
                :baseMaterial="THREE.MeshBasicMaterial"
                :vertexShader="pShader.vertexShader"
                :fragmentShader="pShader.fragmentShader"
                :uniforms="pShader.uniforms"
                :side="THREE.DoubleSide"
                transparent
                :depthWrite="false"
                :depthTest="true"
                silent
                :toneMapped="false"
            />
        </TresMesh>
        <TresMesh :renderOrder="1" :rotation="[Math.PI / 2, 0, 0]">
            <TresPlaneGeometry :args="[w + lineWidth, h + lineWidth]" />
            <CustomShaderMaterial
                :baseMaterial="THREE.MeshBasicMaterial"
                :vertexShader="lShader.vertexShader"
                :fragmentShader="lShader.fragmentShader"
                :uniforms="lShader.uniforms"
                :side="THREE.DoubleSide"
                transparent
                :depthWrite="false"
                :depthTest="true"
                silent
                :toneMapped="false"
            />
        </TresMesh>
    </TresGroup>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { computed, watchEffect } from 'vue'
import { CustomShaderMaterial } from '@tresjs/cientos'

const props = withDefaults(
    defineProps<{
        w: number
        h: number
        pColor?: string
        gradientWidth?: number
        glowWidth?: number
        nNumber?: number
        lineWidth?: number
        lColor?: string
    }>(),
    {
        w: 100,
        h: 100,
        pColor: '#ffff00',
        gradientWidth: 0.99,
        glowWidth: 0.99,
        nNumber: 8.0,
        lineWidth: 2.0,
        lColor: '#ffff00',
    },
)

const pShader = {
    vertexShader: `
 		varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    varying vec2 vUv;
		uniform vec3 color;
		uniform float gradientWidth;
		uniform float glowWidth;
		uniform float nNumber;

    void main() {
 			float distX = abs(vUv.x - 0.5) / 0.5;
      float distY = abs(vUv.y - 0.5) / 0.5;

      // 使用 Minkowski 距离，平滑矩形感 + 中心无交叉线 + 对角线也平滑
      float dist = pow(pow(distX, nNumber) + pow(distY, nNumber), 1.0 / nNumber);

      float cutoff = 1.0 - gradientWidth;
  		float alpha = smoothstep(cutoff, cutoff + glowWidth, dist);

      csm_DiffuseColor = vec4(color, alpha);
    }
  `,
    uniforms: {
        color: {
            type: 'uvs',
            value: new THREE.Color(props.pColor),
        },
        gradientWidth: {
            type: 'f',
            value: props.gradientWidth,
        },
        glowWidth: {
            type: 'f',
            value: props.glowWidth,
        },
        nNumber: {
            type: 'f',
            value: props.nNumber,
        },
    },
}
const lShader = {
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    uniforms: {
        borderWidth: { value: props.lineWidth }, // 边框宽度（相对UV）
        borderColor: { value: new THREE.Color(props.lColor) },
        size: { value: new THREE.Vector2(props.w, props.h) },
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform float borderWidth;
    uniform vec3 borderColor;
    varying vec2 vUv;
		uniform vec2 size;

    void main() {
		 	float borderX = borderWidth / size.x;
  		float borderY = borderWidth / size.y;

      float left   = step(vUv.x, borderX);
      float right  = step(1.0 - borderX, vUv.x);
      float bottom = step(vUv.y, borderY);
      float top    = step(1.0 - borderY, vUv.y);

      float edge = max(max(left, right), max(bottom, top)); // 只保留边缘线
      float alpha = edge;

      csm_DiffuseColor = vec4(borderColor, alpha);
    }
  `,
}
watchEffect(() => {
    pShader.uniforms.color.value = new THREE.Color(props.pColor)
    pShader.uniforms.gradientWidth.value = props.gradientWidth
    pShader.uniforms.glowWidth.value = props.glowWidth
    pShader.uniforms.nNumber.value = props.nNumber

    lShader.uniforms.borderColor.value = new THREE.Color(props.lColor)
    lShader.uniforms.borderWidth.value = props.lineWidth
    lShader.uniforms.size.value.set(props.w, props.h)
})
</script>
