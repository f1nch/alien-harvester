import { UPGRADES, UPGRADE_IDS, type UpgradeId } from "../content/upgrades";
import { maxLevel, nextCost } from "../domain/economy";
import { cargoWeight } from "../domain/progress";
import type { World } from "../game/world";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface HudCallbacks {
  onOpenUpgrades(): void;
  onCloseUpgrades(): void;
  onBuy(id: UpgradeId): void;
  onToggleHand(): void;
}

export class Hud {
  private biomass: HTMLElement;
  private xp: HTMLElement;
  private cargoText: HTMLElement;
  private cargoFill: HTMLElement;
  private cargoBox: HTMLElement;
  private hint: HTMLElement;
  private upgradeBtn: HTMLButtonElement;
  private panel: HTMLElement;
  private rows = new Map<UpgradeId, { level: HTMLElement; value: HTMLElement; buy: HTMLButtonElement }>();
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private overlay: HTMLElement;
  private last = "";

  constructor(root: HTMLElement, cb: HudCallbacks) {
    const top = el("div", "hud-top");
    const res = el("div", "chip");
    res.append(el("span", "chip-icon biomass", "◆"), el("span", "chip-label", "Biomass"));
    this.biomass = el("span", "chip-value", "0");
    res.append(this.biomass);
    const xp = el("div", "chip");
    xp.append(el("span", "chip-label", "XP"));
    this.xp = el("span", "chip-value", "0");
    xp.append(this.xp);

    this.cargoBox = el("div", "cargo");
    const cargoLabel = el("div", "cargo-label");
    cargoLabel.append(el("span", undefined, "Cargo"));
    this.cargoText = el("span", "cargo-value", "0 / 20");
    cargoLabel.append(this.cargoText);
    const bar = el("div", "cargo-bar");
    this.cargoFill = el("div", "cargo-fill");
    bar.append(this.cargoFill);
    this.cargoBox.append(cargoLabel, bar);
    top.append(res, xp, this.cargoBox);

    this.hint = el("div", "hint");

    this.upgradeBtn = el("button", "btn btn-upgrade", "Upgrades");
    this.upgradeBtn.addEventListener("click", () => cb.onOpenUpgrades());

    this.panel = el("div", "panel hidden");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Upgrades");
    const card = el("div", "panel-card");
    const head = el("div", "panel-head");
    head.append(el("h2", undefined, "Mutations"));
    const close = el("button", "btn btn-close", "Close");
    close.addEventListener("click", () => cb.onCloseUpgrades());
    head.append(close);
    card.append(head, el("p", "panel-note", "Game paused. Spend banked biomass; cargo must be deposited at base first."));
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const row = el("div", "up-row");
      const info = el("div", "up-info");
      const name = el("div", "up-name", def.name);
      const level = el("span", "up-level");
      name.append(level);
      const value = el("div", "up-value");
      info.append(name, value);
      const buy = el("button", "btn btn-buy");
      buy.addEventListener("click", () => cb.onBuy(id));
      row.append(info, buy);
      card.append(row);
      this.rows.set(id, { level, value, buy });
    }
    const settings = el("div", "panel-settings");
    const hand = el("button", "btn btn-secondary", "Swap button side");
    hand.addEventListener("click", () => cb.onToggleHand());
    settings.append(hand);
    card.append(settings);
    this.panel.append(card);

    this.toastEl = el("div", "toast hidden");
    this.overlay = el("div", "overlay hidden");

    root.append(top, this.hint, this.upgradeBtn, this.panel, this.toastEl, this.overlay);
  }

  setLeftHanded(left: boolean): void {
    this.upgradeBtn.classList.toggle("left", left);
  }

  get upgradesOpen(): boolean {
    return !this.panel.classList.contains("hidden");
  }

  showUpgrades(open: boolean): void {
    this.panel.classList.toggle("hidden", !open);
    this.last = "";
  }

  toast(msg: string, seconds = 2.5): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove("hidden");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add("hidden"), seconds * 1000);
  }

  /** Full-screen blocking message (e.g. game open in another tab). */
  block(title: string, body: string): void {
    this.overlay.replaceChildren(el("h2", undefined, title), el("p", undefined, body));
    this.overlay.classList.remove("hidden");
  }

  update(w: World, inBaseNow: boolean): void {
    const p = w.progress;
    const cargo = cargoWeight(p.cargo);
    const cap = w.stats.cargoCapacity;
    const key = `${p.banked.biomass}|${p.xp}|${cargo}|${cap}|${w.cargoFull}|${inBaseNow}|${this.upgradesOpen}`;
    if (key === this.last) return;
    this.last = key;

    this.biomass.textContent = fmt(p.banked.biomass);
    this.xp.textContent = fmt(p.xp);
    this.cargoText.textContent = `${fmt(cargo)} / ${fmt(cap)}`;
    this.cargoFill.style.width = `${Math.min(100, (cargo / cap) * 100)}%`;
    this.cargoBox.classList.toggle("full", w.cargoFull);

    let hint = "";
    if (w.cargoFull && !inBaseNow) hint = "Cargo full — return to base ▼";
    else if (inBaseNow && cargo > 0) hint = "Depositing…";
    else if (p.xp === 0) hint = "Move near workers to capture them";
    this.hint.textContent = hint;
    this.hint.classList.toggle("hidden", hint === "");
    this.hint.classList.toggle("warn", w.cargoFull && !inBaseNow);

    let affordable = false;
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const row = this.rows.get(id)!;
      const lvl = p.upgrades[id];
      const cost = nextCost(p, id);
      const cur = def.base + def.perLevel * lvl;
      row.level.textContent = ` Lv ${lvl}/${maxLevel(id)}`;
      row.value.textContent = cost === null
        ? `${fmt(cur)}${def.unit} (max)`
        : `${fmt(cur)}${def.unit} → ${fmt(cur + def.perLevel)}${def.unit}`;
      if (cost === null) {
        row.buy.textContent = "Maxed";
        row.buy.disabled = true;
      } else {
        const can = p.banked[def.currency] >= cost;
        affordable ||= can;
        row.buy.textContent = `Buy · ${cost} ◆`;
        row.buy.disabled = !can;
        row.buy.setAttribute("aria-label", `Buy ${def.name} for ${cost} biomass`);
      }
    }
    this.upgradeBtn.classList.toggle("ready", affordable);
    this.upgradeBtn.textContent = affordable ? "Upgrades ●" : "Upgrades";
  }
}
