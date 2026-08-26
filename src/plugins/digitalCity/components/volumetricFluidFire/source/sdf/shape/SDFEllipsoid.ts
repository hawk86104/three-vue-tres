import { Node } from "three/webgpu";
import { SDFShape } from "./SDFShape";
import { abs, length, max, min } from "three/tsl";

export class SDFEllipsoid extends SDFShape {
	override sdf(position: Node<"vec3">, radii: Node<"vec3">): Node<"float"> {
		// k0 measures the distance relative to the non-uniform radii
		const k0 = length(position.div(radii));

		// k1 adjusts the gradient magnitude so the distance field stays accurate
		const k1 = length(position.div(radii.mul(radii)));

		return k0.mul(k0.sub(1.0)).div(k1);
	}
}
