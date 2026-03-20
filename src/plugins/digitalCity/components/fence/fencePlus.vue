<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-02-02 10:15:51
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-09-26 15:17:03
-->
<template>
    <TresMesh :renderOrder="2000" :geometry="geometriesMesh">
        <CustomShaderMaterial
            :baseMaterial="THREE.MeshBasicMaterial"
            :vertexShader="rippleShader.vertexShader"
            :fragmentShader="rippleShader.fragmentShader"
            :uniforms="rippleShader.uniforms"
            :side="THREE.DoubleSide"
            transparent
            :depthWrite="false"
            :depthTest="true"
            :blending="THREE.NormalBlending"
            silent
            :toneMapped="false"
        />
    </TresMesh>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils'
import { watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { CustomShaderMaterial } from '@tresjs/cientos'

const props = withDefaults(
    defineProps<{
        width?: number
        height?: number
        depth?: number
        color?: string
        opacity?: number
        thickness?: number
        room?: number
        num?: number
        speed?: number
    }>(),
    {
        width: 100,
        height: 100,
        depth: 100,
        color: '#ffff00',
        opacity: 1,
        thickness: 0.99,
        num: 8,
        room: 0.7,
        speed: 0.15,
    },
)

const rippleShader = {
    vertexShader: `
		precision highp float;
		precision highp int;
		varying vec2 vUv;
		void main() {
			vUv = uv;
		}
`,
    fragmentShader: `
				precision highp float;
				precision highp int;
				uniform float time;
				uniform float uOpacity;
				uniform vec3 color;
				uniform float num;
				uniform float thickness;
				uniform float speed;
				uniform float room;
				varying vec2 vUv;
				void main() {
					vec4 fragColor = vec4(0.);
					float sinnum = sin((vUv.y - time * speed) * 10. * num);

					vec4 wcolor = vec4(mix(color, vec3(1., 1., 1.), 0.9),1.0);

					vec3 fade = mix(color, vec3(1., 1., 1.), vUv.y);
                    fragColor = mix(fragColor, vec4(fade, 1.), 0.85);
                    csm_DiffuseColor = vec4(fragColor.rgb, fragColor.a * uOpacity * (1. - vUv.y));

					if(vUv.y < room){
						float alpha = smoothstep(1.0 - thickness - 0.1, 1.0 - thickness, sinnum);
						fragColor = mix(csm_DiffuseColor, wcolor, alpha);
						fragColor.a = fragColor.a * uOpacity;
						csm_DiffuseColor = fragColor;
					}
				}
		`,
    uniforms: {
        time: {
            type: 'pv2',
            value: 0,
        },
        color: {
            type: 'uvs',
            value: new THREE.Color(props.color),
        },
        uOpacity: {
            value: props.opacity,
        },
        num: {
            value: props.num,
        },
        thickness: {
            value: props.thickness,
        },
        speed: {
            value: props.speed,
        },
        room: {
            value: props.room,
        },
    },
}

let geometriesMesh = null as any
/**
 * 创建一个带UV的矩形立体框架（仅四个面）
 * @param width  X方向长度
 * @param depth  Z方向长度
 * @param height Y方向高度
 * @returns BufferGeometry
 */
function createRectFrameGeometryWithUV(width: number, depth: number, height: number): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = []

    const createWall = (w: number, h: number) => {
        const geo = new THREE.PlaneGeometry(w, h, 1, 1)

        // 手动设置UV（可选，PlaneGeometry默认是从左下到右上：u=[0,1], v=[0,1]，但我们确认一下）
        const uvs = []
        uvs.push(0, 1) // 左下
        uvs.push(1, 1) // 右下
        uvs.push(0, 0) // 左上
        uvs.push(1, 0) // 右上
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

        return geo
    }

    // 前面（沿X，面朝里）
    const front = createWall(width, height)
    front.rotateY(Math.PI) // 朝里
    front.translate(0, height / 2, -depth / 2)
    geometries.push(front)

    // 后面（沿X）
    const back = createWall(width, height)
    back.translate(0, height / 2, depth / 2)
    geometries.push(back)

    // 左面（沿Z）
    const left = createWall(depth, height)
    left.rotateY(Math.PI / 2)
    left.translate(-width / 2, height / 2, 0)
    geometries.push(left)

    // 右面（沿Z）
    const right = createWall(depth, height)
    right.rotateY(-Math.PI / 2)
    right.translate(width / 2, height / 2, 0)
    geometries.push(right)

    // 合并所有几何体（保留UV）
    const merged = BufferGeometryUtils.mergeGeometries(geometries, true)
    return merged
}

geometriesMesh = createRectFrameGeometryWithUV(props.width, props.depth, props.height)

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number }) => {
    rippleShader.uniforms.time.value += delta
})

watch(
    () => [props.color, props.opacity, props.num, props.thickness, props.speed, props.room],
    ([color, opacity, num, thickness, speed, room]: any) => {
        rippleShader.uniforms.color.value = new THREE.Color(color)
        rippleShader.uniforms.uOpacity.value = opacity
        rippleShader.uniforms.num.value = num
        rippleShader.uniforms.thickness.value = thickness
        rippleShader.uniforms.speed.value = speed
        rippleShader.uniforms.room.value = room
    },
)

watch(
    () => [props.width, props.depth, props.height],
    ([width, depth, height]) => {
        geometriesMesh = createRectFrameGeometryWithUV(width, depth, height)
    },
)
</script>
