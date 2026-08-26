import { Fn, vec3 } from "three/tsl";
import { Node } from "three/webgpu";

export type SDFSampler = (
	worldPos: Node<"vec3">,
	outVelocity?: Node<"vec3">,
	outNormal?: Node<"vec3">,
) => Node<"float">;

export const sdfSampler = (fn: (...args: Required<Parameters<SDFSampler>>) => ReturnType<SDFSampler>): SDFSampler => {
	// 2. Just pass the function directly. 'Fn' natively handles passing the array tuple!
	const sampler = Fn<Required<Parameters<SDFSampler>>, ReturnType<SDFSampler>>((params) => fn.apply(null, params));

	return (worldPos, outVel, outNormal) => {
		const tempOutVel = outVel ?? vec3(0);
		const tempOutNormal = outNormal ?? vec3(0);

		return sampler(worldPos, tempOutVel, tempOutNormal);
	};
};
