import { DataTexture, FluidFireShaderContext } from "../FluidFireShaderContext";
import { Fn } from "three/tsl";
import { float, If, vec3, vec4 } from "three/tsl";

export const projectPass = (context: FluidFireShaderContext) => () => {
	const coord = context.grid.phy.coord;
	const uvw = context.grid.phy.uvw;
	const grid = context.grid.phy;
	const readFrom = context.texture.press.A;
	const voxelLocalPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
	//const worldPos = context.worldMatrix.mul(vec4(voxelLocalPos, 1.0)).xyz;

	// 1. Check if the voxel itself is inside an obstacle
	const currentDist = context.collisions.distanceAtPoint(uvw);

	If(currentDist.lessThanEqual(0.0), () => {
		// Voxel is solid: Ensure velocity is absolutely zero inside
		context.texture.vel.A.write(coord, vec4(0.0));
	}).Else(() => {
		const currentPressure = readFrom.sample(uvw).x;

		const pressureOf = (u: number, v: number, w: number) => {
			const pressure = float(0).toVar();

			context.collisions.checkCollisionAt(
				grid,
				context.uVolumeWorldSize,
				context.worldMatrix,
				voxelLocalPos,
				uvw,
				vec3(u, v, w),
				false,
				// HIT (Solid): Set neighbor pressure equal to current pressure
				// This forces the gradient to 0 at the wall!
				(otherUvw, hitDistance, normal) => {
					pressure.assign(currentPressure);
				},
				// MISS (Fluid): Sample actual pressure
				(otherUvw) => {
					pressure.assign(readFrom.sample(otherUvw).x);
				},
			);

			return pressure;
		};

		const pR = pressureOf(1, 0, 0);
		const pL = pressureOf(-1, 0, 0);
		const pU = pressureOf(0, 1, 0);
		const pD = pressureOf(0, -1, 0);
		const pF = pressureOf(0, 0, 1);
		const pB = pressureOf(0, 0, -1);

		// Central difference gradient
		const gradient = vec3(pR.sub(pL), pU.sub(pD), pF.sub(pB)).mul(0.5);

		// Subtract gradient from the intermediate velocity field
		const vel = context.texture.vel.B.sample(uvw).xyz.sub(gradient).toVar();

		// Safety catch: redirect any lingering velocity anomalies (slip/ejection)
		context.collisions.makeVelocityAvoidColliders(vel, uvw);

		context.texture.vel.A.write(coord, vec4(vel, 0));
	});
};
