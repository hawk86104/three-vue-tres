import { FluidFireShaderContext } from "../FluidFireShaderContext";
import { float, floor, Fn, If, max, vec3, vec4 } from "three/tsl";

export const advectDyePass = (context: FluidFireShaderContext) => () => {
	const coord = context.grid.dye.coord;
	const uvw = context.grid.dye.uvw;
	const grid = context.grid.dye;

	const vel = context.texture.vel.A.sample(uvw).xyz;
	const velUVW = vel.div(context.uVolumeWorldSize);
	const prevPos = uvw.sub(velUVW.mul(context.uDt)).toVar();

	// check if the prev pos is inside a collider....
	const localPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
	const worldPos = context.worldMatrix.mul(localPos).xyz;
	const prevDist = context.collisions.distanceAtPoint(uvw).toVar();
	// If the source position came from inside an object, push it back to the surface
	If(prevDist.lessThan(0.0), () => {
		const normal = context.collisions.normalAtPoint(uvw);
		// Move the sampling point out of the obstacle along the normal
		// prevPos is uvw...
		// 1. Move world position out of the obstacle along the normal
		worldPos.addAssign(normal.mul(prevDist.abs()));

		// 2. Transform corrected worldPos back to local box space
		const correctedLocalPos = context.invWorldMatrix.mul(vec4(worldPos, 1.0)).xyz;

		// 3. Convert localPos back to 0.0 - 1.0 UVW range
		prevPos.assign(correctedLocalPos.div(context.uVolumeWorldSize).add(0.5));
	});
	//------------------------

	const dye = context.texture.dye.A.sample(prevPos);
	const dissipationFactor = max(float(1).sub(context.uDissipation.mul(context.uDt)), 0);

	const density = dye.r.mul(dissipationFactor).toVar();
	const temperature = dye.g.mul(max(float(1).sub(context.uCooling.mul(context.uDt)), 0)).toVar();

	const tintFactor = dye.a;
	const colorMass = tintFactor.mul(dissipationFactor).toVar();

	// Nearest neighbor lookup for age to prevent numerical diffusion
	const gridDims = vec3(grid.size.x, grid.size.y, grid.size.z);
	const nearestUVW = floor(prevPos.mul(gridDims)).add(0.5).div(gridDims);
	const age = context.texture.dye.A.sample(nearestUVW).b.add(context.uDt).toVar();

	//temperature.assign(temperature.clamp(0, 3));

	If(density.lessThanEqual(0.01), () => {
		age.assign(0.0);
	});

	context.texture.dye.B.write(coord, vec4(density, temperature, age, colorMass));

	// const localPos = uvw.sub(0.5).mul(context.uVolumeWorldSize);
	// const foo = vec3(0, 0, 0).toVar();

	// context.collisions.makeVelocityAvoidColliders(foo, context.worldMatrix.mul(localPos).xyz);
	// context.texture.dye.B.write(coord, vec4(foo.length().mul(123), 1, 0, 0));
};
