import * as THREE from "three";
import { acceleratedRaycast, MeshBVH, MeshBVHHelper } from "three-mesh-bvh";
import type { GLTF } from "three/examples/jsm/Addons.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MobileControls } from "./mobileControls";
import type {
    MobileControlsOptions,
    PlayerControllerInput,
    PlayerControllerOptions,
    PlayerModelOptions,
    VehicleModelOptions,
} from "./types";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

let activeController: PlayerController | null = null;
const clock = new THREE.Clock();

function isMobileDevice() {
    return (
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
        (typeof window !== "undefined" && "ontouchstart" in window) ||
        (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
    );
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
    if (!material) return;
    if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
        return;
    }
    material.dispose();
}

class PlayerController {
    private readonly loader = new GLTFLoader();
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private controls!: OrbitControls;

    private playerModel!: PlayerModelOptions;
    private initPos = new THREE.Vector3();
    private mouseSensitivity = 5;
    private thirdMouseMode: 0 | 1 | 2 | 3 = 1;
    private enableZoom = false;
    private enableOverShoulderView = false;
    private playerFlyEnabled = true;
    private isShowMobileControls = true;
    private mobileOptions: MobileControlsOptions = { joystick: true, jump: true, fly: true, view: true };

    private readonly baseGravity = -2400;
    private readonly baseJumpHeight = 800;
    private readonly basePlayerSpeed = 400;
    private readonly basePlayerFlySpeed = 2100;
    private readonly baseCamEpsilon = 35;
    private readonly capsuleBaseHeight = 180;

    private configuredGravity = this.baseGravity;
    private configuredJumpHeight = this.baseJumpHeight;
    private configuredPlayerSpeed = this.basePlayerSpeed;
    private configuredPlayerFlySpeed = this.basePlayerFlySpeed;
    private configuredMinCamDistance = 100;
    private configuredMaxCamDistance = 440;

    private gravity = this.baseGravity;
    private jumpHeight = this.baseJumpHeight;
    private playerSpeed = this.basePlayerSpeed;
    private playerFlySpeed = this.basePlayerFlySpeed;
    private curPlayerSpeed = this.basePlayerSpeed;

    private playerCapsuleRadius = 45;
    private playerCapsuleHeight = this.capsuleBaseHeight;
    private playerCapsuleRadiusRatio = 1;
    private isFirstPerson = false;
    private boundingBoxMinY = 0;

    private readonly camCollisionLerp = 0.18;
    private camEpsilon = this.baseCamEpsilon;
    private minCamDistance = 100;
    private maxCamDistance = 440;
    private originMaxCamDistance = 440;

    private displayPlayer = false;
    private displayCollider = false;
    private displayVisualizer = false;

    private collider: THREE.Mesh | null = null;
    private extraRaycastColliders: THREE.Object3D[] = [];
    private visualizer: MeshBVHHelper | null = null;
    private player!: THREE.Mesh & { capsuleInfo?: any };
    private person: THREE.Object3D | null = null;
    private personHead: THREE.Object3D | null = null;
    private vehicle: THREE.Object3D | null = null;
    private collected: THREE.BufferGeometry[] = [];

    private playerIsOnGround = false;
    private isupdate = true;
    private isFlying = false;

    private fwdPressed = false;
    private bkdPressed = false;
    private lftPressed = false;
    private rgtPressed = false;
    private spacePressed = false;
    private ctPressed = false;
    private shiftPressed = false;

    private personMixer?: THREE.AnimationMixer;
    private personMixerFinishedCb?: (event: any) => void;
    private personActions?: Map<string, THREE.AnimationAction>;
    private actionState?: THREE.AnimationAction;
    private recheckAnimTimer: ReturnType<typeof setTimeout> | null = null;
    private vehicleMixer?: THREE.AnimationMixer;
    private vehicleActions?: Map<string, THREE.AnimationAction>;

    private mobileControls: MobileControls | null = null;

    private readonly playerVelocity = new THREE.Vector3();
    private readonly upVector = new THREE.Vector3(0, 1, 0);
    private readonly camDir = new THREE.Vector3();
    private readonly moveDir = new THREE.Vector3();
    private readonly targetQuat = new THREE.Quaternion();
    private readonly targetMat = new THREE.Matrix4();
    private readonly rotationSpeed = 10;
    private readonly DIR_FWD = new THREE.Vector3(0, 0, -1);
    private readonly DIR_BKD = new THREE.Vector3(0, 0, 1);
    private readonly DIR_LFT = new THREE.Vector3(-1, 0, 0);
    private readonly DIR_RGT = new THREE.Vector3(1, 0, 0);
    private readonly DIR_UP = new THREE.Vector3(0, 1, 0);

