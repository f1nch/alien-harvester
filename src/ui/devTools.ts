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
export function mountDevTools(root: HTMLElement, actions: DevActions): void {
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

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
  });
  root.append(toggle, panel);
}
