import { joystickVector, JOYSTICK_RADIUS_PX as MAX_RADIUS_PX } from "./joystick";

/**
 * Floating virtual joystick plus WASD / arrow keys. Produces a world-space
 * vector where screen-up is +Z and screen-right is +X.
 */
export class InputController {
  /** Most recent pointer sample, retained after release for dev diagnostics. */
  lastPointerStrength = 0;
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0 };
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(private zone: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "joy-base";
    this.knob = document.createElement("div");
    this.knob.className = "joy-knob";
    this.base.appendChild(this.knob);
    zone.appendChild(this.base);

    zone.addEventListener("pointerdown", this.onDown);
    zone.addEventListener("pointermove", this.onMove);
    zone.addEventListener("pointerup", this.onUp);
    zone.addEventListener("pointercancel", this.onUp);
    zone.addEventListener("lostpointercapture", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", () => this.reset());
    window.addEventListener("orientationchange", () => this.reset());
  }

  setLeftHanded(left: boolean): void {
    this.zone.classList.toggle("left-handed", left);
  }

  /** Clear all held input (pause, modal open, page hide, rotation). */
  reset(): void {
    this.keys.clear();
    if (this.pointerId !== null && this.zone.hasPointerCapture(this.pointerId)) {
      this.zone.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.stick.x = this.stick.y = 0;
    this.base.classList.remove("active");
  }

  read(out: { x: number; z: number }): void {
    let x = this.stick.x;
    let z = this.stick.y;
    const k = this.keys;
    const kx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const kz = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    if (kx || kz) {
      const len = Math.hypot(kx, kz);
      x = kx / len;
      z = kz / len;
    }
    out.x = x;
    out.z = z;
  }

  private onDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.lastPointerStrength = 0;
    this.zone.setPointerCapture(e.pointerId);
    const r = this.zone.getBoundingClientRect();
    this.origin.x = e.clientX;
    this.origin.y = e.clientY;
    this.base.style.left = `${e.clientX - r.left}px`;
    this.base.style.top = `${e.clientY - r.top}px`;
    this.base.classList.add("active");
    this.updateKnob(0, 0);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const direction = joystickVector(dx, dy);
    this.lastPointerStrength = Math.hypot(direction.x, direction.z);
    const len = Math.hypot(dx, dy);
    if (len > MAX_RADIUS_PX) {
      dx = (dx / len) * MAX_RADIUS_PX;
      dy = (dy / len) * MAX_RADIUS_PX;
    }
    this.updateKnob(dx, dy);
    this.stick.x = direction.x;
    this.stick.y = direction.z;
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.reset();
  };

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
  };

  private updateKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
