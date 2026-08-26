import { FluidFireShaderContext } from "../FluidFireShaderContext";
import { dot, float, Fn, If, max, min, Return, select, vec3, vec4 } from "three/tsl";

/**
 * @returns
 */
export const divergencePass = (context: FluidFireShaderContext) => () => {
	const grid = context.grid.phy;
	const coord = grid.coord;
	const uvw = grid.uvw;
	const currVel = context.texture.vel.B.sample(uvw).xyz;
	const voxelLocalPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
	const localPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);

	const speedOf = (u: number, v: number, w: number) => {
		const vel = vec3(0, 0, 0).toVar();

		context.collisions.checkCollisionAt(
			grid,
			context.uVolumeWorldSize,
			context.worldMatrix,
			voxelLocalPos,
			uvw,
			vec3(u, v, w),
			true,
			// hit
			(otherUvw, hitDistance, normal) => {
				const velDotN = dot(currVel, normal!);
				vel.assign(select(velDotN.lessThan(0), currVel.sub(normal!.mul(velDotN).mul(2)), currVel));
			},

			//miss
			(otherUvw) => vel.assign(context.texture.vel.B.sample(otherUvw).xyz),
		);

		return vel;

		// const offset = vec3(context.grid.phy.texel.x * u, context.grid.phy.texel.y * v, context.grid.phy.texel.z * w);

		// const otherUVW = uvw.add(offset);

		// const otherLocalPos = otherUVW.sub(0.5).mul(context.uVolumeWorldSize);

		// const worldPos = context.worldMatrix.mul(otherLocalPos).xyz;
		// const interfaceLocalPos = localPos.add(otherLocalPos).mul(0.5);
		// const interfaceWorldPos = context.worldMatrix.mul(interfaceLocalPos).xyz;

		// const hitDist = context.collisions.distanceAtPoint(worldPos);

		// If(hitDist.greaterThan(0), () => {
		// 	vel.assign(context.texture.vel.B.sample(otherUVW).xyz);
		// }).Else(() => {
		// 	const wallNormal = context.collisions.normalAtPoint(interfaceWorldPos);
		// 	const velDotN = dot(currVel, wallNormal);

		// 	vel.assign(select(velDotN.lessThan(0), currVel.sub(wallNormal.mul(velDotN).mul(2)), currVel));
		// });

		// return vel;
	};

	const vR = speedOf(1, 0, 0).x;
	const vL = speedOf(-1, 0, 0).x;
	const vU = speedOf(0, 1, 0).y;
	const vD = speedOf(0, -1, 0).y;
	const vF = speedOf(0, 0, 1).z;
	const vB = speedOf(0, 0, -1).z;

	const divergence = vR.sub(vL).add(vU.sub(vD)).add(vF.sub(vB)).mul(0.5);

	context.texture.divergence.write(coord, vec4(divergence, 0, 0, 0));
};
