import { Node, Vector3Like } from "three/webgpu";
import { FluidFireShaderContext } from "../FluidFireShaderContext";
import { cross, float, length, vec3, vec4 } from "three/tsl";

export const vorticityPass = (context: FluidFireShaderContext) => () => {
	const grid = context.grid.phy;
	const coord = grid.coord;
	const uvw = grid.uvw;

	const texel = grid.texel;

	// 1. Sample 6 neighboring velocity vectors
	const velR = context.texture.vel.A.sample(uvw.add(vec3(texel.x, 0, 0))).xyz; // Right (+X)
	const velL = context.texture.vel.A.sample(uvw.sub(vec3(texel.x, 0, 0))).xyz; // Left (-X)
	const velU = context.texture.vel.A.sample(uvw.add(vec3(0, texel.y, 0))).xyz; // Up (+Y)
	const velD = context.texture.vel.A.sample(uvw.sub(vec3(0, texel.y, 0))).xyz; // Down (-Y)
	const velF = context.texture.vel.A.sample(uvw.add(vec3(0, 0, texel.z))).xyz; // Front (+Z)
	const velB = context.texture.vel.A.sample(uvw.sub(vec3(0, 0, texel.z))).xyz; // Back (-Z)

	// 2. Compute Curl (Vorticity) using central differences:
	// w.x = (dVz / dy) - (dVy / dz)
	const wx = velU.z.sub(velD.z).sub(velF.y.sub(velB.y)).mul(0.5);

	// w.y = (dVx / dz) - (dVz / dx)
	const wy = velF.x.sub(velB.x).sub(velR.z.sub(velL.z)).mul(0.5);

	// w.z = (dVy / dx) - (dVx / dy)
	const wz = velR.y.sub(velL.y).sub(velU.x.sub(velD.x)).mul(0.5);

	const vorticity = vec3(wx, wy, wz);
	const magnitude = length(vorticity);

	// 3. Write vorticity vector (xyz) and scalar magnitude (w)
	context.texture.vorticity.write(coord, vec4(vorticity, magnitude));
};

export const applyVorticity = (
	context: FluidFireShaderContext,
	uvw: Node<"vec3">,
	texel: Vector3Like,
	vel: Node<"vec3">,
) => {
	// 1. Sample local vorticity vector and magnitude
	const vortData = context.texture.vorticity.sample(uvw);
	const omega = vortData.xyz;

	// 2. Sample neighbor magnitudes (.w channel) to find gradient N = grad(|omega|)
	const vortR = context.texture.vorticity.sample(uvw.add(vec3(texel.x, 0, 0))).w;
	const vortL = context.texture.vorticity.sample(uvw.sub(vec3(texel.x, 0, 0))).w;
	const vortU = context.texture.vorticity.sample(uvw.add(vec3(0, texel.y, 0))).w;
	const vortD = context.texture.vorticity.sample(uvw.sub(vec3(0, texel.y, 0))).w;
	const vortF = context.texture.vorticity.sample(uvw.add(vec3(0, 0, texel.z))).w;
	const vortB = context.texture.vorticity.sample(uvw.sub(vec3(0, 0, texel.z))).w;

	const eta = vec3(vortR.sub(vortL), vortU.sub(vortD), vortF.sub(vortB)).mul(0.5);

	// 3. Normalize gradient (add small epsilon to avoid division by zero)
	const N = eta.div(length(eta).add(0.00001));

	// 4. Calculate Confinement Force = epsilon * (N x omega)
	const confinementForce = cross(N, omega).mul(context.uVorticityConfinementStrength);

	// 5. Add to velocity
	vel.addAssign(confinementForce.mul(context.uDt));
};
