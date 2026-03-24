<!--
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-06-06 15:54:46
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-12-15 11:09:33
-->
<template>
    <TresGroup>
        <TresMesh :rotation-x="-Math.PI / 2">
            <TresPlaneGeometry :args="[1, 1]" />
            <CustomShaderMaterial
                :baseMaterial="THREE.MeshBasicMaterial"
                :vertexShader="vertexShader"
                :fragmentShader="fragmentShader"
                :uniforms="uniforms"
                :side="THREE.DoubleSide"
                transparent
                :blending="THREE.AdditiveBlending"
                :flatShading="true"
                :depthTest="true"
                :depthWrite="false"
                :toneMapped="false"
                silent
            />
        </TresMesh>
    </TresGroup>
</template>

<script lang="ts" setup>
import * as THREE from 'three'
import { watch } from 'vue'
import { useLoop } from '@tresjs/core'
import { CustomShaderMaterial, useTexture } from '@tresjs/cientos'

const props = withDefaults(
    defineProps<{
        color?: string
        colorDark?: string
        speed?: number
    }>(),
    {
        color: '#ffffff',
        colorDark: '#000000',
        speed: 1,
    },
)

const uniforms = {
    uTime: { value: 0.0 },
    uScanTex: {
        value: null as THREE.Texture | null,
    },
    uScanColor: {
        value: new THREE.Color(props.color),
    },
    uScanColorDark: {
        value: new THREE.Color(props.colorDark),
    },
} as any

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
void main(){
	vUv=uv;
	vPosition=position;
	csm_Position=position;
}
`

const fragmentShader = `
#define uScanOrigin vec3(0.,0.,0.)
#define uScanWaveRatio1 3.2
#define uScanWaveRatio2 2.8

uniform float uTime;
uniform sampler2D uScanTex;
varying vec2 vUv;
varying vec3 vPosition;
uniform vec3 uScanColor;
uniform vec3 uScanColorDark;

float circleWave(vec3 p,vec3 origin,float distRatio){
    float t=uTime;
    float dist=distance(p,origin)*distRatio;
    float radialMove=fract(dist-t);
    float fadeOutMask=1.-smoothstep(1.,3.,dist);
    radialMove*=fadeOutMask;
    float cutInitialMask=1.-step(t,dist);
    radialMove*=cutInitialMask;
    return radialMove;
}

vec3 getScanColor(vec3 worldPos,vec2 uv,vec3 col){
    // mask
    float scanMask=texture(uScanTex,uv).r;
    // waves
    float cw=circleWave(worldPos,uScanOrigin,uScanWaveRatio1);
    float cw2=circleWave(worldPos,uScanOrigin,uScanWaveRatio2);
    // scan
    float mask1=smoothstep(.3,0.,1.-cw);
    mask1*=(1.+scanMask*.7);
    
    float mask2=smoothstep(.07,0.,1.-cw2)*.8;
    mask1+=mask2;
    
    float mask3=smoothstep(.09,0.,1.-cw)*1.5;
    mask1+=mask3;

    // color
    vec3 scanCol=mix(uScanColorDark,uScanColor,mask1);
    col=mix(col,scanCol,mask1);
    
    return col;
		// return vec3(cw);
		// return vec3(scanMask);
		// return worldPos;
		// return vec3(mask1);
		// return scanCol;
}

void main()
{
    vec3 col=vec3(0.);
    col=getScanColor(vPosition,vUv*10.0,col);
    csm_DiffuseColor=vec4(col,1.);
}
`

const { state: pTexture } = useTexture('./plugins/floor/image/scan.png')
watch(
    () => pTexture.value,
    (mapv) => {
        if (mapv) {
            mapv.wrapS = THREE.RepeatWrapping
            mapv.wrapT = THREE.RepeatWrapping
            mapv.needsUpdate = true
            uniforms.uScanTex.value = mapv
        }
    }
)
watch(
    () => [props.color, props.colorDark],
    ([color, colorDark]) => {
        uniforms.uScanColor.value.set(color!)
        uniforms.uScanColorDark.value.set(colorDark!)
    }
)

const { onBeforeRender } = useLoop()
onBeforeRender(() => {
    uniforms.uTime.value += 0.01 * props.speed
})
</script>
