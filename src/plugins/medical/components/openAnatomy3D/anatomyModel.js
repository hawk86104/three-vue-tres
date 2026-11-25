import { Box3, Color, Group, Mesh, MeshStandardMaterial, ShaderMaterial, SphereGeometry, Vector3 } from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'

// Model colors, skin shader and joint hotspots adapted from Open Anatomy 3D (MIT).
const surfaces = {
    joints: { opacity: 0, roughness: 0.4 },
    skeleton: { opacity: 0.55, roughness: 0.7 },
    muscles: { opacity: 0.85, roughness: 0.6 },
    organs: { opacity: 1, roughness: 0.45 },
    vessels: { opacity: 1, roughness: 0.35 },
    nerves: { opacity: 1, roughness: 0.5 },
}
const skinRim = '#d98c6a'
const hoverColor = '#ff7a2f'
const pinColor = '#e5391b'

function createSkinMaterial(color) {
    return new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { skinColor: { value: new Color(color) }, rimColor: { value: new Color(skinRim) } },
        vertexShader: /* glsl */ `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vView = -mv.xyz;
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 skinColor;
            uniform vec3 rimColor;
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec3 normal = normalize(vNormal);
                float rim = pow(1.0 - clamp(abs(dot(normal, normalize(vView))), 0.0, 1.0), 2.2);
                float light = 0.75 + 0.25 * max(dot(normal, normalize(vec3(0.3, 0.6, 0.8))), 0.0);
                gl_FragColor = vec4(mix(skinColor, rimColor, rim) * light, 0.07 + 0.5 * rim);
            }
        `,
    })
}

export function updatePartHighlight(part, hovered, pinned) {
    const { material, structure } = part
    const color = hovered ? hoverColor : pinColor
    if (structure.system === 'skin') {
        material.uniforms.rimColor.value.set(hovered || pinned ? color : skinRim)
        return
    }
    material.emissive.set(color)
    material.emissiveIntensity = hovered ? 0.75 : pinned ? 0.45 : 0
    const baseOpacity = surfaces[structure.system].opacity
    const highlightOpacity = structure.system === 'joints' ? 0.55 : 1
    const opacity = hovered || pinned ? highlightOpacity : baseOpacity
    if (material.opacity !== opacity) {
        material.opacity = opacity
        material.transparent = opacity < 1
        material.depthWrite = opacity === 1
        material.needsUpdate = true
    }
}

export function prepareAnatomy(root, catalog, sex) {
    const byKey = new Map(catalog.map((structure) => [structure.key, structure]))
    const groups = new Map(root.children.map((group) => [group.userData.name ?? group.name, group]))
    const parts = new Map()
    const pickMeshes = []
    const originalMaterials = new Set()

    function addMesh(mesh, structure) {
        let part = parts.get(structure.key)
        if (!part) {
            const material = structure.system === 'skin'
                ? createSkinMaterial(structure.color)
                : new MeshStandardMaterial({ color: structure.color, roughness: surfaces[structure.system].roughness })
            part = { structure, material, bounds: new Box3() }
            parts.set(structure.key, part)
            updatePartHighlight(part, false, false)
        }
        originalMaterials.add(mesh.material)
        mesh.material = part.material
        part.bounds.expandByObject(mesh)
        if (structure.system === 'skin') {
            mesh.renderOrder = 10
        } else {
            mesh.geometry.boundsTree ??= new MeshBVH(mesh.geometry, { indirect: true })
            mesh.raycast = acceleratedRaycast
            mesh.userData.anatomy = structure
            pickMeshes.push(mesh)
        }
    }

    root.updateMatrixWorld(true)
    try {
        root.traverse((mesh) => {
            if (!mesh.isMesh) return
            // Prefer the original glTF name because a group and its skin mesh share a name.
            let owner = mesh
            while (owner && !byKey.has(owner.userData.name ?? owner.name)) owner = owner.parent
            const structure = owner && byKey.get(owner.userData.name ?? owner.name)
            if (structure) addMesh(mesh, structure)
        })

        const joints = new Group()
        root.add(joints)
        joints.updateWorldMatrix(true, false)
        groups.set('joints', joints)
        const jointGeometry = new SphereGeometry(0.038, 16, 12)
        for (const structure of catalog) {
            const anchor = sex === 'female' ? structure.anchorFemale : structure.anchor
            if (structure.system !== 'joints' || !anchor) continue
            const mesh = new Mesh(jointGeometry, null)
            mesh.position.fromArray(anchor)
            mesh.renderOrder = 5
            joints.add(mesh)
            addMesh(mesh, structure)
        }

        for (const part of parts.values()) part.center = root.worldToLocal(part.bounds.getCenter(new Vector3()))
        return { root, groups, parts, pickMeshes }
    } finally {
        for (const material of originalMaterials) material?.dispose()
    }
}

export function disposeAnatomy(root) {
    const resources = new Set()
    root.traverse((mesh) => {
        if (!mesh.isMesh) return
        mesh.geometry.boundsTree = null
        resources.add(mesh.geometry)
        resources.add(mesh.material)
    })
    for (const resource of resources) resource?.dispose()
}
