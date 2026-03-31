/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2026-03-31 15:24:12
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2026-03-31 14:56:56
 */

export interface LiquidMetalMaterialProps {
    color?: string
    emissive?: string
    emissiveIntensity?: number
    metalness?: number
    roughness?: number
    clearcoat?: number
    clearcoatRoughness?: number
    envMapIntensity?: number
    ior?: number
    specularIntensity?: number
    liquidMetalIntensity?: number
    normalStrength?: number
    displacementStrength?: number
    fresnelStrength?: number
    uScale?: number
    uShapeReactivity?: number
    uDistortion?: number
    uEdgeProtection?: number
    iridescence?: number
    iridescenceIOR?: number
    iridescenceThicknessMin?: number
    iridescenceThicknessMax?: number
}

type LiquidMetalFieldKey = keyof Required<LiquidMetalMaterialProps>

export interface LiquidMetalMaterialControlItem {
    name: string
    com: 'ColorPicker' | 'Slider'
    min?: number
    max?: number
    step?: number
}

export interface LiquidMetalMaterialControlGroup {
    title: string
    fields: LiquidMetalFieldKey[]
}

export const liquidMetalMaterialDefaults = {
    color: '#ffffff',
    emissive: '#000000',
    emissiveIntensity: 0.02,
    metalness: 1,
    roughness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 2,
    ior: 1.52,
    specularIntensity: 1,
    liquidMetalIntensity: 1,
    normalStrength: 1.5,
    displacementStrength: 0.065,
    fresnelStrength: 1.4,
    uScale: 0.00001,
    uShapeReactivity: 2.2,
    uDistortion: 1.35,
    uEdgeProtection: 0.32,
    iridescence: 0.85,
    iridescenceIOR: 1.32,
    iridescenceThicknessMin: 759,
    iridescenceThicknessMax: 800,
} as const satisfies Required<LiquidMetalMaterialProps>

export const liquidMetalMaterialSchema = {
    color: { name: '基础颜色', com: 'ColorPicker' },
    emissive: { name: '发光颜色', com: 'ColorPicker' },
    emissiveIntensity: { name: '发光强度', com: 'Slider', min: 0, max: 2, step: 0.01 },
    metalness: { name: '金属度', com: 'Slider', min: 0, max: 1, step: 0.01 },
    roughness: { name: '粗糙度', com: 'Slider', min: 0, max: 1, step: 0.01 },
    clearcoat: { name: '清漆层', com: 'Slider', min: 0, max: 1, step: 0.01 },
    clearcoatRoughness: { name: '清漆粗糙度', com: 'Slider', min: 0, max: 1, step: 0.01 },
    envMapIntensity: { name: '环境反射', com: 'Slider', min: 0, max: 5, step: 0.01 },
    ior: { name: 'IOR', com: 'Slider', min: 1, max: 2.333, step: 0.01 },
    specularIntensity: { name: '高光强度', com: 'Slider', min: 0, max: 2, step: 0.01 },
    liquidMetalIntensity: { name: '液态金属强度', com: 'Slider', min: 0, max: 1.5, step: 0.01 },
    normalStrength: { name: '法线扰动', com: 'Slider', min: 0, max: 1.5, step: 0.01 },
    displacementStrength: { name: '位移强度', com: 'Slider', min: 0, max: 0.35, step: 0.001 },
    fresnelStrength: { name: '边缘高光', com: 'Slider', min: 0, max: 3, step: 0.01 },
    uScale: { name: 'Ripple Scale', com: 'Slider', min: 0.0001, max: 0.015, step: 0.0001 },
    uShapeReactivity: { name: 'Shape Reactivity', com: 'Slider', min: 0, max: 5, step: 0.01 },
    uDistortion: { name: 'Distortion', com: 'Slider', min: 0, max: 5, step: 0.01 },
    uEdgeProtection: { name: 'Edge Sharpness', com: 'Slider', min: 0, max: 1, step: 0.01 },
    iridescence: { name: 'Intensity', com: 'Slider', min: 0, max: 1, step: 0.01 },
    iridescenceIOR: { name: 'Index of Refraction', com: 'Slider', min: 1, max: 3, step: 0.01 },
    iridescenceThicknessMin: { name: 'Thickness Min', com: 'Slider', min: 0, max: 1500, step: 1 },
    iridescenceThicknessMax: { name: 'Thickness Max', com: 'Slider', min: 0, max: 1500, step: 1 },
} as const satisfies Record<LiquidMetalFieldKey, LiquidMetalMaterialControlItem>

export const liquidMetalMaterialControlGroups: LiquidMetalMaterialControlGroup[] = [
    {
        title: 'Liquid Metal',
        fields: ['liquidMetalIntensity', 'normalStrength', 'displacementStrength', 'fresnelStrength', 'color','emissive','envMapIntensity'],
    },
    {
        title: 'Fluid Dynamics',
        fields: ['uScale', 'uShapeReactivity', 'uDistortion', 'uEdgeProtection'],
    },
    {
        title: 'Iridescence (Rainbow)',
        fields: ['iridescence', 'iridescenceIOR', 'iridescenceThicknessMin', 'iridescenceThicknessMax'],
    },
    {
        title: 'Base Material',
        fields: ['roughness', 'metalness', 'clearcoat'],
    },
]

export function createLiquidMetalMaterialState(overrides: Partial<LiquidMetalMaterialProps> = {}) {
    return {
        ...liquidMetalMaterialDefaults,
        ...overrides,
    }
}
