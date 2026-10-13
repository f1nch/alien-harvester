/** Short-lived floating text (e.g. "+12 ◆") anchored to a screen position. */
export class Floaters {
  private layer: HTMLDivElement;

  constructor(root: HTMLElement, private enabled: boolean) {
    this.layer = document.createElement("div");
    this.layer.className = "floaters";
    this.layer.setAttribute("aria-hidden", "true");
    root.prepend(this.layer);
  }

  spawn(text: string, x: number, y: number, kind: "gain" | "level" = "gain"): void {
    if (!this.enabled) return;
    const el = document.createElement("div");
    el.className = `floater ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.layer.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
    // Safety net in case animations are disabled.
    window.setTimeout(() => el.remove(), 2000);
  }
}
