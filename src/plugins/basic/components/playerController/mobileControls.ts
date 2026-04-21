import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MobileControlsOptions } from "./types";

type SetInputFn = (input: Partial<{
    moveX: 1 | 0 | -1;
    moveY: 1 | 0 | -1;
    lookDeltaX: number;
    lookDeltaY: number;
    jump: boolean;
    shift: boolean;
    toggleView: boolean;
    toggleFly: boolean;
}>) => void;

const iconDataUri = (body: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
    )}`;

const jumpIcon = iconDataUri('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/><path d="M5 21h14"/>');
const flyIcon = iconDataUri('<path d="M3 13l8-3 10-6-6 16-4-6-8-1Z"/><path d="M11 10l4 4"/>');
const viewIcon = iconDataUri('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>');

class VirtualJoystick {
    private baseEl: HTMLDivElement;
    private stickEl: HTMLDivElement;
    private pointerId: number | null = null;
    private center = { x: 0, y: 0 };
    private readonly radius: number;
    private readonly onMove: (data: { vector: { x: number; y: number }; distance: number }) => void;
    private readonly onEnd: () => void;

    constructor(
        zone: HTMLDivElement,
        size: number,
        onMove: (data: { vector: { x: number; y: number }; distance: number }) => void,
        onEnd: () => void,
    ) {
        this.radius = size / 2;
        this.onMove = onMove;
        this.onEnd = onEnd;

        this.baseEl = document.createElement("div");
        Object.assign(this.baseEl.style, {
            position: "absolute",
            left: "50%",
            bottom: "50%",
            transform: "translate(-50%, 50%)",
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.28)",
            background: "radial-gradient(circle at center, rgba(255,255,255,0.18), rgba(15,23,42,0.24) 72%)",
            boxShadow: "inset 0 0 22px rgba(255,255,255,0.08), 0 10px 32px rgba(0,0,0,0.28)",
            boxSizing: "border-box",
            pointerEvents: "none",
            backdropFilter: "blur(10px)",
        });
        zone.appendChild(this.baseEl);

        const stickSize = size * 0.26;
        this.stickEl = document.createElement("div");
        Object.assign(this.stickEl.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: `${stickSize}px`,
            height: `${stickSize}px`,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(203,213,225,0.52))",
            boxShadow: "0 4px 16px rgba(0,0,0,0.32)",
            pointerEvents: "none",
        });
        this.baseEl.appendChild(this.stickEl);

        zone.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        zone.addEventListener("pointermove", this.onPointerMove, { passive: false });
        zone.addEventListener("pointerup", this.onPointerUp, { passive: false });
        zone.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch" || this.pointerId !== null) return;
        this.pointerId = e.pointerId;
        const rect = this.baseEl.parentElement!.getBoundingClientRect();
        this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.baseEl.parentElement!.setPointerCapture(e.pointerId);
        e.preventDefault();
        this.updateStick(e.clientX, e.clientY);
    };

    private onPointerMove = (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.updateStick(e.clientX, e.clientY);
    };

    private onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        this.pointerId = null;
        this.stickEl.style.transform = "translate(-50%, -50%)";
        this.onEnd();
    };

    private updateStick(clientX: number, clientY: number) {
        const dx = clientX - this.center.x;
        const dy = clientY - this.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clampedDistance = Math.min(distance, this.radius);
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.cos(angle) * clampedDistance;
        const offsetY = Math.sin(angle) * clampedDistance;

        this.stickEl.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

        const scale = distance > 0 ? clampedDistance / this.radius / distance : 0;
        this.onMove({
            vector: { x: dx * scale, y: -dy * scale },
            distance: clampedDistance,
        });
    }

    destroy() {
        const zone = this.baseEl.parentElement;
        if (zone) {
            zone.removeEventListener("pointerdown", this.onPointerDown);
            zone.removeEventListener("pointermove", this.onPointerMove);
            zone.removeEventListener("pointerup", this.onPointerUp);
            zone.removeEventListener("pointercancel", this.onPointerUp);
        }
        this.baseEl.remove();
    }
}

export class MobileControls {
    private readonly setInput: SetInputFn;
    private readonly controls: OrbitControls;
    private joystick: VirtualJoystick | null = null;
    private prevJoyState = { dirX: 0, dirY: 0, shift: false };

    private joystickZoneEl: HTMLDivElement | null = null;
    private lookAreaEl: HTMLDivElement | null = null;
    private jumpBtnEl: HTMLButtonElement | null = null;
    private flyBtnEl: HTMLButtonElement | null = null;
    private viewBtnEl: HTMLButtonElement | null = null;

    private lookPointerId: number | null = null;
    private isLookDown = false;
    private lastTouchX = 0;
    private lastTouchY = 0;

    constructor(setInput: SetInputFn, controls: OrbitControls) {
        this.setInput = setInput;
        this.controls = controls;
    }

    async init(options?: MobileControlsOptions) {
        const showJoystick = options?.joystick ?? true;
        const showJump = options?.jump ?? true;
        const showFly = options?.fly ?? true;
        const showView = options?.view ?? true;

        this.controls.maxPolarAngle = Math.PI * (300 / 360);
        this.controls.touches = { ONE: null as any, TWO: null as any };

        const joystickSize = 120;
        const container = document.body;

        if (showJoystick) {
            this.joystickZoneEl = document.createElement("div");
            this.joystickZoneEl.id = "player-controller-joy-zone";
            Object.assign(this.joystickZoneEl.style, {
                position: "fixed",
                left: "calc(env(safe-area-inset-left, 0px) + 16px)",
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                width: `${joystickSize + 40}px`,
                height: `${joystickSize + 40}px`,
                touchAction: "none",
                zIndex: "999",
                pointerEvents: "auto",
                WebkitUserSelect: "none",
                userSelect: "none",
            });
            container.appendChild(this.joystickZoneEl);
            this.blockTouch(this.joystickZoneEl);

            this.joystick = new VirtualJoystick(
                this.joystickZoneEl,
                joystickSize,
                (data) => {
                    const rawX = data.vector.x ?? 0;
                    const rawY = data.vector.y ?? 0;
                    const deadZone = 0.2;
                    const dirX = rawX > deadZone ? 1 : rawX < -deadZone ? -1 : 0;
                    const dirY = rawY > deadZone ? 1 : rawY < -deadZone ? -1 : 0;
                    const isSprinting = data.distance >= joystickSize / 2;
                    const prev = this.prevJoyState;

                    if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) return;

                    this.prevJoyState = { dirX, dirY, shift: isSprinting };
                    this.setInput({
                        moveX: dirX as 1 | 0 | -1,
                        moveY: dirY as 1 | 0 | -1,
                        shift: isSprinting,
                    });
                },
                () => {
                    const prev = this.prevJoyState;
                    if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift) {
                        this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                        this.setInput({ moveX: 0, moveY: 0, shift: false });
                    }
                },
            );
        }

        this.lookAreaEl = document.createElement("div");
        Object.assign(this.lookAreaEl.style, {
            position: "fixed",
            right: "0",
            bottom: "0",
            width: "55%",
            height: "100%",
            zIndex: "998",
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.lookAreaEl);
        this.blockTouch(this.lookAreaEl);

        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        if (showJump) {
            this.jumpBtnEl = this.createBtn(container, 18, 18, jumpIcon);
            this.jumpBtnEl.addEventListener("touchstart", this.handleJumpStart, { passive: false });
            this.jumpBtnEl.addEventListener("touchend", this.handleJumpEnd, { passive: false });
            this.jumpBtnEl.addEventListener("touchcancel", this.handleJumpEnd, { passive: false });
        }

        if (showFly) {
            this.flyBtnEl = this.createBtn(container, 18, 96, flyIcon);
            this.flyBtnEl.addEventListener("touchstart", this.handleFlyToggle, { passive: false });
        }

        if (showView) {
            this.viewBtnEl = this.createBtn(container, 18, 174, viewIcon);
            this.viewBtnEl.addEventListener("touchstart", this.handleViewToggle, { passive: false });
        }
    }

    destroy() {
        try {
            this.joystick?.destroy();
            this.joystick = null;

            if (this.lookAreaEl) {
                this.lookAreaEl.removeEventListener("pointerdown", this.onPointerDown);
                this.lookAreaEl.removeEventListener("pointermove", this.onPointerMove);
                this.lookAreaEl.removeEventListener("pointerup", this.onPointerUp);
                this.lookAreaEl.removeEventListener("pointercancel", this.onPointerUp);
            }

            if (this.jumpBtnEl) {
                this.jumpBtnEl.removeEventListener("touchstart", this.handleJumpStart);
                this.jumpBtnEl.removeEventListener("touchend", this.handleJumpEnd);
                this.jumpBtnEl.removeEventListener("touchcancel", this.handleJumpEnd);
            }

            if (this.flyBtnEl) {
                this.flyBtnEl.removeEventListener("touchstart", this.handleFlyToggle);
            }

            if (this.viewBtnEl) {
                this.viewBtnEl.removeEventListener("touchstart", this.handleViewToggle);
            }

            [this.joystickZoneEl, this.lookAreaEl, this.jumpBtnEl, this.flyBtnEl, this.viewBtnEl].forEach((el) => {
                el?.parentElement?.removeChild(el);
            });

            this.joystickZoneEl = null;
            this.lookAreaEl = null;
            this.jumpBtnEl = null;
            this.flyBtnEl = null;
            this.viewBtnEl = null;
        } catch (error) {
            console.warn("销毁移动端控制时出错：", error);
        }
    }

    setFlyEnabled(enabled: boolean) {
        if (this.flyBtnEl) {
            this.flyBtnEl.style.display = enabled ? "block" : "none";
        }
    }

    private handleJumpStart = (event: TouchEvent) => {
        event.preventDefault();
        this.setInput({ jump: true });
    };

    private handleJumpEnd = (event: TouchEvent) => {
        event.preventDefault();
        this.setInput({ jump: false });
    };

    private handleFlyToggle = (event: TouchEvent) => {
        event.preventDefault();
        this.setInput({ toggleFly: true });
    };

    private handleViewToggle = (event: TouchEvent) => {
        event.preventDefault();
        this.setInput({ toggleView: true });
    };

    private onPointerDown = (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = event.pointerId;
        this.lastTouchX = event.clientX;
        this.lastTouchY = event.clientY;
        this.lookAreaEl?.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    private onPointerMove = (event: PointerEvent) => {
        if (!this.isLookDown || event.pointerId !== this.lookPointerId) return;
        const deltaX = event.clientX - this.lastTouchX;
        const deltaY = event.clientY - this.lastTouchY;
        this.lastTouchX = event.clientX;
        this.lastTouchY = event.clientY;
        this.setInput({ lookDeltaX: deltaX, lookDeltaY: deltaY });
        event.preventDefault();
    };

    private onPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture?.(event.pointerId);
    };

    private blockTouch(element: HTMLElement) {
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((eventName) => {
            element.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
        });
    }

    private createBtn(container: HTMLElement, rightPx: number, bottomPx: number, icon: string) {
        const button = document.createElement("button");
        Object.assign(button.style, {
            position: "fixed",
            right: `calc(env(safe-area-inset-right, 0px) + ${rightPx}px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomPx}px)`,
            width: "58px",
            height: "58px",
            zIndex: "1000",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.32)",
            padding: "0",
            opacity: "0.96",
            touchAction: "none",
            fontSize: "14px",
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            backgroundColor: "rgba(15, 23, 42, 0.28)",
            backgroundRepeat: "no-repeat, no-repeat",
            backgroundPosition: "center center, center center",
            backgroundSize: "64% 64%, 100% 100%",
            backgroundImage: `url("${icon}"), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(15,23,42,0.88))`,
            boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
            backdropFilter: "blur(14px)",
        });

        container.appendChild(button);
        ["touchstart", "touchend", "touchcancel"].forEach((eventName) => {
            button.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
        });

        return button;
    }
}
