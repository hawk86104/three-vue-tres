import * as THREE from "three";

export type MobileControlsOptions = {
    joystick?: boolean;
    jump?: boolean;
    fly?: boolean;
    view?: boolean;
};

export type PlayerModelOptions = {
    url: string;
    scale: number;
    idleAnim: string;
    walkAnim: string;
    runAnim: string;
    jumpAnim: string;
    leftWalkAnim?: string;
    rightWalkAnim?: string;
    backwardAnim?: string;
    flyAnim?: string;
    flyIdleAnim?: string;
    gravity?: number;
    jumpHeight?: number;
    speed?: number;
    flySpeed?: number;
    rotateY?: number;
    headObjName?: string;
    flyEnabled?: boolean;
    capsuleRadiusRatio?: number;
};

export type PlayerControllerOptions = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: any;
    playerModel: PlayerModelOptions;
    initPos?: THREE.Vector3;
    mouseSensitivity?: number;
    minCamDistance?: number;
    maxCamDistance?: number;
    colliderMeshUrl?: string;
    isShowMobileControls?: boolean;
    mobileControls?: MobileControlsOptions;
    thirdMouseMode?: 0 | 1 | 2 | 3;
    enableZoom?: boolean;
    enableOverShoulderView?: boolean;
};