    private readonly personToCam = new THREE.Vector3();
    private readonly rayOrigin = new THREE.Vector3();
    private readonly tempVector = new THREE.Vector3();
    private readonly tempVector2 = new THREE.Vector3();
    private readonly tempBox = new THREE.Box3();
    private readonly tempMat = new THREE.Matrix4();
    private readonly tempSegment = new THREE.Line3();
    private readonly raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    private readonly raycasterPersonToCam = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());

    constructor() {
        (this.raycaster as any).firstHitOnly = true;
        (this.raycasterPersonToCam as any).firstHitOnly = true;
    }

    async init(options: PlayerControllerOptions, callback?: () => void) {
        this.scene = options.scene;
        this.camera = options.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = options.controls as OrbitControls;

        this.playerModel = { ...options.playerModel };
        this.initPos = options.initPos?.clone() ?? new THREE.Vector3(0, 0, 0);
        this.mouseSensitivity = options.mouseSensitivity ?? this.mouseSensitivity;
        this.thirdMouseMode = options.thirdMouseMode ?? this.thirdMouseMode;
        this.enableZoom = options.enableZoom ?? this.enableZoom;
        this.enableOverShoulderView = options.enableOverShoulderView ?? this.enableOverShoulderView;
        this.playerFlyEnabled = this.playerModel.flyEnabled ?? this.playerFlyEnabled;
        this.playerCapsuleRadiusRatio = this.playerModel.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
        this.mobileOptions = { joystick: true, jump: true, fly: true, view: true, ...options.mobileControls };

        this.configuredGravity = this.playerModel.gravity ?? this.configuredGravity;
        this.configuredJumpHeight = this.playerModel.jumpHeight ?? this.configuredJumpHeight;
        this.configuredPlayerSpeed = this.playerModel.speed ?? this.configuredPlayerSpeed;
        this.configuredPlayerFlySpeed = this.playerModel.flySpeed ?? this.configuredPlayerFlySpeed;
        this.configuredMinCamDistance = options.minCamDistance ?? this.configuredMinCamDistance;
        this.configuredMaxCamDistance = options.maxCamDistance ?? this.configuredMaxCamDistance;
        this.syncScaledConfig();

        this.isShowMobileControls = (options.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();
        if (this.isShowMobileControls) {
            this.mobileControls = new MobileControls((input) => this.setInput(input), this.controls);
            await this.mobileControls.init({
                ...this.mobileOptions,
                fly: (this.mobileOptions.fly ?? true) && this.playerFlyEnabled,
            });
        }

        await this.createBVH(options.colliderMeshUrl);
        await this.loadPersonGLB();

        this.onAllEvent();
        this.setCameraPos();
        this.setControls();
        this.setOverShoulderView(this.enableOverShoulderView);
        callback?.();
    }

    private syncScaledConfig() {
        const scale = this.playerModel?.scale ?? 1;
        this.gravity = this.configuredGravity * scale;
        this.jumpHeight = this.configuredJumpHeight * scale;
        this.playerSpeed = this.configuredPlayerSpeed * scale;
        this.playerFlySpeed = this.configuredPlayerFlySpeed * scale;
        this.curPlayerSpeed = this.playerSpeed;
        this.minCamDistance = this.configuredMinCamDistance * scale;
        this.maxCamDistance = this.configuredMaxCamDistance * scale;
        this.originMaxCamDistance = this.maxCamDistance;
        this.camEpsilon = this.baseCamEpsilon * scale;
    }

    setOverShoulderView(enable: boolean) {
        this.enableOverShoulderView = enable;
        if (!this.camera?.clearViewOffset) return;
        if (!enable || this.isFirstPerson) {
            this.camera.clearViewOffset();
            return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.setViewOffset(width, height, width * 0.15, 0, width, height);
    }

    private async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/gltf/");
        dracoLoader.setDecoderConfig({ type: "js" });
        this.loader.setDRACOLoader(dracoLoader);
    }

    private ensureAttributesMinimal(geometry: THREE.BufferGeometry) {
        if (!geometry.attributes.position) return null;
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        if (!geometry.attributes.uv) {
            const count = geometry.attributes.position.count;
            geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        return geometry;
    }

    private unifiedAttribute(collected: THREE.BufferGeometry[]) {
        type AttrMeta = {
            itemSize: number;
            arrayCtor: any;
            normalized: boolean;
        };

        const attrMap = new Map<string, AttrMeta>();
        const attrConflict = new Set<string>();
        const required = new Set(["position", "normal", "uv"]);

        for (const geometry of collected) {
            for (const name of Object.keys(geometry.attributes)) {
                if (!required.has(name)) geometry.deleteAttribute(name);
            }
        }

        for (const geometry of collected) {
            for (const name of Object.keys(geometry.attributes)) {
                const attribute = geometry.attributes[name] as THREE.BufferAttribute;
                const arrayCtor = (attribute.array as any).constructor;
                const cached = attrMap.get(name);

                if (!cached) {
                    attrMap.set(name, {
                        itemSize: attribute.itemSize,
                        arrayCtor,
                        normalized: attribute.normalized,
                    });
                    continue;
                }

                if (
                    cached.itemSize !== attribute.itemSize ||
                    cached.arrayCtor !== arrayCtor ||
                    cached.normalized !== attribute.normalized
                ) {
                    attrConflict.add(name);
                }
            }
        }

        for (const name of attrConflict) {
            for (const geometry of collected) {
                if (geometry.attributes[name]) geometry.deleteAttribute(name);
            }
            attrMap.delete(name);
        }

        for (const [name, meta] of attrMap) {
            for (const geometry of collected) {
                if (geometry.attributes[name]) continue;
                const count = geometry.attributes.position.count;
                geometry.setAttribute(
                    name,
                    new THREE.BufferAttribute(new meta.arrayCtor(count * meta.itemSize), meta.itemSize, meta.normalized),
                );
            }
        }

        return collected;
    }

    private collectMeshGeometry(mesh: THREE.Mesh, bucket: THREE.BufferGeometry[]) {
        try {
            let geometry = (mesh.geometry as THREE.BufferGeometry).clone();
            mesh.updateWorldMatrix(true, false);
            geometry.applyMatrix4(mesh.matrixWorld);
            if (geometry.index) geometry = geometry.toNonIndexed();
            const safeGeometry = this.ensureAttributesMinimal(geometry);
            if (safeGeometry) bucket.push(safeGeometry);
        } catch (error) {
            console.warn("处理网格时出错：", mesh, error);
        }
    }

    private shouldIgnoreColliderObject(object: THREE.Object3D) {
        return Boolean(object?.userData?.playerControllerIgnoreCollider);
    }

    private shouldUseRaycastOnlyCollider(object: THREE.Object3D) {
        return Boolean(object?.userData?.playerControllerRaycastOnly) && typeof (object as any)?.raycast === "function";
    }

    private registerExtraRaycastCollider(object: THREE.Object3D) {
        if (!object || this.extraRaycastColliders.some((item) => item.uuid === object.uuid)) return;
        this.extraRaycastColliders.push(object);
    }

    private getObjectBoundingMinY(object: THREE.Object3D): number {
        const customBoundingBox = (object as any).getBoundingBox?.();
        if (customBoundingBox?.isBox3) {
            const worldBox = customBoundingBox.clone();
            object.updateWorldMatrix(true, false);
            worldBox.applyMatrix4(object.matrixWorld);
            return worldBox.min.y;
        }

        object.updateWorldMatrix(true, false);
        const worldBox = new THREE.Box3().setFromObject(object);
        return Number.isFinite(worldBox.min.y) ? worldBox.min.y : Infinity;
    }

    private getExtraRaycastCollidersMinY() {
        if (!this.extraRaycastColliders.length) return Infinity;
        const minY = this.extraRaycastColliders.reduce((result, object) => {
            return Math.min(result, this.getObjectBoundingMinY(object));
        }, Infinity);
        return Number.isFinite(minY) ? minY : Infinity;
    }

    private intersectWorldColliders(raycaster: THREE.Raycaster) {
        const intersections: THREE.Intersection[] = [];

        if (this.collider) {
            intersections.push(...raycaster.intersectObject(this.collider, false));
        }

        for (const object of this.extraRaycastColliders) {
            intersections.push(...raycaster.intersectObject(object, false));
        }

        intersections.sort((a, b) => a.distance - b.distance);
        return intersections;
    }

    async createBVH(meshUrl = ""): Promise<void> {
        await this.initLoader();
        this.collected = [];
        this.extraRaycastColliders = [];

        if (this.visualizer) {
            this.scene.remove(this.visualizer);
            this.visualizer = null;
        }

        if (this.collider) {
            this.scene.remove(this.collider);
            this.collider.geometry?.dispose?.();
            disposeMaterial(this.collider.material);
            this.collider = null;
        }

        if (meshUrl) {
            const gltf = await this.loader.loadAsync(meshUrl);
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh?.isMesh && mesh.geometry && child.name !== "capsule") {
                    this.collectMeshGeometry(mesh, this.collected);
                }
            });
        } else {
            this.scene.updateMatrixWorld(true);
            this.scene.traverse((child) => {
                if (child.name === "capsule") return;
                if (this.shouldUseRaycastOnlyCollider(child)) {
                    this.registerExtraRaycastCollider(child);
                    return;
                }
                if (this.shouldIgnoreColliderObject(child)) return;
                const mesh = child as THREE.Mesh;
                if (mesh?.isMesh && mesh.geometry) {
                    this.collectMeshGeometry(mesh, this.collected);
                }
            });
        }

        if (!this.collected.length) {
            const extraMinY = this.getExtraRaycastCollidersMinY();
            this.boundingBoxMinY = Number.isFinite(extraMinY) ? extraMinY : 0;
            return;
        }

        this.collected = this.unifiedAttribute(this.collected);

        const mergedGeometry = BufferGeometryUtils.mergeGeometries(this.collected, false);
        if (!mergedGeometry) {
            console.error("合并几何失败");
            return;
        }

        mergedGeometry.computeBoundingBox();
        (mergedGeometry as any).boundsTree = new MeshBVH(mergedGeometry, { maxDepth: 100 });
        this.collider = new THREE.Mesh(
            mergedGeometry,
            new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true,
                wireframe: true,
                depthTest: true,
                side: THREE.DoubleSide,
            }),
        );

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            this.visualizer?.removeFromParent();
            this.visualizer = new MeshBVHHelper(this.collider, 0);
            this.scene.add(this.visualizer);
        }

        const colliderMinY = mergedGeometry.boundingBox?.min.y ?? 0;
        this.boundingBoxMinY = Math.min(colliderMinY, this.getExtraRaycastCollidersMinY());
    }

    private getBbox(object: THREE.Object3D) {
        object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        return { box, size, center };
    }

    private clearPlayerModel() {
        if (this.isFirstPerson && this.camera?.parent && this.scene) {
            this.scene.attach(this.camera);
        }

        if (this.personMixer) {
            if (this.personMixerFinishedCb) {
                this.personMixer.removeEventListener("finished", this.personMixerFinishedCb);
                this.personMixerFinishedCb = undefined;
            }
            this.personMixer.stopAllAction();
            this.personMixer.uncacheRoot(this.personMixer.getRoot());
            this.personMixer = undefined;
        }

        this.personActions = undefined;
        this.actionState = undefined;

        if (this.person?.parent) {
            this.person.parent.remove(this.person);
        }
        this.person?.traverse((child: any) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            disposeMaterial(child.material);
        });
        this.person = null;
        this.personHead = null;

        if (this.player) {
            this.scene.remove(this.player);
            this.player.geometry?.dispose?.();
            disposeMaterial(this.player.material);
        }

        (this.player as any) = null;
    }

    private clearVehicleModel() {
        if (this.vehicleMixer) {
            this.vehicleMixer.stopAllAction();
            this.vehicleMixer.uncacheRoot(this.vehicleMixer.getRoot());
            this.vehicleMixer = undefined;
        }
        this.vehicleActions = undefined;

        if (this.vehicle?.parent) {
            this.vehicle.parent.remove(this.vehicle);
        }
        this.vehicle?.traverse((child: any) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            disposeMaterial(child.material);
        });
        this.vehicle = null;
    }

    async loadPersonGLB() {
        try {
            const gltf = (await this.loader.loadAsync(this.playerModel.url)) as GLTF;
            this.person = gltf.scene;

            this.person.traverse((child: any) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
            });

            this.personMixer = new THREE.AnimationMixer(this.person);
            const animations = gltf.animations ?? [];
            this.personActions = new Map<string, THREE.AnimationAction>();

            const mappings: [string | undefined, string][] = [
                [this.playerModel.idleAnim, "idle"],
                [this.playerModel.walkAnim, "walking"],
                [this.playerModel.leftWalkAnim || this.playerModel.walkAnim, "left_walking"],
                [this.playerModel.rightWalkAnim || this.playerModel.walkAnim, "right_walking"],
                [this.playerModel.backwardAnim || this.playerModel.walkAnim, "walking_backward"],
                [this.playerModel.jumpAnim, "jumping"],
                [this.playerModel.runAnim, "running"],
                [this.playerModel.flyIdleAnim || this.playerModel.idleAnim, "flyidle"],
                [this.playerModel.flyAnim || this.playerModel.idleAnim, "flying"],
            ];

            for (const [clipName, actionName] of mappings) {
                if (!clipName) continue;
                const clip = animations.find((animation) => animation.name === clipName);
                if (!clip) continue;

                const action = this.personMixer.clipAction(clip);
                if (actionName === "jumping") {
                    action.setLoop(THREE.LoopOnce, 1);
                    action.clampWhenFinished = true;
                    action.setEffectiveTimeScale(1.2);
                } else {
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.clampWhenFinished = false;
                    action.setEffectiveTimeScale(1);
                }

                action.enabled = true;
                action.setEffectiveWeight(0);
                this.personActions.set(actionName, action);
            }

            const idleAction = this.personActions.get("idle") ?? this.personActions.values().next().value;
            if (!idleAction) {
                throw new Error("人物模型未找到可用动画");
            }

            idleAction.setEffectiveWeight(1);
            idleAction.play();
            this.actionState = idleAction;

            this.personMixerFinishedCb = (event: any) => {
                const finishedAction = event.action as THREE.AnimationAction;
                if (finishedAction !== this.personActions?.get("jumping")) return;

                if (this.fwdPressed) {
                    this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                    return;
                }
                if (this.bkdPressed) {
                    this.playPersonAnimationByName("walking_backward");
                    return;
                }
                if (this.rgtPressed || this.lftPressed) {
                    this.playPersonAnimationByName("walking");
                    return;
                }

                this.playPersonAnimationByName("idle");
            };
            this.personMixer.addEventListener("finished", this.personMixerFinishedCb);
            this.personMixer.update(0);
            this.person.updateMatrixWorld(true);

            const { size } = this.getBbox(this.person);
            const modelScale = this.capsuleBaseHeight / Math.max(size.y, 1);
            this.playerCapsuleHeight = this.capsuleBaseHeight;
            this.playerCapsuleRadius = Math.max(
                18,
                Number((Math.min(size.x, size.z) * modelScale * this.playerCapsuleRadiusRatio).toFixed(2)),
            );

            const scale = this.playerModel.scale;
            const radius = this.playerCapsuleRadius * scale;
            const height = this.playerCapsuleHeight * scale;

            this.player = new THREE.Mesh(
                new RoundedBoxGeometry(radius * 2, height, radius * 2, 1, 75),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color(1, 0, 0),
                    shadowSide: THREE.DoubleSide,
                    depthTest: false,
                    transparent: true,
                    opacity: this.displayPlayer ? 0.5 : 0,
                    wireframe: true,
                    depthWrite: false,
                }),
            ) as typeof this.player;

            this.player.geometry.translate(0, -height * 0.25, 0);
            this.player.capsuleInfo = {
                radius,
                segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -height * 0.5, 0)),
            };
            this.player.name = "capsule";
            this.scene.add(this.player);
            this.reset();
            this.player.rotateY(this.playerModel.rotateY ?? 0);

            this.person.scale.multiplyScalar(modelScale * scale);
            this.person.position.set(0, -height * 0.75, 0);
            this.person.traverse((child: any) => {
                if (child.name === this.playerModel.headObjName) {
                    this.personHead = child;
                }
            });

            this.player.add(this.person);
            this.reset();
        } catch (error) {
            console.error("加载玩家模型失败:", error);
        }
    }

    async loadVehicleModel(params: VehicleModelOptions) {
        try {
            this.clearVehicleModel();

            const { url, position, scale = 1 } = params;
            const gltf = (await this.loader.loadAsync(url)) as GLTF;
            this.vehicle = gltf.scene;
            this.vehicle.scale.set(scale, scale, scale);
            this.vehicle.position.copy(position);
            this.vehicle.traverse((child: any) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
            });

            this.scene.add(this.vehicle);

            const animations = gltf.animations ?? [];
            this.vehicleActions = new Map<string, THREE.AnimationAction>();
            this.vehicleMixer = new THREE.AnimationMixer(this.vehicle);

            const mappings: [string, string][] = [
                [params.animations?.openDoorAnim ?? "", "open_door"],
                [params.animations?.wheelsTurnAnim ?? "", "wheels_turn"],
                [params.animations?.turnLeftAnim ?? "", "turn_left"],
                [params.animations?.turnRightAnim ?? "", "turn_right"],
            ];

            for (const [clipName, actionName] of mappings) {
                if (!clipName) continue;
                const clip = animations.find((animation) => animation.name === clipName);
                if (!clip) continue;
                const action = this.vehicleMixer.clipAction(clip);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(2);
                action.enabled = true;
                action.setEffectiveWeight(0);
                this.vehicleActions.set(actionName, action);
            }
        } catch (error) {
            console.error("加载车辆模型失败:", error);
        }
    }

    async switchPlayerModel(nextModel: PlayerModelOptions) {
        if (!this.player) return;

        const savedPos = this.player.position.clone();
        const savedQuat = this.player.quaternion.clone();
        const wasFirstPerson = this.isFirstPerson;

        this.clearPlayerModel();
        this.playerModel = { ...this.playerModel, ...nextModel };
        this.playerFlyEnabled = this.playerModel.flyEnabled ?? this.playerFlyEnabled;
        this.playerCapsuleRadiusRatio = this.playerModel.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
        this.configuredGravity = this.playerModel.gravity ?? this.configuredGravity;
        this.configuredJumpHeight = this.playerModel.jumpHeight ?? this.configuredJumpHeight;
        this.configuredPlayerSpeed = this.playerModel.speed ?? this.configuredPlayerSpeed;
        this.configuredPlayerFlySpeed = this.playerModel.flySpeed ?? this.configuredPlayerFlySpeed;
        this.syncScaledConfig();

        await this.loadPersonGLB();

        if (!this.player) return;
        this.player.position.copy(savedPos);
        this.player.quaternion.copy(savedQuat);
        this.mobileControls?.setFlyEnabled(this.playerFlyEnabled);

        if (wasFirstPerson) {
            this.isFirstPerson = true;
            this.setFirstPersonCamera(this.camera.rotation.x);
        } else {
            this.isFirstPerson = false;
            this.setCameraPos();
        }
    }

    playPersonAnimationByName(name: string, fade = 0.18) {
        if (!this.personActions || this.ctPressed) return;

        const nextAction = this.personActions.get(name);
        if (!nextAction || this.actionState === nextAction) return;

        const previousAction = this.actionState;
        nextAction.reset();
        nextAction.setEffectiveWeight(1);
        nextAction.play();

        if (previousAction && previousAction !== nextAction) {
            previousAction.fadeOut(fade);
            nextAction.fadeIn(fade);
        } else {
            nextAction.fadeIn(fade);
        }

        this.actionState = nextAction;
    }

    changeView() {
        this.isFirstPerson = !this.isFirstPerson;

        if (this.isFirstPerson) {
            const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.quaternion);
            const flatDir = new THREE.Vector3(playerForward.x, 0, playerForward.z).normalize();

            if (flatDir.lengthSq() > 0.001) {
                const angleY = Math.atan2(flatDir.x, flatDir.z);
                this.player.rotation.set(0, angleY, 0);
            }

            this.setFirstPersonCamera();
            this.setOverShoulderView(false);
        } else {
            this.controls.enabled = true;
            this.scene.attach(this.camera);

            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(direction.z, direction.x);
            const scale = this.playerModel.scale;

            this.camera.position.copy(this.player.position).add(
                new THREE.Vector3(
                    Math.cos(angle) * 400 * scale,
                    200 * scale,
                    Math.sin(angle) * 400 * scale,
                ),
            );
            this.controls.target.copy(this.player.position);
            this.controls.enableZoom = this.enableZoom;
            this.setOverShoulderView(this.enableOverShoulderView);
        }

        this.setPointerLock(true);
    }

    private setFirstPersonCamera(verticalAngle = 0) {
        this.controls.enabled = false;

        if (this.personHead) {
            this.personHead.attach(this.camera);
            this.camera.position.set(0, 10, 20);
        } else {
            this.player.attach(this.camera);
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
        }

        this.camera.rotation.set(
            THREE.MathUtils.clamp(verticalAngle, -1.1, 1.4),
            Math.PI,
            0,
        );
        this.controls.enableZoom = false;
    }

    private shouldUsePointerLock() {
        return ((this.thirdMouseMode === 0 || this.thirdMouseMode === 1) && !this.isFirstPerson) || this.isFirstPerson;
    }

    private setPointerLock(forceRequest = false) {
        if (!this.shouldUsePointerLock()) {
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
            return;
        }

        if (!document.body.requestPointerLock || document.pointerLockElement === document.body || !forceRequest) {
            return;
        }

        const requestResult = document.body.requestPointerLock() as Promise<void> | void;
        if (requestResult instanceof Promise) {
            requestResult.catch((error) => {
                if (error?.name !== "NotAllowedError") {
                    console.warn("请求 Pointer Lock 失败:", error);
                }
            });
        }
    }

    private setCameraPos() {
        requestAnimationFrame(() => {
            if (this.isFirstPerson) {
                this.setFirstPersonCamera(this.camera.rotation.x);
            } else {
                const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
                const angle = Math.atan2(direction.z, direction.x);
                const scale = this.playerModel.scale;

                this.camera.position.copy(this.player.position).add(
                    new THREE.Vector3(
                        Math.cos(angle) * 400 * scale,
                        200 * scale,
                        Math.sin(angle) * 400 * scale,
                    ),
                );
                this.controls.enableZoom = this.enableZoom;
            }

            this.camera.updateProjectionMatrix();
        });
    }

    private setControls() {
        this.controls.enableZoom = !this.isFirstPerson && this.enableZoom;
        this.controls.rotateSpeed = this.mouseSensitivity * 0.05;
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    private resetControls() {
        if (!this.controls) return;
        this.controls.enabled = true;
        this.controls.enablePan = true;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.rotateSpeed = 1;
        this.controls.enableZoom = true;
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
        this.camera.clearViewOffset?.();
    }

    private setToward(deltaX: number, deltaY: number, speed: number) {
        if (this.isFirstPerson) {
            this.player.rotateY(-deltaX * speed * this.mouseSensitivity);
            this.camera.rotation.x = THREE.MathUtils.clamp(
                this.camera.rotation.x + -deltaY * speed * this.mouseSensitivity,
                -1.1,
                1.4,
            );
            return;
        }

        this.orbitCamera(
            this.player.position,
            -deltaX * speed * this.mouseSensitivity,
            -deltaY * speed * this.mouseSensitivity,
        );
    }

    private orbitCamera(target: THREE.Vector3, deltaX: number, deltaY: number) {
        const distance = this.camera.position.distanceTo(target);
        const current = this.camera.position.clone().sub(target);
        let theta = Math.atan2(current.x, current.z) + deltaX;
        let phi = Math.acos(THREE.MathUtils.clamp(current.y / distance, -1, 1)) + deltaY;

        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

        this.camera.position.set(
            target.x + distance * Math.sin(phi) * Math.sin(theta),
            target.y + distance * Math.cos(phi),
            target.z + distance * Math.sin(phi) * Math.cos(theta),
        );
        this.camera.lookAt(target);
    }

    async update(delta: number = clock.getDelta()) {
        if (!this.isupdate || !this.player || (!this.collider && this.extraRaycastColliders.length === 0)) return;

        delta = Math.min(delta, 1 / 40);
        this.updatePlayer(delta);
    }

    private updatePlayer(delta: number) {
        if (!this.isFlying) {
            this.player.position.addScaledVector(this.playerVelocity, delta);
        }

        this.personMixer?.update(delta);
        this.vehicleMixer?.update(delta);

        this.camera.getWorldDirection(this.camDir);
        const angle = 2 * Math.PI - (Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2);

        this.moveDir.set(0, 0, 0);
        if (this.fwdPressed) this.moveDir.add(this.DIR_FWD);
        if (this.bkdPressed) this.moveDir.add(this.DIR_BKD);
        if (this.lftPressed) this.moveDir.add(this.DIR_LFT);
        if (this.rgtPressed) this.moveDir.add(this.DIR_RGT);

        if (this.isFlying) {
            this.moveDir.y = this.fwdPressed ? this.camDir.y : 0;
            if (this.spacePressed) this.moveDir.add(this.DIR_UP);
            this.curPlayerSpeed = this.shiftPressed ? this.playerFlySpeed * 2 : this.playerFlySpeed;
        } else {
            this.curPlayerSpeed = this.shiftPressed ? this.playerSpeed * 2 : this.playerSpeed;
        }

        this.moveDir.normalize().applyAxisAngle(this.upVector, angle);
        this.player.position.addScaledVector(this.moveDir, this.curPlayerSpeed * delta);

        this.rayOrigin.copy(this.player.position);
        this.raycaster.ray.origin.copy(this.rayOrigin);
        const hits = this.intersectWorldColliders(this.raycaster);

        if (hits.length > 0 && !this.isFlying) {
            const distanceFromGround = this.player.position.y - hits[0].point.y;
            const scale = this.playerModel.scale;
            const maxHeight = this.playerCapsuleHeight * scale * 0.9;
            const normalHeight = this.playerCapsuleHeight * scale * 0.75;
            const minHeight = this.playerCapsuleHeight * scale * 0.7;

            if (distanceFromGround >= maxHeight) {
                this.playerVelocity.y += delta * this.gravity;
                this.player.position.addScaledVector(this.playerVelocity, delta);
                this.playerIsOnGround = false;
            } else if (distanceFromGround >= normalHeight && distanceFromGround < maxHeight) {
                if (!this.spacePressed) {
                    this.playerVelocity.set(0, 0, 0);
                    this.playerIsOnGround = true;
                    this.player.position.y = THREE.MathUtils.lerp(
                        this.player.position.y,
                        hits[0].point.y + normalHeight,
                        Math.min(1, 15 * delta),
                    );
                }
            } else if (distanceFromGround >= minHeight) {
                this.playerVelocity.set(0, 0, 0);
                this.playerIsOnGround = true;
                this.player.position.y = hits[0].point.y + normalHeight;
            } else {
                this.playerVelocity.set(0, 0, 0);
                this.playerIsOnGround = true;
                this.player.position.y = THREE.MathUtils.lerp(
                    this.player.position.y,
                    hits[0].point.y + normalHeight,
                    Math.min(1, 15 * delta),
                );
            }
        } else if (!this.isFlying) {
            this.playerVelocity.y += delta * this.gravity;
            this.player.position.addScaledVector(this.playerVelocity, delta);
            this.playerIsOnGround = false;
        }

        this.player.updateMatrixWorld();

        if (this.collider) {
            const capsuleInfo = this.player.capsuleInfo;
            this.tempBox.makeEmpty();
            this.tempMat.copy(this.collider.matrixWorld).invert();
            this.tempSegment.copy(capsuleInfo.segment);
            this.tempSegment.start.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
            this.tempSegment.end.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
            this.tempBox.expandByPoint(this.tempSegment.start);
            this.tempBox.expandByPoint(this.tempSegment.end);
            this.tempBox.expandByScalar(capsuleInfo.radius);

            (this.collider.geometry as any)?.boundsTree?.shapecast({
                intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
                intersectsTriangle: (triangle: any) => {
                    const distance = triangle.closestPointToSegment(this.tempSegment, this.tempVector, this.tempVector2);
                    if (distance >= capsuleInfo.radius) return;

                    const normal = triangle.getNormal(new THREE.Vector3());
                    if (!this.isFlying && Math.abs(normal.y) > 0.5) return;

                    if (!this.isFlying && Math.abs(normal.y) <= 0.5) {
                        const contactWorldY = this.tempVector.clone().applyMatrix4(this.collider!.matrixWorld).y;
                        const feetY = this.player.position.y - this.playerCapsuleHeight * this.playerModel.scale * 0.75;
                        if (contactWorldY < feetY + this.playerCapsuleHeight * this.playerModel.scale * 0.25) return;
                    }

                    const direction = this.tempVector2.sub(this.tempVector).normalize();
                    const depth = capsuleInfo.radius - distance;
                    this.tempSegment.start.addScaledVector(direction, depth);
                    this.tempSegment.end.addScaledVector(direction, depth);
                },
            });

            const newPosition = this.tempVector.copy(this.tempSegment.start).applyMatrix4(this.collider.matrixWorld);
            const deltaVector = this.tempVector2.subVectors(newPosition, this.player.position);
            const offset = Math.max(0, deltaVector.length() - 1e-5);
            this.player.position.add(deltaVector.normalize().multiplyScalar(offset));
        }

        if (!this.isFirstPerson) {
            const camDirFlat = this.camDir.clone().setY(0).normalize().negate();
            const moveDirFlat = this.moveDir.clone().normalize().negate();

            if (!this.isFlying) {
                if (this.thirdMouseMode === 0 || this.thirdMouseMode === 2) {
                    const lookTarget = this.player.position.clone().add(
                        moveDirFlat.lengthSq() > 0 ? moveDirFlat : camDirFlat,
                    );
                    this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                    this.player.quaternion.slerp(
                        this.targetQuat.setFromRotationMatrix(this.targetMat),
                        Math.min(1, this.rotationSpeed * delta),
                    );
                } else if (moveDirFlat.lengthSq() > 0) {
                    const lookTarget = this.player.position.clone().add(moveDirFlat);
                    this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                    this.player.quaternion.slerp(
                        this.targetQuat.setFromRotationMatrix(this.targetMat),
                        Math.min(1, this.rotationSpeed * delta),
                    );
                }
            } else {
                const lookTarget = this.player.position.clone().add(this.fwdPressed ? moveDirFlat : camDirFlat);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.player.quaternion.slerp(
                    this.targetQuat.setFromRotationMatrix(this.targetMat),
                    Math.min(1, this.rotationSpeed * delta),
                );
            }
        }

        if (!this.isFirstPerson) {
            const lookTarget = this.player.position.clone();
            lookTarget.y += (this.playerCapsuleHeight / 8) * this.playerModel.scale;

            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            if (!this.enableZoom) {
                this.updateCameraWithRaycast(
                    this.player.position,
                    this.personToCam.subVectors(this.camera.position, this.player.position).length(),
                    this.maxCamDistance,
                );
            }
        }

        if (this.player.position.y < this.boundingBoxMinY - 1) {
            this.raycaster.ray.origin.set(this.player.position.x, 10000, this.player.position.z);
            const fallHits = this.intersectWorldColliders(this.raycaster);
            this.reset(
                new THREE.Vector3(
                    this.player.position.x,
                    fallHits.length > 0 ? fallHits[0].point.y + 5 : this.player.position.y + 15,
                    this.player.position.z,
                ),
            );
        }
    }

    private updateCameraWithRaycast(origin: THREE.Vector3, desiredDistance: number, maxDistance: number) {
        this.personToCam.subVectors(this.camera.position, origin);
        const direction = this.personToCam.clone().normalize();
        this.raycasterPersonToCam.set(origin, direction);
        this.raycasterPersonToCam.far = desiredDistance;

        const hits = this.intersectWorldColliders(this.raycasterPersonToCam);
        if (hits.length > 0) {
            const safeDistance = Math.max(hits[0].distance - this.camEpsilon, this.minCamDistance);
            const targetCameraPos = origin.clone().add(direction.multiplyScalar(safeDistance));
            this.camera.position.lerp(targetCameraPos, this.camCollisionLerp);
            return;
        }

        this.raycasterPersonToCam.far = maxDistance;
        const maxHits = this.intersectWorldColliders(this.raycasterPersonToCam);
        const safeDistance = maxHits.length > 0
            ? Math.min(maxDistance, maxHits[0].distance - this.camEpsilon)
            : maxDistance;
        const targetCameraPos = origin.clone().add(direction.multiplyScalar(safeDistance));
        this.camera.position.lerp(targetCameraPos, this.camCollisionLerp);
    }

    reset(position?: THREE.Vector3) {
        if (!this.player) return;
        this.playerVelocity.set(0, 0, 0);
        this.player.position.copy(position ?? this.initPos);
    }

    getPosition() {
        return this.player?.position;
    }

    getPerson() {
        return this.person;
    }

    getCurrentPersonAnimationName() {
        return this.actionState?.getClip()?.name ?? null;
    }

    private setMoveXInput(value: PlayerControllerInput["moveX"]) {
        this.lftPressed = value === -1;
        this.rgtPressed = value === 1;
        this.setAnimationByPressed();
    }

    private setMoveYInput(value: PlayerControllerInput["moveY"]) {
        this.fwdPressed = value === 1;
        this.bkdPressed = value === -1;
        this.setAnimationByPressed();
    }

    private setJumpInput(pressed: boolean) {
        this.spacePressed = pressed;
        if (!pressed || !this.playerIsOnGround || this.isFlying) return;
        if (this.personActions?.get("jumping") === this.actionState) return;

        this.playPersonAnimationByName("jumping");
        this.playerVelocity.y = this.jumpHeight;
        this.playerIsOnGround = false;
    }

    private toggleFlyMode() {
        if (!this.playerFlyEnabled) return;

        this.isFlying = !this.isFlying;
        this.setAnimationByPressed();
        if (!this.isFlying && !this.playerIsOnGround) {
            this.playPersonAnimationByName("jumping");
        }
    }

    setInput(input: Partial<PlayerControllerInput>) {
        if (typeof input.moveX === "number") {
            this.setMoveXInput(input.moveX);
        }

        if (typeof input.moveY === "number") {
            this.setMoveYInput(input.moveY);
        }

        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            this.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        if (typeof input.jump === "boolean") {
            this.setJumpInput(input.jump);
        }

        if (typeof input.shift === "boolean") {
            this.shiftPressed = input.shift;
            this.setAnimationByPressed();
        }

        if (input.toggleView) {
            this.changeView();
        }

        if (input.toggleFly) {
            this.toggleFlyMode();
        }
    }

    private setAnimationByPressed = () => {
        this.maxCamDistance = this.originMaxCamDistance;

        if (this.isFlying) {
            if (!this.fwdPressed) {
                this.playPersonAnimationByName("flyidle");
                return;
            }
            this.playPersonAnimationByName("flying");
            this.maxCamDistance = this.originMaxCamDistance * 2;
            return;
        }

        if (this.playerIsOnGround) {
            if (!this.fwdPressed && !this.bkdPressed && !this.lftPressed && !this.rgtPressed) {
                this.playPersonAnimationByName("idle");
                return;
            }

            if (this.fwdPressed) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                return;
            }

            if (!this.isFirstPerson && (this.lftPressed || this.rgtPressed || this.bkdPressed)) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                return;
            }

            if (this.lftPressed) {
                this.playPersonAnimationByName("left_walking");
                return;
            }
            if (this.rgtPressed) {
                this.playPersonAnimationByName("right_walking");
                return;
            }
            if (this.bkdPressed) {
                this.playPersonAnimationByName("walking_backward");
                return;
            }
        }

        if (this.recheckAnimTimer) {
            clearTimeout(this.recheckAnimTimer);
        }
        this.recheckAnimTimer = setTimeout(() => {
            this.setAnimationByPressed();
            this.recheckAnimTimer = null;
        }, 200);
    };

    private readonly boundOnKeydown = (event: KeyboardEvent) => {
        if (event.ctrlKey && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
            event.preventDefault();
        }

        this.setPointerLock(true);

        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                this.fwdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyS":
            case "ArrowDown":
                this.bkdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyD":
            case "ArrowRight":
                this.rgtPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyA":
            case "ArrowLeft":
                this.lftPressed = true;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
            case "ShiftRight":
                this.shiftPressed = true;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
                break;
            case "Space":
                this.setJumpInput(true);
                break;
            case "ControlLeft":
                this.ctPressed = true;
                break;
            case "KeyV":
                this.changeView();
                break;
            case "KeyF":
                this.toggleFlyMode();
                break;
            default:
                break;
        }
    };

    private readonly boundOnKeyup = (event: KeyboardEvent) => {
        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                this.fwdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyS":
            case "ArrowDown":
                this.bkdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyD":
            case "ArrowRight":
                this.rgtPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyA":
            case "ArrowLeft":
                this.lftPressed = false;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
            case "ShiftRight":
                this.shiftPressed = false;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            case "Space":
                this.setJumpInput(false);
                break;
            case "ControlLeft":
                this.ctPressed = false;
                break;
            default:
                break;
        }
    };

    private readonly mouseMove = (event: MouseEvent) => {
        if (document.pointerLockElement !== document.body) return;
        this.setToward(event.movementX, event.movementY, 0.0001);
    };

    private readonly mouseClick = () => {
        this.setPointerLock(true);
    };

    onAllEvent() {
        this.isupdate = true;
        this.setPointerLock();
        window.addEventListener("keydown", this.boundOnKeydown);
        window.addEventListener("keyup", this.boundOnKeyup);
        window.addEventListener("mousemove", this.mouseMove);
        window.addEventListener("click", this.mouseClick);
    }

    offAllEvent() {
        this.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this.boundOnKeydown);
        window.removeEventListener("keyup", this.boundOnKeyup);
        window.removeEventListener("mousemove", this.mouseMove);
        window.removeEventListener("click", this.mouseClick);
    }

    setPlayerScale(nextScale: number) {
        if (!this.player || nextScale <= 0 || nextScale === this.playerModel.scale) return;

        const previousScale = this.playerModel.scale;
        const ratio = nextScale / previousScale;

        this.playerModel.scale = nextScale;
        this.syncScaledConfig();

        if (this.isFirstPerson) {
            this.scene.attach(this.camera);
        }

        this.player.scale.multiplyScalar(ratio);
        if (this.player.capsuleInfo) {
            this.player.capsuleInfo.radius *= ratio;
        }

        if (this.isFirstPerson) {
            this.setFirstPersonCamera(this.camera.rotation.x);
        } else {
            this.setCameraPos();
        }
    }

    setMouseSensitivity(value: number) {
        this.mouseSensitivity = value;
        this.controls.rotateSpeed = value * 0.05;
    }

    setGravity(value: number) {
        this.configuredGravity = value;
        this.syncScaledConfig();
    }

    setJumpHeight(value: number) {
        this.configuredJumpHeight = value;
        this.syncScaledConfig();
    }

    setPlayerSpeed(value: number) {
        this.configuredPlayerSpeed = value;
        this.syncScaledConfig();
    }

    setPlayerFlySpeed(value: number) {
        this.configuredPlayerFlySpeed = value;
        this.syncScaledConfig();
    }

    setPlayerFlyEnabled(enabled: boolean) {
        this.playerFlyEnabled = enabled;
        if (!enabled && this.isFlying) {
            this.isFlying = false;
            this.setAnimationByPressed();
        }
        this.mobileControls?.setFlyEnabled(enabled);
    }

    setMinCamDistance(value: number) {
        this.configuredMinCamDistance = value;
        this.syncScaledConfig();
    }

    setMaxCamDistance(value: number) {
        this.configuredMaxCamDistance = value;
        this.syncScaledConfig();
    }

    setThirdMouseMode(mode: 0 | 1 | 2 | 3) {
        this.thirdMouseMode = mode;
        this.setPointerLock();
    }

    setEnableZoom(enabled: boolean) {
        this.enableZoom = enabled;
        this.controls.enableZoom = !this.isFirstPerson && enabled;
    }

    setDebug(enabled: boolean) {
        this.displayCollider = enabled;
        this.displayPlayer = enabled;

        if (this.collider) {
            if (enabled) {
                this.scene.add(this.collider);
            } else {
                this.scene.remove(this.collider);
            }
        }

        if (this.player) {
            const material = this.player.material as THREE.MeshStandardMaterial;
            material.opacity = enabled ? 0.5 : 0;
        }
    }

    destroy() {
        this.offAllEvent();

        if (this.recheckAnimTimer) {
            clearTimeout(this.recheckAnimTimer);
            this.recheckAnimTimer = null;
        }

        this.mobileControls?.destroy();
        this.mobileControls = null;

        this.clearVehicleModel();

        this.clearPlayerModel();
        this.resetControls();

        if (this.visualizer) {
            this.scene.remove(this.visualizer);
            this.visualizer = null;
        }

        if (this.collider) {
            this.scene.remove(this.collider);
            this.collider.geometry?.dispose?.();
            disposeMaterial(this.collider.material);
            this.collider = null;
        }

        this.collected = [];
        this.extraRaycastColliders = [];
        this.playerVelocity.set(0, 0, 0);

        if (activeController === this) {
            activeController = null;
        }
    }
}

