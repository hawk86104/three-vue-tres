import * as THREE from "three";
import { acceleratedRaycast, MeshBVH, MeshBVHHelper } from "three-mesh-bvh";
import type { GLTF } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

THREE.Mesh.prototype.raycast = acceleratedRaycast; // 启用加速 raycast

let controllerInstance: PlayerController | null = null;
const clock = new THREE.Clock();

export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    playerModel: {
        url: string;
        idleAnim: string;
        walkAnim: string;
        runAnim: string;
        jumpAnim: string;
        leftWalkAnim?: string;
        rightWalkAnim?: string;
        backwardAnim?: string;
        flyAnim?: string;
        flyIdleAnim?: string;
        scale: number;
        gravity?: number;
        jumpHeight?: number;
        speed?: number;
        rotateY?: number;
    };
    initPos?: THREE.Vector3;
    mouseSensity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
};

class PlayerController {
    // ==================== 基本配置与参数 ====================
    loader: GLTFLoader = new GLTFLoader();
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    controls!: OrbitControls;
    playerModel!: PlayerControllerOptions["playerModel"];
    initPos!: THREE.Vector3;
    visualizeDepth!: number;
    gravity!: number;
    jumpHeight!: number;
    playerSpeed!: number;
    mouseSensity!: number;
    originPlayerSpeed!: number;
    colliderMeshUrl!: string;
    isShowMobileControls!: boolean;
    thirdMouseMode!: 0 | 1 | 2 | 3; // 0: 隐藏鼠标控制朝向及视角，1: 隐藏鼠标仅控制视角，2: 显示鼠标拖拽控制朝向及视角, 3: 显示鼠标拖拽仅控制视角
    controllerMode!: 0 | 1 | 2; // 0: 普通 1: 飞行 2: 车辆
    enableZoom!: boolean;

    // ==================== 玩家基本属性 ====================
    playerRadius: number = 45;
    playerHeight: number = 180;
    isFirstPerson: boolean = false;
    boundingBoxMinY: number = 0;

    // ==================== 测试参数 ====================
    displayPlayer: boolean = false;
    displayCollider: boolean = false;
    displayVisualizer: boolean = false;

    // ==================== 场景对象 ====================
    collider: THREE.Mesh | null = null;
    visualizer: MeshBVHHelper | null = null;
    player!: THREE.Mesh & { capsuleInfo?: any };
    person: THREE.Object3D | null = null;
    vehicle: THREE.Object3D | null = null;

    // ==================== 状态开关 ====================
    playerIsOnGround: boolean = false;
    isupdate: boolean = true;
    isFlying: boolean = false;

    // ==================== 输入状态 ====================
    fwdPressed: boolean = false;
    bkdPressed: boolean = false;
    lftPressed: boolean = false;
    rgtPressed: boolean = false;
    spacePressed: boolean = false;
    ctPressed: boolean = false;
    shiftPressed: boolean = false;

    // ==================== 移动端输入 ====================
    prevJoyState = { dirX: 0, dirY: 0, shift: false };
    nippleModule: any = null;
    joystickManager: any = null;
    joystickZoneEl: HTMLDivElement | null = null;
    lookAreaEl: HTMLDivElement | null = null;
    jumpBtnEl: HTMLButtonElement | null = null;
    flyBtnEl: HTMLButtonElement | null = null;
    viewBtnEl: HTMLButtonElement | null = null;
    lookPointerId: number | null = null;
    isLookDown = false;
    lastTouchX = 0;
    lastTouchY = 0;

    // ==================== 第三人称相机参数 ====================
    _camCollisionLerp: number = 0.18; // 平滑系数
    _camEpsilon: number = 0.35; // 摄像机与障碍物之间的安全距离
    _minCamDistance: number = 1.0; // 摄像机最小距离
    _maxCamDistance: number = 4.4; // 摄像机最大距离
    orginMaxCamDistance: number = 4.4;

    // ==================== 物理/运动 ====================
    playerVelocity = new THREE.Vector3(); // 玩家速度向量
    readonly upVector = new THREE.Vector3(0, 1, 0);

    // ==================== 临时复用向量/矩阵 ====================
    readonly tempVector = new THREE.Vector3();
    readonly tempVector2 = new THREE.Vector3();
    readonly tempBox = new THREE.Box3();
    readonly tempMat = new THREE.Matrix4();
    readonly tempSegment = new THREE.Line3();

    // ==================== 动画相关 ====================
    personMixer?: THREE.AnimationMixer;
    personActions?: Map<string, THREE.AnimationAction>;
    idleAction!: THREE.AnimationAction;
    walkAction!: THREE.AnimationAction;
    leftWalkAction!: THREE.AnimationAction;
    rightWalkAction!: THREE.AnimationAction;
    backwardAction!: THREE.AnimationAction;
    jumpAction!: THREE.AnimationAction;
    runAction!: THREE.AnimationAction;
    flyidleAction!: THREE.AnimationAction;
    flyAction!: THREE.AnimationAction;
    actionState!: THREE.AnimationAction;
    recheckAnimTimer: any | null = null;

    vehicleMixer?: THREE.AnimationMixer;
    vehicleActions?: Map<string, THREE.AnimationAction>;

    // ==================== 相机朝向/移动复用向量 ====================
    readonly camDir = new THREE.Vector3();
    readonly moveDir = new THREE.Vector3();
    readonly targetQuat = new THREE.Quaternion();
    readonly targetMat = new THREE.Matrix4();
    readonly rotationSpeed = 10;
    readonly DIR_FWD = new THREE.Vector3(0, 0, -1);
    readonly DIR_BKD = new THREE.Vector3(0, 0, 1);
    readonly DIR_LFT = new THREE.Vector3(-1, 0, 0);
    readonly DIR_RGT = new THREE.Vector3(1, 0, 0);
    readonly DIR_UP = new THREE.Vector3(0, 1, 0);

