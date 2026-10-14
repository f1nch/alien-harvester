import { CURRENCIES, CURRENCY_LABEL, type Currency } from "../content/currencies";

export interface DevActions {
  grant(currency: Currency, amount: number): void;
  addXp(amount: number): void;
  completeObjectives(): void;
  devolve(): void;
}

/**
 * Dev-only testing panel. Only imported behind `import.meta.env.DEV`, so it is
 * stripped from production builds and never becomes a player-facing shortcut.
 */
export interface DevTools {
  /** Shows where the creature's look comes from (GLB or procedural, per form). */
  setCreatureStatus(text: string): void;
  recordFrame(now: number, cpuMs: number, inputStrength: number, speed: number, lastDrag: number): void;
}

export function mountDevTools(root: HTMLElement, actions: DevActions): DevTools {
  const toggle = document.createElement("button");
  toggle.className = "btn dev-toggle";
  toggle.textContent = "Dev";
  toggle.setAttribute("aria-expanded", "false");

  const panel = document.createElement("div");
  panel.className = "dev-panel hidden";
  const title = document.createElement("div");
  title.className = "dev-title";
  title.textContent = "Testing tools (dev build only)";
  panel.append(title);

  const button = (label: string, aria: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.className = "btn dev-add";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  };
  const row = (label: string, ...buttons: HTMLButtonElement[]) => {
    const r = document.createElement("div");
    r.className = "dev-row";
    const l = document.createElement("span");
    l.textContent = label;
    r.append(l, ...buttons);
    panel.append(r);
  };

  for (const c of CURRENCIES) {
    row(
      CURRENCY_LABEL[c],
      ...[100, 1000].map((amount) => button(`+${amount}`, `Add ${amount} ${CURRENCY_LABEL[c]}`, () => actions.grant(c, amount))),
    );
  }
  row("XP", button("+500", "Add 500 XP", () => actions.addXp(500)));
  row(
    "Progress",
    button("Complete objectives", "Complete all current objectives", () => actions.completeObjectives()),
    button("Devolve", "Return to the previous evolution form", () => actions.devolve()),
  );

  const creature = document.createElement("div");
  creature.className = "dev-row dev-status";
  creature.setAttribute("aria-live", "polite");
  panel.append(creature);

  const performanceStatus = document.createElement("div");
  performanceStatus.className = "dev-row dev-status";
  performanceStatus.setAttribute("aria-label", "Frame performance");
  panel.append(performanceStatus);
  const movementStatus = document.createElement("div");
  movementStatus.className = "dev-row dev-status";
  movementStatus.setAttribute("aria-label", "Movement diagnostics");
  panel.append(movementStatus);
  let lastFrame = 0;
  let lastDisplay = 0;
  const intervals: number[] = [];
  const costs: number[] = [];
  let lastMovingSpeed = 0;
  let lastMovingInput = 0;
  row("Performance", button("Reset sample", "Reset frame performance sample", () => {
    intervals.length = costs.length = 0;
    lastFrame = lastDisplay = 0;
    performanceStatus.textContent = "Collecting frame sample…";
  }));
  performanceStatus.textContent = "Collecting frame sample…";

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
  });
  root.append(toggle, panel);
  return {
    setCreatureStatus(text) {
      creature.textContent = `Creature: ${text}`;
    },
    recordFrame(now, cpuMs, inputStrength, speed, lastDrag) {
      if (inputStrength > 0 && speed > 0) {
        lastMovingSpeed = speed;
        lastMovingInput = inputStrength;
      }
      if (document.hidden) { lastFrame = 0; return; }
      if (lastFrame) {
        intervals.push(now - lastFrame);
        costs.push(cpuMs);
        if (intervals.length > 600) { intervals.shift(); costs.shift(); }
      }
      lastFrame = now;
      if (now - lastDisplay < 500 || intervals.length < 2) return;
      lastDisplay = now;
      const sorted = [...intervals].sort((a, b) => a - b);
      const duration = intervals.reduce((sum, ms) => sum + ms, 0);
      const fps = 1000 * intervals.length / duration;
      const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
      const slow = intervals.filter((ms) => ms > 33.34).length;
      const cpu = costs.reduce((sum, ms) => sum + ms, 0) / costs.length;
      performanceStatus.textContent = `${fps.toFixed(1)} FPS · p95 ${p95.toFixed(1)} ms · CPU ${cpu.toFixed(1)} ms · ${slow}/${intervals.length} frames >33 ms · ${(duration / 1000).toFixed(1)} s sample`;
      movementStatus.textContent = `Input ${inputStrength.toFixed(2)} / 1 · speed ${speed.toFixed(2)} m/s · last drag ${lastDrag.toFixed(2)} / 1 · last moving ${lastMovingInput.toFixed(2)} / 1 at ${lastMovingSpeed.toFixed(2)} m/s`;
    },
  };
}
