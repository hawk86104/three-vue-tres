# AetherTwin M2.4 Synchronized 3D Design

**Status:** Approved as part of the M2 design on 2026-07-22
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Consumes:** M2.1–M2.3 schema-v3 showroom snapshot

## 1. Goal

Provide a synchronized, read-only-from-model 3D preview with parametric showroom geometry, basic materials, one restrained light environment, shared selection, and a renderer boundary usable by M2.5 export.

## 2. Coordinate and projection rules

The pure scene projector converts world millimetres to Three.js metres:

```text
threeX = worldX / 1000
threeY = elevation / 1000
threeZ = -worldY / 1000
```

The negative Z mapping preserves the M1 world-Y-up plan orientation when viewed from above. Scene records retain source business IDs so selection never depends on Three.js object identity.

Only the active floor is projected. Plan references are not rendered as 3D geometry. Room/zone polygons produce floor surfaces. Walls use centre-line, thickness, and explicit height or the 3,000 mm default. Doors/windows split wall prisms into deterministic pieces; M2 does not use mutable runtime CSG. Openings that cross a wall joint were already rejected by M2.2.

Fixtures use the `mode-showroom` primitive descriptors and their durable dimensions. Product hotspots become restrained markers. The resolved guided route becomes a polyline slightly above the floor. Dimensions and 2D-only guides are not part of the 3D scene.

## 3. Materials and environment

M2 uses a small PBR subset:

- sRGB base colour;
- roughness and metalness in `[0, 1]`;
- opacity in `(0, 1]`;
- optional imported image texture;
- no custom shader, node graph, remote environment map, or arbitrary material code.

Material base colours use canonical `#RRGGBB`. One optional image texture is fitted once across the target's local bounds with no M2 repeat/UV authoring controls. Assignments may target room/zone floor surfaces, walls, or fixtures. Missing/invalid textures fall back to the material base colour with a typed asset issue.

The default `SceneEnvironment` is:

- background `#101820`;
- ambient colour `#dce8f0`, intensity `0.55`;
- key-light colour `#fff1dc`, intensity `1.1`, direction `[4, 8, 5]` before normalization;
- shadows enabled with softness `0.5` and one soft directional shadow source.

All colours use canonical `#RRGGBB`. Ambient intensity is in `[0, 4]`, key-light intensity is in `[0, 8]`, the direction is a finite non-zero three-vector with each component in `[-100, 100]`, and shadow softness is in `[0, 1]`. Studio may edit only these bounded fields through `scene.environment.patch`; it does not create arbitrary lights.

## 4. Renderer architecture

`render-scene-3d` has two layers:

1. a pure projector from validated snapshot plus transient selection/resolved route to immutable scene records;
2. a React Three Fiber adapter that reconciles records, manages Three.js resources, exposes camera/render/export ports, and disposes geometry, material, texture, controls, render target, and renderer resources.

The package pins the exact compatible runtime set `react@19.2.7`, `react-dom@19.2.7`, `three@0.185.1`, `@react-three/fiber@9.6.1`, and `@react-three/drei@10.7.7`. `package.json` uses exact versions and the lockfile must resolve those same versions; no floating range is accepted.

Runtime orbit camera state is Zustand-only. Project materials/environment change only through ProjectStore. 3D selection writes only the shared transient selected-ID set; it never mutates a business record.

## 5. Studio interaction

The centre workspace supports `2D`, `3D`, and `split`, defaulting to 2D. Active floor, selection, snapshot, degraded asset issues, and resolved route are shared. Split panes are fixed and lightweight; M2 does not introduce a general docking IDE.

The 3D preview supports orbit/pan/zoom, click/keyboard selection through the synchronized tree, selected-object framing, material preview, resolved-route visibility/framing, and the export camera port. Project geometry editing remains 2D-first. Inspector material/environment edits are explicit ProjectStore commands.

`/dev/scene-gallery` becomes a real development-only gallery for the seven fixture descriptors, wall/opening cases, floor polygons, hotspot markers, route styles, missing textures, and the default environment. It is not a production feature entry.

## 6. Failure behavior

- WebGL/renderer creation failure preserves the complete 2D editor and disables 3D/export with an explanation.
- Projection validation failure identifies source record IDs and creates no partial scene.
- Texture decode/load failure uses base-colour fallback and a visible asset issue.
- Context loss releases invalid resources and offers a bounded renderer reinitialization; it does not change project data.
- Unmount, project replacement, floor change, and renderer replacement dispose owned GPU and object-URL resources exactly once.

## 7. Verification and acceptance

Automated evidence covers coordinate conversion, floor triangulation inputs, wall/opening pieces, all fixture descriptors, material/environment mapping, hotspot/route projection, selection IDs, camera-port inputs, incremental reconciliation, context-loss state, and exact disposal. Studio tests inject a fake renderer and do not claim GPU execution.

M2.4 is accepted at the source/automated boundary when a complete showroom snapshot projects to one coherent scene, 2D/3D/split share selection and active floor, material/environment changes survive save/reopen, and all renderer resources have verified lifecycle tests. Real WebGL/GPU and visual evidence remain unclaimed unless separately approved.
