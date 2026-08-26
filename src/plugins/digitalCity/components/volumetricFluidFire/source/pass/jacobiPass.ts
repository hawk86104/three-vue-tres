import { DataTexture, FluidFireShaderContext } from "../FluidFireShaderContext";
import { Fn } from "three/tsl";
import { float, If, vec3, vec4 } from "three/tsl";

// export const jacobiPass = (context: FluidFireShaderContext, readFrom: DataTexture, writeTo: DataTexture) => () => {
// 	const coord = context.grid.phy.coord;
// 	const uvw = context.grid.phy.uvw;
// 	const grid = context.grid.phy;
// 	const voxelLocalPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
// 	const currentPressure = readFrom.sample(uvw).x;

// 	const pressureOf = (u: number, v: number, w: number) => {
// 		const pressure = float(0).toVar();

// 		context.collisions.checkCollisionAt(
// 			grid,
// 			context.uVolumeWorldSize,
// 			context.worldMatrix,
// 			voxelLocalPos,
// 			uvw,
// 			vec3(u, v, w),
// 			false,
// 			// hit
// 			(otherUvw, hitDistance, normal) => {
// 				pressure.assign(currentPressure);
// 			},

// 			//miss
// 			(otherUvw) => pressure.assign(readFrom.sample(otherUvw).x),
// 		);

// 		return pressure;
// 	};

// 	const pR = pressureOf(1, 0, 0);
// 	const pL = pressureOf(-1, 0, 0);
// 	const pU = pressureOf(0, 1, 0);
// 	const pD = pressureOf(0, -1, 0);
// 	const pF = pressureOf(0, 0, 1);
// 	const pB = pressureOf(0, 0, -1);

// 	const divergence = context.texture.divergence.sample(uvw).x;

// 	const pressure = pR.add(pL).add(pU).add(pD).add(pF).add(pB).sub(divergence).div(6);

// 	writeTo.write(coord, vec4(pressure, 0, 0, 0));
// };
export const jacobiPass = (context: FluidFireShaderContext, readFrom: DataTexture, writeTo: DataTexture) => () => {
	const coord = context.grid.phy.coord;
	const uvw = context.grid.phy.uvw;
	const grid = context.grid.phy;
	const voxelLocalPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);

	// 1. Check if the CURRENT voxel itself is inside an obstacle
	//const worldPos = context.worldMatrix.mul(vec4(voxelLocalPos, 1.0)).xyz;
	const currentDist = context.collisions.distanceAtPoint(uvw);

	If(currentDist.lessThanEqual(0.0), () => {
		// Voxels inside solids have zero pressure
		writeTo.write(coord, vec4(0.0));
	}).Else(() => {
		const sumPressure = float(0.0).toVar();
		const fluidCount = float(0.0).toVar();

		// Helper to test each 6-way neighbor direction
		const checkNeighbor = (u: number, v: number, w: number) => {
			context.collisions.checkCollisionAt(
				grid,
				context.uVolumeWorldSize,
				context.worldMatrix,
				voxelLocalPos,
				uvw,
				vec3(u, v, w), // Step direction (ensure checkCollisionAt scales by texelSize!)
				false,

				// HIT (Solid obstacle): Do NOT add to sum or fluid count
				(otherUvw, hitDistance, normal) => {},

				// MISS (Open fluid): Accumulate pressure & increment fluid neighbor count
				(otherUvw) => {
					sumPressure.addAssign(readFrom.sample(otherUvw).x);
					fluidCount.addAssign(1.0);
				},
			);
		};

		// Sample 6 neighbors
		checkNeighbor(1, 0, 0);
		checkNeighbor(-1, 0, 0);
		checkNeighbor(0, 1, 0);
		checkNeighbor(0, -1, 0);
		checkNeighbor(0, 0, 1);
		checkNeighbor(0, 0, -1);

		const divergence = context.texture.divergence.sample(uvw).x;

		const finalPressure = float(0.0).toVar();

		// Divide by the number of OPEN fluid faces (Neumann boundary condition)
		If(fluidCount.greaterThan(0.0), () => {
			finalPressure.assign(sumPressure.sub(divergence).div(fluidCount));
		});

		writeTo.write(coord, vec4(finalPressure, 0, 0, 0));
	});
};