export function playerController() {
    const controller = new PlayerController();
    activeController = controller;

    return {
        init: (options: PlayerControllerOptions, callback?: () => void) => controller.init(options, callback),
        update: (delta?: number) => controller.update(delta),
        destroy: () => controller.destroy(),
        reset: (position?: THREE.Vector3) => controller.reset(position),
        setInput: (input: Parameters<PlayerController["setInput"]>[0]) => controller.setInput(input),
        changeView: () => controller.changeView(),
        getPosition: () => controller.getPosition(),
        getposition: () => controller.getPosition(),
        getPerson: () => controller.getPerson(),
        getCurrentPersonAnimationName: () => controller.getCurrentPersonAnimationName(),
        loadVehicleModel: (params: Parameters<PlayerController["loadVehicleModel"]>[0]) => controller.loadVehicleModel(params),
        switchPlayerModel: (model: PlayerModelOptions) => controller.switchPlayerModel(model),
        setPlayerScale: (value: number) => controller.setPlayerScale(value),
        setMouseSensitivity: (value: number) => controller.setMouseSensitivity(value),
        setGravity: (value: number) => controller.setGravity(value),
        setJumpHeight: (value: number) => controller.setJumpHeight(value),
        setPlayerSpeed: (value: number) => controller.setPlayerSpeed(value),
        setPlayerFlySpeed: (value: number) => controller.setPlayerFlySpeed(value),
        setPlayerFlyEnabled: (enabled: boolean) => controller.setPlayerFlyEnabled(enabled),
        setMinCamDistance: (value: number) => controller.setMinCamDistance(value),
        setMaxCamDistance: (value: number) => controller.setMaxCamDistance(value),
        setThirdMouseMode: (mode: 0 | 1 | 2 | 3) => controller.setThirdMouseMode(mode),
        setEnableZoom: (enabled: boolean) => controller.setEnableZoom(enabled),
        setDebug: (enabled: boolean) => controller.setDebug(enabled),
        setOverShoulderView: (enabled: boolean) => controller.setOverShoulderView(enabled),
    };
}

export type PlayerControllerApi = ReturnType<typeof playerController>;

export function onAllEvent(): void {
    activeController?.onAllEvent();
}

export function offAllEvent(): void {
    activeController?.offAllEvent();
}

export type {
    MobileControlsOptions,
    PlayerControllerInput,
    PlayerControllerOptions,
    PlayerModelOptions,
    VehicleAnimationOptions,
    VehicleModelOptions,
} from "./types";
