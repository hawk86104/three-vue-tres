/*
 * @Description: 
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-01-25 15:17:06
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2024-01-25 16:06:29
 */
export const getVertexShader = () => {
	return `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            csm_Position = position;
        }`
}

export const getFragmentShader = () => {
	return `
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec3 uColor;
        uniform float fEdge;

        // 纹理平铺仍然保留在 shader 内，和原来的地板视觉保持一致
        const float repeatTime = 100.0;

        float smoothsteps(float t) {
            return t * t * (3.0 - 2.0 * t);
        }

        void main() {
            vec4 col = texture2D(uTexture, vUv * repeatTime);
            col.rgb = mix(uColor, col.rgb, 0.5);

            float alpha = 1.0;
            float d = length(vUv - vec2(0.5));
            if (d > 0.35) {
                alpha = 1.0 - smoothsteps(clamp((d - 0.35) / max(fEdge - 0.2, 0.0001), 0.0, 1.0));
            }

            csm_DiffuseColor = vec4(col.rgb, alpha);
            csm_DepthAlpha = alpha;
        }`
}