    // ==================== 射线检测 ====================
    readonly _personToCam = new THREE.Vector3();
    readonly _originTmp = new THREE.Vector3();
    readonly _raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    readonly _raycasterPersonToCam = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());

    constructor() {
        // 射线检测时只返回第一个碰撞
        (this._raycaster as any).firstHitOnly = true;
        (this._raycasterPersonToCam as any).firstHitOnly = true;
    }

    // ==================== 初始化相关方法 ====================

    /**
     * 初始化控制器
     */
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        this.scene = opts.scene;
        this.camera = opts.camera;
        this.camera.rotation.order = "YXZ";
        this.controls = opts.controls;
        this.playerModel = opts.playerModel;
        this.initPos = opts.initPos ?? new THREE.Vector3(0, 0, 0);
        this.mouseSensity = opts.mouseSensity ?? 5;

        const s = this.playerModel.scale;
        this.visualizeDepth = 0 * s;
        this.gravity = (opts.playerModel.gravity ?? -2400) * s;
        this.jumpHeight = (opts.playerModel.jumpHeight ?? 800) * s;
        this.originPlayerSpeed = (opts.playerModel.speed ?? 400) * s;
        this.playerSpeed = this.originPlayerSpeed;
        this.playerModel.rotateY = opts.playerModel.rotateY ?? 0;

        this._camCollisionLerp = 0.18;
        this._camEpsilon = 35 * s;
        this._minCamDistance = (opts.minCamDistance ?? 100) * s;
        this._maxCamDistance = (opts.maxCamDistance ?? 440) * s;
        this.orginMaxCamDistance = this._maxCamDistance;
        this.thirdMouseMode = opts.thirdMouseMode ?? 1;
        this.enableZoom = opts.enableZoom ?? false;

        // 判断是否移动端
        const isMobileDevice = () => (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || "ontouchstart" in window || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        this.isShowMobileControls = (opts.isShowMobileControls ?? true) && isMobileDevice();
        if (this.isShowMobileControls) {
            await this.initMobileControls();
        }

        // 创建BVH碰撞体
        await this.createBVH(opts.colliderMeshUrl);

        // 创建玩家胶囊体
        this.createPlayer();

        // 加载玩家模型
        await this.loadPersonGLB();

        // 等待资源加载完毕再设置摄像机
        if (this.isFirstPerson && this.person) {
            this.person.add(this.camera);
        }

        this.onAllEvent();
        this.setCameraPos();
        this.setControls();
        if (callback) callback();
    }

    /**
     * 初始化加载器
     */
    async initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath("https://unpkg.com/three@0.180.0/examples/jsm/libs/draco/gltf/");
        dracoLoader.setDecoderConfig({ type: "js" });
        this.loader.setDRACOLoader(dracoLoader);
    }

    // ==================== 玩家模型相关方法 ====================

    /**
     * 加载玩家模型与动画
     */
    async loadPersonGLB() {
        try {
            const gltf: GLTF = await this.loader.loadAsync(this.playerModel.url);
            this.person = gltf.scene;
            const sc = this.playerModel.scale;
            const h = this.playerHeight * sc;

            this.person.scale.set(sc, sc, sc);
            this.person.position.set(0, -h * 0.75, 0);
            this.person.traverse((child: any) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.player.add(this.person);
            this.reset();

            // 创建动画混合器
            this.personMixer = new THREE.AnimationMixer(this.person);
            const animations = gltf.animations ?? [];
            this.personActions = new Map<string, THREE.AnimationAction>();

            // 动画映射表
            const animationMappings: [string, string][] = [
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

            // 注册动画动作
            const findClip = (name: string) => animations.find((a: any) => a.name === name);
            for (const [clipName, actionName] of animationMappings) {
                const clip = findClip(clipName);
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

            // 获取动画动作引用
            this.idleAction = this.personActions.get("idle")!;
            this.walkAction = this.personActions.get("walking")!;
            this.leftWalkAction = this.personActions.get("left_walking")!;
            this.rightWalkAction = this.personActions.get("right_walking")!;
            this.backwardAction = this.personActions.get("walking_backward")!;
            this.jumpAction = this.personActions.get("jumping")!;
            this.runAction = this.personActions.get("running")!;
            this.flyidleAction = this.personActions.get("flyidle")!;
            this.flyAction = this.personActions.get("flying")!;

            // 激活空闲动作
            this.idleAction.setEffectiveWeight(1);
            this.idleAction.play();
            this.actionState = this.idleAction;

            // 监听动画完成事件
            this.personMixer.addEventListener("finished", (ev: any) => {
                const finishedAction: THREE.AnimationAction = ev.action;

                if (finishedAction === this.jumpAction) {
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
                }
            });
        } catch (error) {
            console.error("加载玩家模型失败:", error);
        }
    }

    /**
     * 平滑切换人物动画
     */
    playPersonAnimationByName(name: string, fade = 0.18) {
        if (!this.personActions || this.ctPressed) return;

        const next = this.personActions.get(name);
        if (!next || this.actionState === next) return;

        const prev = this.actionState;

        next.reset();
        next.setEffectiveWeight(1);
        next.play();

        if (prev && prev !== next) {
            prev.fadeOut(fade);
            next.fadeIn(fade);
        } else {
            next.fadeIn(fade);
        }

        this.actionState = next;
    }

    /**
     * 创建玩家胶囊体
     */
    createPlayer() {
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(1, 0, 0),
            shadowSide: THREE.DoubleSide,
            depthTest: false,
            transparent: true,
            opacity: this.displayPlayer ? 0.5 : 0,
            wireframe: true,
            depthWrite: false,
        });

        const r = this.playerRadius * this.playerModel.scale;
        const h = this.playerHeight * this.playerModel.scale;
        this.player = new THREE.Mesh(new RoundedBoxGeometry(r * 2, h, r * 2, 1, 75), material) as typeof this.player;

        this.player.geometry.translate(0, -h * 0.25, 0);
        this.player.capsuleInfo = {
            radius: r,
            segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, -h * 0.5, 0)),
        };

        this.player.name = "capsule";
        this.scene.add(this.player);
        this.reset();

        // 设置初始朝向
        this.player.rotateY(this.playerModel.rotateY ?? 0);
    }

    // ==================== 车辆模型相关 ====================

    /**
     * 加载车辆模型与动画
     */
    async loadVehicleModel(params: {
        url: string;
        position: THREE.Vector3;
        scale?: number;
        animations?: {
            openDoorAnim?: string;
            wheelsTurnAnim?: string;
            turnLeftAnim?: string;
            turnRightAnim?: string;
        };
    }) {
        try {
            const { url, position, scale = 1 } = params;
            const gltf: GLTF = await this.loader.loadAsync(url);
            this.vehicle = gltf.scene;
            this.vehicle.scale.set(scale, scale, scale);
            this.vehicle.position.copy(position);
            this.vehicle.traverse((child: any) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.scene.add(this.vehicle);

            const animations = gltf.animations ?? [];
            // console.log("车辆所有动画", animations);
            this.vehicleActions = new Map<string, THREE.AnimationAction>();
            this.vehicleMixer = new THREE.AnimationMixer(this.vehicle);

            // 动画映射表
            const animationMappings: [string, string][] = [
                [params.animations?.openDoorAnim ?? "", "open_door"],
                [params.animations?.wheelsTurnAnim ?? "", "wheels_turn"],
                [params.animations?.turnLeftAnim ?? "", "turn_left"],
                [params.animations?.turnRightAnim ?? "", "turn_right"],
            ];

            // 注册动画动作
            const findClip = (name: string) => animations.find((a: any) => a.name === name);
            for (const [clipName, actionName] of animationMappings) {
                const clip = findClip(clipName);
                if (!clip) continue;
                const action = this.vehicleMixer.clipAction(clip);
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.setEffectiveTimeScale(2);
                action.enabled = true;
                action.setEffectiveWeight(0);
                this.vehicleActions.set(actionName, action);
            }

            console.log("开门动画", this.vehicleActions.get("open_door"));

            // const next = this.vehicleActions.get("open_door") as THREE.AnimationAction;
            // next.setEffectiveWeight(1);
            // next.play();
        } catch (error) {
            console.error("加载车辆模型失败:", error);
        }
    }

    // ==================== 相机与视角控制 ====================

    /**
     * 第一/三人称视角切换
     */
    changeView() {
        this.isFirstPerson = !this.isFirstPerson;

        if (this.isFirstPerson) {
            this.player.attach(this.camera);
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
            this.camera.rotation.set(0, Math.PI, 0);
            this.controls.enableZoom = false;
        } else {
            this.scene.attach(this.camera);
            const worldPos = this.player.position.clone();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, 200 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
            this.camera.position.copy(worldPos).add(offset);
            this.controls.target.copy(worldPos);
            this.controls.enableZoom = this.enableZoom;
        }

        this.setPointerLock();
    }

    setDrive() {
        this.controllerMode = 2;
        this.person?.attach(this.vehicle as THREE.Object3D);
    }

    /**
     * 设置指针锁定
     */
    setPointerLock() {
        if (((this.thirdMouseMode === 0 || this.thirdMouseMode === 1) && !this.isFirstPerson) || this.isFirstPerson) {
            document.body.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }

    /**
     * 设置摄像机初始位置
     */
    setCameraPos() {
        if (this.isFirstPerson) {
            this.camera.position.set(0, 40 * this.playerModel.scale, 30 * this.playerModel.scale);
        } else {
            const worldPos = this.player.position.clone();
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
            const angle = Math.atan2(dir.z, dir.x);
            const offset = new THREE.Vector3(Math.cos(angle) * 400 * this.playerModel.scale, -100 * this.playerModel.scale, Math.sin(angle) * 400 * this.playerModel.scale);
            this.camera.position.copy(worldPos).add(offset);
        }
        this.camera.updateProjectionMatrix();
    }

    /**
     * 设置控制器
     */
    setControls() {
        // this.controls.enabled = !(this.thirdMouseMode === 0 || this.thirdMouseMode === 1);
        this.controls.enableZoom = this.enableZoom;
        this.controls.rotateSpeed = this.mouseSensity * 0.05;
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    /**
     * 重置控制器
     */
    resetControls() {
        if (!this.controls) return;
        this.controls.enabled = true;
        this.controls.enablePan = true;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.rotateSpeed = 1;
        this.controls.enableZoom = true;
        this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
    }

    /**
     * 设置朝向
     */
    setToward(dx: number, dy: number, speed: number) {
        if (this.isFirstPerson) {
            const yaw = -dx * speed * this.mouseSensity;
            const pitch = -dy * speed * this.mouseSensity;
            this.player.rotateY(yaw);
            this.camera.rotation.x = THREE.MathUtils.clamp(this.camera.rotation.x + pitch, -1.1, 1.4);
        } else {
            const sensitivity = this.mouseSensity;
            const deltaX = -dx * speed * sensitivity;
            const deltaY = -dy * speed * sensitivity;

            const target = this.player.position.clone();
            const distance = this.camera.position.distanceTo(target);
            const currentPosition = this.camera.position.clone().sub(target);

            let theta = Math.atan2(currentPosition.x, currentPosition.z);
            let phi = Math.acos(currentPosition.y / distance);

            theta += deltaX;
            phi += deltaY;
            phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

            const newX = distance * Math.sin(phi) * Math.sin(theta);
            const newY = distance * Math.cos(phi);
            const newZ = distance * Math.sin(phi) * Math.cos(theta);

            this.camera.position.set(target.x + newX, target.y + newY, target.z + newZ);
            this.camera.lookAt(target);
        }
    }

    // ==================== 物理与碰撞检测 ====================

    /**
     * 统一属性集合
     */
    unifiedAttribute(collected: THREE.BufferGeometry[]) {
        type AttrMeta = {
            itemSize: number;
            arrayCtor: any;
            examples: number;
            normalized: boolean;
        };
        const attrMap = new Map<string, AttrMeta>();
        const attrConflict = new Set<string>();

        // 保留必需的属性
        const requiredAttrs = new Set(["position", "normal", "uv"]);

        // 删除非必需属性
        for (const g of collected) {
            const attrNames = Object.keys(g.attributes);
            for (const name of attrNames) {
                if (!requiredAttrs.has(name)) {
                    g.deleteAttribute(name);
                }
            }
        }

        for (const g of collected) {
            for (const name of Object.keys(g.attributes)) {
                const attr = g.attributes[name] as THREE.BufferAttribute;
                const ctor = (attr.array as any).constructor;
                const itemSize = attr.itemSize;
                const normalized = attr.normalized;

                if (!attrMap.has(name)) {
                    attrMap.set(name, { itemSize, arrayCtor: ctor, examples: 1, normalized });
                } else {
                    const m = attrMap.get(name)!;
                    if (m.itemSize !== itemSize || m.arrayCtor !== ctor || m.normalized !== normalized) {
                        attrConflict.add(name);
                    } else {
                        m.examples++;
                    }
                }
            }
        }

        // 删除冲突属性
        if (attrConflict.size) {
            for (const g of collected) {
                for (const name of Array.from(attrConflict)) {
                    if (g.attributes[name]) g.deleteAttribute(name);
                }
            }
            for (const name of attrConflict) attrMap.delete(name);
        }

        // 补全缺失属性
        const attrNames = Array.from(attrMap.keys());
        for (const g of collected) {
            const count = g.attributes.position.count;
            for (const name of attrNames) {
                if (!g.attributes[name]) {
                    const meta = attrMap.get(name)!;
                    const len = count * meta.itemSize;
                    const array = new meta.arrayCtor(len);
                    g.setAttribute(name, new THREE.BufferAttribute(array, meta.itemSize, meta.normalized));
                }
            }
        }

        return collected;
    }

    /**
     * BVH碰撞体构建
     */
    async createBVH(meshUrl: string = ""): Promise<void> {
        await this.initLoader();

        const ensureAttributesMinimal = (geom: THREE.BufferGeometry): THREE.BufferGeometry | null => {
            if (!geom.attributes.position) return null;
            if (!geom.attributes.normal) geom.computeVertexNormals();
            if (!geom.attributes.uv) {
                const count = geom.attributes.position.count;
                const dummyUV = new Float32Array(count * 2);
                geom.setAttribute("uv", new THREE.BufferAttribute(dummyUV, 2));
            }
            return geom;
        };

        let collected: THREE.BufferGeometry[] = [];

        if (meshUrl === "") {
            // 从场景中收集几何体
            if (this.collider) {
                this.scene.remove(this.collider);
                this.collider = null;
            }

            this.scene.traverse((c) => {
                const mesh = c as THREE.Mesh;
                if (mesh?.isMesh && mesh.geometry && c.name !== "capsule") {
                    try {
                        let geom = (mesh.geometry as THREE.BufferGeometry).clone();
                        // ⚠️ 关键 hawk 增加 针对Tres对现有物体的位置 大小 和旋转的逻辑
                        mesh.updateWorldMatrix(true, false);
                        geom.applyMatrix4(mesh.matrixWorld);
                        if (geom.index) geom = geom.toNonIndexed();
                        const safe = ensureAttributesMinimal(geom);
                        if (safe) collected.push(safe);
                    } catch (e) {
                        console.warn("处理网格时出错：", mesh, e);
                    }
                }
            });

            if (!collected.length) return;

            collected = this.unifiedAttribute(collected);
        } else {
            // 从URL加载模型
            const gltf: GLTF = await this.loader.loadAsync(meshUrl);
            const mesh = gltf.scene.children[0] as THREE.Mesh;
            mesh.name = "BVH加载模型";

            let geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrixWorld);
            if (geom.index) geom = geom.toNonIndexed();
            const safe = ensureAttributesMinimal(geom);
            if (safe) collected.push(safe);
        }

        // 合并几何体
        const merged = BufferGeometryUtils.mergeGeometries(collected, false);
        if (!merged) {
            console.error("合并几何失败");
            return;
        }

        // 构建BVH
        (merged as any).boundsTree = new MeshBVH(merged, { maxDepth: 100 });
        this.collider = new THREE.Mesh(
            merged,
            new THREE.MeshBasicMaterial({
                opacity: 0.5,
                transparent: true,
                wireframe: true,
            })
        );

        if (this.displayCollider) this.scene.add(this.collider);
        if (this.displayVisualizer) {
            if (this.visualizer) this.scene.remove(this.visualizer);
            this.visualizer = new MeshBVHHelper(this.collider, this.visualizeDepth);
            this.scene.add(this.visualizer);
        }

        this.boundingBoxMinY = (this.collider as any).geometry.boundingBox.min.y;
    }

    /**
     * 获取法线与Y轴的夹角
     */
    getAngleWithYAxis(normal: { x: number; y: number; z: number }): number {
        const yAxis = { x: 0, y: 1, z: 0 };
        const dotProduct = normal.x * yAxis.x + normal.y * yAxis.y + normal.z * yAxis.z;
        const normalMagnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        const cosTheta = dotProduct / normalMagnitude;
        return Math.acos(cosTheta);
    }

    // ==================== 循环更新 ====================

    /**
     * 每帧更新
     */
    async update(delta: number = clock.getDelta()) {
        if (!this.isupdate || !this.player || !this.collider) return;
        delta = Math.min(delta, 1 / 30);

        // 应用速度
        if (!this.isFlying) {
            this.player.position.addScaledVector(this.playerVelocity, delta);
        }

        // 更新动画
        this.updateMixers(delta);

        // 计算移动方向
        this.camera.getWorldDirection(this.camDir);
        let angle = Math.atan2(this.camDir.z, this.camDir.x) + Math.PI / 2;
        angle = 2 * Math.PI - angle;

        this.moveDir.set(0, 0, 0);
        if (this.fwdPressed) this.moveDir.add(this.DIR_FWD);
        if (this.bkdPressed) this.moveDir.add(this.DIR_BKD);
        if (this.lftPressed) this.moveDir.add(this.DIR_LFT);
        if (this.rgtPressed) this.moveDir.add(this.DIR_RGT);

        if (this.isFlying) {
            if (this.fwdPressed) this.moveDir.y = this.camDir.y;
            else this.moveDir.y = 0;
            if (this.spacePressed) this.moveDir.add(this.DIR_UP);
        }

        // 设置速度
        if (this.isFlying && this.fwdPressed) {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 12 : this.originPlayerSpeed * 7;
        } else {
            this.playerSpeed = this.shiftPressed ? this.originPlayerSpeed * 2 : this.originPlayerSpeed;
        }

        this.moveDir.normalize().applyAxisAngle(this.upVector, angle);
        this.player.position.addScaledVector(this.moveDir, this.playerSpeed * delta);

        // 向下射线检测地面高度
        let playerDistanceFromGround = Infinity;
        this._originTmp.set(this.player.position.x, this.player.position.y, this.player.position.z);
        this._raycaster.ray.origin.copy(this._originTmp);
        const intersects = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);

        if (intersects.length > 0) {
            playerDistanceFromGround = this.player.position.y - intersects[0].point.y;
            const normal = intersects[0].normal as THREE.Vector3;
            const angle = (this.getAngleWithYAxis(normal) * 180) / Math.PI;
            const maxH = this.playerHeight * this.playerModel.scale * 0.9; // 坡度高度阈值
            const h = this.playerHeight * this.playerModel.scale * 0.75; // 正常高度
            const minH = this.playerHeight * this.playerModel.scale * 0.7; // 最小高度

            // console.log("人物中心点距离地面高度", playerDistanceFromGround, "坡度高度阈值", maxH, "正常高度", h, "最小高度", minH);
            // console.log("坡度角度", angle);

            // console.log("this.playerVelocity.y", this.playerVelocity.y);

            if (!this.isFlying) {
                if (playerDistanceFromGround > maxH) {
                    // 下落状态
                    this.playerVelocity.y += delta * this.gravity;
                    this.player.position.addScaledVector(this.playerVelocity, delta);
                    this.playerIsOnGround = false;
                    // console.log("下落");
                } else if (playerDistanceFromGround > h && playerDistanceFromGround < maxH) {
                    if (angle >= 0 && angle < 5) {
                        // 平地
                        this.playerVelocity.y += delta * this.gravity;
                        this.player.position.addScaledVector(this.playerVelocity, delta);
                        this.playerIsOnGround = true;
                        // console.log("平地");
                    } else {
                        // 坡地
                        if (this.spacePressed) {
                            this.playerVelocity.y += delta * this.gravity;
                        } else {
                            // console.log("坡地", this.spacePressed);
                            this.playerVelocity.set(0, 0, 0);
                            this.playerIsOnGround = true;
                        }
                    }
                } else if (playerDistanceFromGround > minH && playerDistanceFromGround < h) {
                    // 误差范围内在平地
                    this.playerVelocity.set(0, 0, 0);
                    this.playerIsOnGround = true;
                } else if (playerDistanceFromGround < minH) {
                    // 强行拉回
                    this.playerVelocity.set(0, 0, 0);
                    this.player.position.set(this.player.position.x, intersects[0].point.y + h, this.player.position.z);
                    this.playerIsOnGround = true;
                }
            }

            // console.log("是否在地面", this.playerIsOnGround);
        }

        // 更新玩家矩阵
        this.player.updateMatrixWorld();

        // BVH碰撞检测
        const capsuleInfo = this.player.capsuleInfo;
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider!.matrixWorld).invert();
        this.tempSegment.copy(capsuleInfo.segment);
        this.tempSegment.start.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);
        this.tempSegment.end.applyMatrix4(this.player.matrixWorld).applyMatrix4(this.tempMat);

        this.tempBox.expandByPoint(this.tempSegment.start);
        this.tempBox.expandByPoint(this.tempSegment.end);
        this.tempBox.expandByScalar(capsuleInfo.radius);

        const bvh = this.collider?.geometry as any;
        bvh?.boundsTree?.shapecast({
            // 检测包围盒碰撞
            intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
            // 检测三角形碰撞
            intersectsTriangle: (tri: any) => {
                const triPoint = this.tempVector;
                const capsulePoint = this.tempVector2;
                const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
                // 距离小于人物半径，发生碰撞
                if (distance < capsuleInfo.radius) {
                    const depth = capsuleInfo.radius - distance;
                    const direction = capsulePoint.sub(triPoint).normalize();
                    this.tempSegment.start.addScaledVector(direction, depth);
                    this.tempSegment.end.addScaledVector(direction, depth);
                }
            },
        });

        // 设置玩家位置
        const newPosition = this.tempVector.copy(this.tempSegment.start).applyMatrix4(this.collider!.matrixWorld);
        const deltaVector = this.tempVector2.subVectors(newPosition, this.player.position);
        const offset = Math.max(0, deltaVector.length() - 1e-5);
        deltaVector.normalize().multiplyScalar(offset);
        this.player.position.add(deltaVector);

        // 第三人称-朝向
        if (!this.isFirstPerson && !this.isFlying) {
            this.camDir.y = 0;
            this.camDir.normalize();
            this.camDir.negate();
            this.moveDir.normalize();
            this.moveDir.negate();

            let lookTarget: THREE.Vector3;
            if (this.thirdMouseMode === 0 || this.thirdMouseMode === 2) {
                if (this.moveDir.lengthSq() > 0) {
                    lookTarget = this.player.position.clone().add(this.moveDir);
                } else {
                    lookTarget = this.player.position.clone().add(this.camDir);
                }
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
            if ((this.thirdMouseMode === 1 || this.thirdMouseMode === 3) && this.moveDir.lengthSq() > 0) {
                lookTarget = this.player.position.clone().add(this.moveDir);
                this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
                this.targetQuat.setFromRotationMatrix(this.targetMat);
                const alpha = Math.min(1, this.rotationSpeed * delta);
                this.player.quaternion.slerp(this.targetQuat, alpha);
            }
        }

        // 飞行模式朝向
        if (this.isFlying) {
            this.camDir.y = 0;
            this.camDir.normalize();
            this.camDir.negate();
            this.moveDir.normalize();
            this.moveDir.negate();
            const lookTarget = this.player.position.clone().add(this.fwdPressed ? this.moveDir : this.camDir);
            this.targetMat.lookAt(this.player.position, lookTarget, this.player.up);
            this.targetQuat.setFromRotationMatrix(this.targetMat);
            const alpha = Math.min(1, this.rotationSpeed * delta);
            this.player.quaternion.slerp(this.targetQuat, alpha);
        }

        // 第三人称-相机跟随
        if (!this.isFirstPerson) {
            const lookTarget = this.player.position.clone();
            lookTarget.y += 30 * this.playerModel.scale;
            this.camera.position.sub(this.controls.target);
            this.controls.target.copy(lookTarget);
            this.camera.position.add(lookTarget);
            this.controls.update();

            // 当视线被遮挡时的处理
            if (!this.enableZoom) {
                this._personToCam.subVectors(this.camera.position, this.player.position);
                const origin = this.player.position.clone().add(new THREE.Vector3(0, 0, 0));
                const direction = this._personToCam.clone().normalize();
                const desiredDist = this._personToCam.length();
                this._raycasterPersonToCam.set(origin, direction);
                this._raycasterPersonToCam.far = desiredDist;
                const intersects = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);
                if (intersects.length > 0) {
                    // 相机拉近
                    const hit = intersects[0];
                    const safeDist = Math.max(hit.distance - this._camEpsilon, this._minCamDistance);
                    const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                    this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
                } else {
                    // 相机恢复
                    this._raycasterPersonToCam.far = this._maxCamDistance;
                    const intersectsMaxDis = this._raycasterPersonToCam.intersectObject(this.collider as THREE.Object3D, false);

                    let safeDist = this._maxCamDistance;
                    if (intersectsMaxDis.length) {
                        const hitMax = intersectsMaxDis[0];
                        safeDist = hitMax.distance - this._camEpsilon;
                    }
                    const targetCamPos = origin.clone().add(direction.clone().multiplyScalar(safeDist));
                    this.camera.position.lerp(targetCamPos, this._camCollisionLerp);
                }
            }
        }

        // 掉出场景重置
        if (this.player.position.y < this.boundingBoxMinY - 1) {
            this._originTmp.set(this.player.position.x, 10000, this.player.position.z);
            this._raycaster.ray.origin.copy(this._originTmp);
            const intersects = this._raycaster.intersectObject(this.collider as THREE.Object3D, false);

            if (intersects.length > 0) {
                // 出现碰撞 说明玩家为bug意外掉落
                console.log("玩家为bug意外掉落");
                this.reset(new THREE.Vector3(this.player.position.x, intersects[0].point.y + 5, this.player.position.z));
            } else {
                // 无碰撞 正常掉落
                console.log("玩家正常掉落");
                this.reset(new THREE.Vector3(this.player.position.x, this.player.position.y + 15, this.player.position.z));
            }
        }
    }

    /**
     * 更新模型动画
     */
    private updateMixers(delta: number) {
        if (this.personMixer) this.personMixer.update(delta);
        if (this.vehicleMixer) this.vehicleMixer.update(delta);
    }

    /**
     * 重置玩家位置
     */
    reset(position?: THREE.Vector3) {
        if (!this.player) return;
        this.playerVelocity.set(0, 0, 0);
        this.player.position.copy(position ?? this.initPos);
    }

    /**
     * 获取玩家位置
     */
    getPosition() {
        return this.player.position;
    }

    // ==================== 输入处理 ====================

    /**
     * 设置输入
     */
    setInput(
        input: Partial<{
            moveX: 1 | 0 | -1;
            moveY: 1 | 0 | -1;
            lookDeltaX: number;
            lookDeltaY: number;
            jump: boolean;
            shift: boolean;
            toggleView: boolean;
            toggleFly: boolean;
        }>
    ) {
        // 控制人物移动
        if (typeof input.moveX === "number") {
            this.lftPressed = input.moveX === -1;
            this.rgtPressed = input.moveX === 1;
            this.setAnimationByPressed();
        }
        if (typeof input.moveY === "number") {
            this.fwdPressed = input.moveY === 1;
            this.bkdPressed = input.moveY === -1;
            this.setAnimationByPressed();
        }

        // 控制朝向
        if (typeof input.lookDeltaX === "number" && typeof input.lookDeltaY === "number") {
            this.setToward(input.lookDeltaX, input.lookDeltaY, 0.002);
        }

        // 跳跃
        if (typeof input.jump === "boolean") {
            if (input.jump) {
                this.spacePressed = true;
                if (!this.playerIsOnGround || this.isFlying) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
            } else {
                this.spacePressed = false;
            }
        }

        // 加速
        if (typeof input.shift === "boolean") {
            this.shiftPressed = input.shift;
        }

        // 切换视角
        if (input.toggleView) {
            this.changeView();
        }

        // 切换飞行
        if (input.toggleFly) {
            this.isFlying = !this.isFlying;
            this.setAnimationByPressed();
            if (!this.isFlying && !this.playerIsOnGround) {
                this.playPersonAnimationByName("jumping");
            }
        }
    }

    /**
     * 根据按键设置人物动画
     */
    private setAnimationByPressed = () => {
        this._maxCamDistance = this.orginMaxCamDistance;

        if (this.isFlying) {
            if (!this.fwdPressed) {
                this.playPersonAnimationByName("flyidle");
                return;
            }
            this.playPersonAnimationByName("flying");
            this._maxCamDistance = this.orginMaxCamDistance * 2;
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

            // 第三人称下动画统一使用前进动画
            if (!this.isFirstPerson && (this.lftPressed || this.rgtPressed || this.bkdPressed)) {
                this.playPersonAnimationByName(this.shiftPressed ? "running" : "walking");
                return;
            }

            // 第一人称下根据方向播放不同动画
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

        // 销毁旧的定时器
        if (this.recheckAnimTimer !== null) {
            clearTimeout(this.recheckAnimTimer);
        }

        // 200ms后重新检测动画
        this.recheckAnimTimer = setTimeout(() => {
            this.setAnimationByPressed();
            this.recheckAnimTimer = null;
        }, 200);
    };

    // ==================== 事件处理 ====================

    /**
     * 键盘按下事件
     */
    private _boundOnKeydown = async (e: KeyboardEvent) => {
        if (e.ctrlKey && ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
            e.preventDefault();
        }

        switch (e.code) {
            case "KeyW":
                this.fwdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyS":
                this.bkdPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyD":
                this.rgtPressed = true;
                this.setAnimationByPressed();
                break;
            case "KeyA":
                this.lftPressed = true;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
                this.shiftPressed = true;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 2, MIDDLE: 1, RIGHT: 0 };
                break;
            case "Space":
                this.spacePressed = true;
                // console.log("点击跳跃", this.playerIsOnGround, this.isFlying);
                if (!this.playerIsOnGround || this.isFlying) return;
                const next = this.personActions?.get("jumping");
                if (next && this.actionState === next) return;
                this.playPersonAnimationByName("jumping");
                this.playerVelocity.y = this.jumpHeight;
                this.playerIsOnGround = false;
                break;
            case "ControlLeft":
                this.ctPressed = true;
                break;
            case "KeyV":
                this.changeView();
                break;
            case "KeyF":
                this.isFlying = !this.isFlying;
                this.setAnimationByPressed();
                if (!this.isFlying && !this.playerIsOnGround) {
                    this.playPersonAnimationByName("jumping");
                }
                break;
            case "KeyE":
                // this.setDrive();
                break;
        }
    };

    /**
     * 键盘抬起事件
     */
    private _boundOnKeyup = (e: KeyboardEvent) => {
        switch (e.code) {
            case "KeyW":
                this.fwdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyS":
                this.bkdPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyD":
                this.rgtPressed = false;
                this.setAnimationByPressed();
                break;
            case "KeyA":
                this.lftPressed = false;
                this.setAnimationByPressed();
                break;
            case "ShiftLeft":
                this.shiftPressed = false;
                this.setAnimationByPressed();
                this.controls.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
                break;
            case "Space":
                this.spacePressed = false;
                break;
            case "ControlLeft":
                this.ctPressed = false;
                break;
        }
    };

    /**
     * 鼠标移动事件
     */
    private _mouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== document.body) return;
        this.setToward(e.movementX, e.movementY, 0.0001);
    };

    /**
     * 鼠标点击事件
     */
    private _mouseClick = (e: MouseEvent) => {
        this.setPointerLock();
    };

    /**
     * 事件绑定
     */
    onAllEvent() {
        this.isupdate = true;
        this.setPointerLock();

        window.addEventListener("keydown", this._boundOnKeydown);
        window.addEventListener("keyup", this._boundOnKeyup);
        window.addEventListener("mousemove", this._mouseMove);
        window.addEventListener("click", this._mouseClick);
    }

    /**
     * 事件解绑
     */
    offAllEvent() {
        this.isupdate = false;
        document.exitPointerLock();
        window.removeEventListener("keydown", this._boundOnKeydown);
        window.removeEventListener("keyup", this._boundOnKeyup);
        window.removeEventListener("mousemove", this._mouseMove);
        window.removeEventListener("click", this._mouseClick);
    }

    // ==================== 移动端控制 ====================

    /**
     * 指针按下事件
     */
    onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = e.pointerId;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;

        this.lookAreaEl?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };

    /**
     * 指针移动事件
     */
    onPointerMove = (e: PointerEvent) => {
        if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
        const dx = e.clientX - this.lastTouchX;
        const dy = e.clientY - this.lastTouchY;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;

        this.setInput({ lookDeltaX: dx, lookDeltaY: dy });
        e.preventDefault();
    };

    /**
     * 指针抬起事件
     */
    onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture?.(e.pointerId);
    };

    /**
     * 初始化移动端摇杆控制
     */
    async initMobileControls() {
        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.touches = { ONE: null as any, TWO: null as any };
        this.nippleModule = await import("nipplejs");
        const nipple = this.nippleModule?.default;
        const JOY_SIZE = 120;

        const container = document.body;

        // 摇杆容器
        this.joystickZoneEl = document.createElement("div");
        this.joystickZoneEl.id = "joy-zone";
        Object.assign(this.joystickZoneEl.style, {
            position: "absolute",
            left: "16px",
            bottom: "16px",
            width: `${JOY_SIZE + 40}px`,
            height: `${JOY_SIZE + 40}px`,
            touchAction: "none",
            zIndex: "999",
            pointerEvents: "auto",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.joystickZoneEl);

        // 阻止touch的默认行为
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.joystickZoneEl?.addEventListener(evtName, (e) => e.preventDefault(), {
                passive: false,
            });
        });

        // 创建摇杆
        this.joystickManager = nipple.create({
            zone: this.joystickZoneEl,
            mode: "static",
            position: {
                left: `${(JOY_SIZE + 40) / 2}px`,
                bottom: `${(JOY_SIZE + 40) / 2}px`,
            },
            color: "#ffffff",
            size: JOY_SIZE,
            multitouch: true,
            maxNumberOfNipples: 1,
        });

        this.joystickManager.on("move", (_evt: any, data: any) => {
            if (!data) return;

            const rawX = data.vector?.x ?? 0;
            const rawY = data.vector?.y ?? 0;
            const distance = data.distance ?? 0;
            const deadzone = 0.5;

            const dirX = rawX > deadzone ? 1 : rawX < -deadzone ? -1 : 0;
            const dirY = rawY > deadzone ? 1 : rawY < -deadzone ? -1 : 0;

            const sprintThreshold = JOY_SIZE / 2;
            const isSprinting = distance >= sprintThreshold;

            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) {
                return;
            }

            this.prevJoyState = { dirX, dirY, shift: isSprinting };
            this.setInput({ moveX: dirX, moveY: dirY, shift: isSprinting });
        });

        this.joystickManager.on("end", () => {
            const prev = this.prevJoyState || { dirX: 0, dirY: 0, shift: false };
            if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift !== false) {
                this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                this.setInput({ moveX: 0, moveY: 0, shift: false });
            }
        });

        // 右侧视角控制区域
        this.lookAreaEl = document.createElement("div");
        Object.assign(this.lookAreaEl.style, {
            position: "absolute",
            right: "0",
            bottom: "0",
            width: "50%",
            height: "100%",
            zIndex: "998",
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.lookAreaEl);

        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((evtName) => {
            this.lookAreaEl?.addEventListener(evtName, (e) => e.preventDefault(), {
                passive: false,
            });
        });

        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        // 创建按钮
        const createBtn = (rightPx: number, bottomPx: number, bgUrl?: string) => {
            const btn = document.createElement("button");
            const styles: Partial<CSSStyleDeclaration> = {
                position: "absolute",
                right: `${rightPx}px`,
                bottom: `${bottomPx}px`,
                width: "56px",
                height: "56px",
                zIndex: "1000",
                borderRadius: "50%",
                border: "2px solid black",
                background: "rgba(0,0,0)",
                padding: "20px",
                opacity: "0.95",
                touchAction: "none",
                fontSize: "14px",
                userSelect: "none",
                overflow: "hidden",
                boxSizing: "border-box",
                backgroundColor: "transparent",
                backgroundRepeat: "no-repeat, no-repeat",
                backgroundPosition: "center center, center center",
                backgroundSize: "100% 100%, 80% 80%",
            };

            if (bgUrl) {
                const overlayColor = "rgba(0,0,0,0.5)";
                styles.backgroundImage = `linear-gradient(${overlayColor}, ${overlayColor}), url("${bgUrl}")`;
            }

            Object.assign(btn.style, styles);
            container.appendChild(btn);
            ["touchstart", "touchend", "touchcancel"].forEach((evtName) => {
                btn.addEventListener(evtName, (e) => e.preventDefault(), { passive: false });
            });

            return btn;
        };

        // 跳跃按钮
        this.jumpBtnEl = createBtn(14, 14, '');
        this.jumpBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: true });
            },
            { passive: false }
        );
        this.jumpBtnEl.addEventListener(
            "touchend",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: false });
            },
            { passive: false }
        );
        this.jumpBtnEl.addEventListener(
            "touchcancel",
            (e) => {
                e.preventDefault();
                this.setInput({ jump: false });
            },
            { passive: false }
        );

        // 切换飞行按钮
        this.flyBtnEl = createBtn(14, 14 + 80, '');
        this.flyBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ toggleFly: true });
            },
            { passive: false }
        );

        // 切换视角按钮
        this.viewBtnEl = createBtn(14, 14 + 200, '');
        this.viewBtnEl.addEventListener(
            "touchstart",
            (e) => {
                e.preventDefault();
                this.setInput({ toggleView: true });
            },
            { passive: false }
        );
    }

    /**
     * 销毁移动端摇杆控制
     */
    destroyMobileControls() {
        try {
            if (this.joystickManager && this.joystickManager.destroy) {
                this.joystickManager.destroy();
                this.joystickManager = null;
            }
            if (this.joystickZoneEl?.parentElement) {
                this.joystickZoneEl.parentElement.removeChild(this.joystickZoneEl);
                this.joystickZoneEl = null;
            }
            if (this.lookAreaEl?.parentElement) {
                this.lookAreaEl.parentElement.removeChild(this.lookAreaEl);
                this.lookAreaEl = null;
            }
            if (this.jumpBtnEl?.parentElement) {
                this.jumpBtnEl.parentElement.removeChild(this.jumpBtnEl);
                this.jumpBtnEl = null;
            }
            if (this.flyBtnEl?.parentElement) {
                this.flyBtnEl.parentElement.removeChild(this.flyBtnEl);
                this.flyBtnEl = null;
            }
            if (this.viewBtnEl?.parentElement) {
                this.viewBtnEl.parentElement.removeChild(this.viewBtnEl);
                this.viewBtnEl = null;
            }

            // 监听
            this.lookAreaEl?.removeEventListener("pointerdown", this.onPointerDown);
            this.lookAreaEl?.removeEventListener("pointermove", this.onPointerMove);
            this.lookAreaEl?.removeEventListener("pointerup", this.onPointerUp);
            this.lookAreaEl?.removeEventListener("pointercancel", this.onPointerUp);
        } catch (e) {
            console.warn("销毁移动端摇杆控制时出错：", e);
        }
    }

    // ==================== 销毁 ====================

    /**
     * 销毁人物控制器
     */
    destroy() {
        this.offAllEvent();
        if (this.player) {
            this.player.remove(this.camera);
            this.scene.remove(this.player);
        }
        (this.player as any) = null;
        if (this.person) {
            this.scene.remove(this.person);
            this.person = null;
        }

        this.resetControls();

        // 清理 BVH 可视化
        if (this.visualizer) {
            this.scene.remove(this.visualizer);
            this.visualizer = null;
        }
        if (this.collider) {
            this.scene.remove(this.collider);
            this.collider = null;
        }

        this.destroyMobileControls();

        controllerInstance = null;
    }
}

// 导出API
export function playerController() {
    if (!controllerInstance) controllerInstance = new PlayerController();
    const c = controllerInstance;
    return {
        init: (opts: PlayerControllerOptions, callback?: () => void) => c.init(opts, callback),
        changeView: () => c.changeView(),
        reset: (pos?: THREE.Vector3) => c.reset(pos),
        update: (dt?: number) => c.update(dt),
        destroy: () => c.destroy(),
        setInput: (i: any) => c.setInput(i),
        getposition: () => c.getPosition(),
        loadVehicleModel: (params: {
            url: string;
            position: THREE.Vector3;
            scale?: number;
            animations: {
                openDoorAnim?: string;
                wheelsTurnAnim?: string;
                turnLeftAnim?: string;
                turnRightAnim?: string;
            };
        }) => c.loadVehicleModel(params),
    };
}

// 打开所有事件
export function onAllEvent(): void {
    if (!controllerInstance) controllerInstance = new PlayerController();
    controllerInstance.onAllEvent();
}

// 关闭所有事件
export function offAllEvent(): void {
    if (!controllerInstance) return;
    controllerInstance.offAllEvent();
}
