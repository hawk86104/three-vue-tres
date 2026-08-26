import { FluidFireShaderContext } from "../FluidFireShaderContext";
import { ComputeNodeHook } from "../EmitterManager";
import {
	ceil,
	Continue,
	distance,
	dot,
	float,
	If,
	int,
	ivec3,
	length,
	Loop,
	max,
	mix,
	mx_noise_float,
	smoothstep,
	sqrt,
	uvec3,
	vec3,
	vec4,
} from "three/tsl";

export const emitObjectPassFragment: (context: FluidFireShaderContext) => ComputeNodeHook =
	(context) => (vertexPos, worldPos, emitMultiplier, worldMatrix, objVelData, tintFactor) => {
		context.insideBoundingVolume(worldPos, (uvw) => {
			const grid = context.grid.dye;
			const gridDims = uvec3(grid.size.x, grid.size.y, grid.size.z);
			const centerCoord = uvec3(uvw.mul(gridDims));
			const voxelSizeWorld = context.uVolumeWorldSize.div(gridDims);
			const invGridDims = vec3(1.0).div(gridDims);

			const baseEmission = context.uEmitTemperature.greaterThan(0.0).select(float(1.0), float(0.0));
			const emissionFactor = baseEmission.mul(emitMultiplier);

			// Object velocity and motion vector over this frame
			const objVelocity = objVelData.xyz;
			const motionVec = objVelocity.mul(context.uDt); // Vector from prev -> current pos

			// Instant ignition density boost
			const densityBaseVal = context.uEmitDensity.mul(float(1 / 20)).mul(emissionFactor);
			const tempBaseVal = context.uEmitTemperature.mul(0.05);

			If(densityBaseVal.greaterThan(0.0), () => {
				const currentDye = context.texture.dye.A.sample(uvw);

				const addedDensity = densityBaseVal.mul(1);
				const addedTemp = tempBaseVal.mul(1);

				const newDensity = currentDye.r.add(addedDensity).clamp(0, 1); // Clamped to 5.0 as you had in your edit
				const newTemp = currentDye.g.add(addedTemp);

				const addedColorMass = addedDensity.mul(tintFactor);
				const newColorMass = currentDye.a.add(addedColorMass);

				// Calculate the weight and strictly clamp it between 0.0 and 1.0
				const ageMixWeight = densityBaseVal.div(max(newDensity, 0.001)).clamp(0.0, 1.0);

				// Now it will safely interpolate between currentDye.b and 0.0
				const newAge = mix(currentDye.b, float(0.0), ageMixWeight); // 3. Reset age proportionally based on how much fresh fire was injected

				// 4. Safely write back to the correct offset coordinate
				context.texture.dye.B.write(centerCoord, vec4(newDensity, newTemp, newAge, newColorMass));

				//});
			});
		});
	};

export const emitObjectsVelocityAndDyePassFragment: (context: FluidFireShaderContext) => ComputeNodeHook =
	(context) => (vertexPos, worldPos, emitMultiplier, worldMatrix, objVelData) => {
		//
		context.insideBoundingVolume(worldPos, (uvw) => {
			const grid = context.grid.phy;
			const coord = uvec3(uvw.mul(vec3(grid.size.x, grid.size.y, grid.size.z)));

			const objVelocity = objVelData.xyz;
			const objSpeed = objVelData.w;

			If(objSpeed.greaterThan(0.001), () => {
				// Read directly from velTexA
				const currentVel = context.texture.vel.B.sample(uvw).xyz;

				const velocityImpulse = objVelocity.mul(-0.1).mul(objSpeed); //
				const newVel = currentVel.add(velocityImpulse);

				//context.texture.vel.A.write(coord, vec4(newVel, 1.0));
			});
		});
	};
