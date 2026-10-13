import { CURRENCIES, CURRENCY_LABEL, type Currency } from "../content/currencies";

/**
 * Dev-only testing panel. Only imported behind `import.meta.env.DEV`, so it is
 * stripped from production builds and never becomes a player-facing shortcut.
 */
export function mountDevTools(root: HTMLElement, grant: (currency: Currency, amount: number) => void): void {
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

  for (const c of CURRENCIES) {
    const row = document.createElement("div");
    row.className = "dev-row";
    const label = document.createElement("span");
    label.textContent = CURRENCY_LABEL[c];
    row.append(label);
    for (const amount of [100, 1000]) {
      const b = document.createElement("button");
      b.className = "btn dev-add";
      b.textContent = `+${amount}`;
      b.setAttribute("aria-label", `Add ${amount} ${CURRENCY_LABEL[c]}`);
      b.addEventListener("click", () => grant(c, amount));
      row.append(b);
    }
    panel.append(row);
  }

  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
  });
  root.append(toggle, panel);
}
