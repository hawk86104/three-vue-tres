import { float, Fn, globalId, If, ivec3, mx_noise_vec3, Return, vec3, vec4 } from "three/tsl";
import { FluidFireShaderContext } from "../FluidFireShaderContext";

export const curlNoisePass = (context: FluidFireShaderContext) => () => {
	const coord = globalId;
	const noiseSize = context.noiseTextureConfig.size;
	const gridRes = ivec3(noiseSize, noiseSize, noiseSize);

	// 1. Guard clause
	If(
		coord.x
			.lessThan(0)
			.or(coord.x.greaterThanEqual(gridRes.x))
			.or(coord.y.lessThan(0).or(coord.y.greaterThanEqual(gridRes.y)))
			.or(coord.z.lessThan(0).or(coord.z.greaterThanEqual(gridRes.z))),
		() => {
			Return();
		},
	);

	// 2. Work directly with globalId, scaled by world size / grid resolution
	// This replaces uvw and p entirely in one step:
	const worldSizeRatio = vec3(
		context.grid.world.size.x / context.grid.world.size.y,
		1.0,
		context.grid.world.size.z / context.grid.world.size.y,
	);

	// Convert globalId to float vector, divide by grid resolution, and scale by world aspect ratio
	const p = vec3(coord).div(vec3(gridRes)).mul(worldSizeRatio);

	const freq = context.uTurbFrequency; //float(context.noiseTextureConfig.frecuency).mul(context.uTurbFrequency);
	const e = float(0.1).div(freq);
	const dx = vec3(e, 0.0, 0.0);
	const dy = vec3(0.0, e, 0.0);
	const dz = vec3(0.0, 0.0, e);

	const p_x0 = mx_noise_vec3(p.sub(dx).mul(freq));
	const p_x1 = mx_noise_vec3(p.add(dx).mul(freq));
	const p_y0 = mx_noise_vec3(p.sub(dy).mul(freq));
	const p_y1 = mx_noise_vec3(p.add(dy).mul(freq));
	const p_z0 = mx_noise_vec3(p.sub(dz).mul(freq));
	const p_z1 = mx_noise_vec3(p.add(dz).mul(freq));

	const x = p_y1.z.sub(p_y0.z).sub(p_z1.y).add(p_z0.y);
	const y = p_z1.x.sub(p_z0.x).sub(p_x1.z).add(p_x0.z);
	const z = p_x1.y.sub(p_x0.y).sub(p_y1.x).add(p_y0.x);

	const noiseVal = vec3(x, y, z).mul(context.uCurlNoiseMultiplier);

	context.texture.curlNoise.write(coord, vec4(noiseVal, 0.0)); //
};
