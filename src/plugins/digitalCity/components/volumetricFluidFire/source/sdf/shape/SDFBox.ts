import { Node } from "three/webgpu";
import { SDFShape } from "./SDFShape";
import { abs, length, max, min } from "three/tsl";

export class SDFBox extends SDFShape {
	override sdf(localPos: Node<"vec3">, halfExtents: Node<"vec3">): Node<"float"> {
		const q = abs(localPos).sub(halfExtents);
		return length(max(q, 0.0)).add(min(max(q.x, max(q.y, q.z)), 0.0));
	}
}
