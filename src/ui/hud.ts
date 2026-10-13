import type { DoorDef } from "../content/map";
import { goalTarget } from "../content/quests";
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from "../content/upgrades";
import { doorRequirements } from "../domain/doors";
import { FORM_NAMES } from "../content/evolution";
import { CURRENCY_LABEL, type Currency } from "../content/currencies";
import { cappedByEvolution, maxLevel, nextCost, upgradeValue } from "../domain/economy";
import { evolutionRequirements, nextEvolution } from "../domain/evolution";
import type { Requirement } from "../domain/requirements";
import { levelProgress } from "../domain/levels";
import { cargoWeight } from "../domain/progress";
import { activeQuests, questCount } from "../domain/quests";
import type { World } from "../game/world";

/** Distinct shapes per currency, so cost labels don't rely on colour. */
export const CURRENCY_ICON: Record<Currency, string> = { biomass: "◆", genetic: "✦", parts: "⬢" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function chip(icon: string, iconCls: string, label: string): { root: HTMLElement; value: HTMLElement } {
  const root = el("div", "chip");
  root.setAttribute("aria-label", label);
  root.title = label;
  const value = el("span", "chip-value", "0");
  root.append(el("span", `chip-icon ${iconCls}`, icon), el("span", "chip-label", label), value);
  return { root, value };
}

export interface HudCallbacks {
  onOpenUpgrades(): void;
  onCloseUpgrades(): void;
  onBuy(id: UpgradeId): void;
  onToggleHand(): void;
  onUnlockDoor(door: DoorDef): void;
  onEvolve(): void;
  onRespec(): void;
}

function requirementList(list: HTMLElement, reqs: Requirement[]): void {
  list.replaceChildren(
    ...reqs.map((r) => {
      const li = el("li", r.met ? "met" : "unmet");
      // Marks are text (✓ / ✗), not colour alone.
      li.append(el("span", "req-mark", r.met ? "✓" : "✗"), el("span", "req-label", r.label), el("span", "req-progress", r.progress));
      return li;
    }),
  );
}

export interface HudState {
  inBase: boolean;
  /** Locked door the player is standing next to. */
  door: DoorDef | null;
  /** Why a respec isn't allowed right now, or null if it is. */
  respecBlocker: "notAtBase" | "cargoAboard" | null;
}

export class Hud {
  private biomass: HTMLElement;
  private genetic: HTMLElement;
  private geneticChip: HTMLElement;
  private level: HTMLElement;
  private levelFill: HTMLElement;
  private levelText: HTMLElement;
  private healthBox: HTMLElement;
  private healthText: HTMLElement;
  private healthFill: HTMLElement;
  private vignette: HTMLElement;
  private cargoText: HTMLElement;
  private cargoFill: HTMLElement;
  private cargoBox: HTMLElement;
  private hint: HTMLElement;
  private quests: HTMLElement;
  private doorCard: HTMLElement;
  private doorTitle: HTMLElement;
  private doorList: HTMLElement;
  private doorBtn: HTMLButtonElement;
  private currentDoor: DoorDef | null = null;
  private upgradeBtn: HTMLButtonElement;
  private panel: HTMLElement;
  private rows = new Map<UpgradeId, { level: HTMLElement; value: HTMLElement; buy: HTMLButtonElement }>();
  private evoForm: HTMLElement;
  private evoNext: HTMLElement;
  private evoDesc: HTMLElement;
  private evoList: HTMLElement;
  private evoBtn: HTMLButtonElement;
  private respecBtn: HTMLButtonElement;
  private respecArmedAt = 0;
  private respecArmedUntil = 0;
  private respecNote: HTMLElement;
  private respecBlocker: HudState["respecBlocker"] = "notAtBase";
  private toastEl: HTMLElement;
  private toastQueue: string[] = [];
  private toastBusy = false;
  private overlay: HTMLElement;
  private last = "";

  constructor(root: HTMLElement, cb: HudCallbacks) {
    const top = el("div", "hud-top");
    const bio = chip("◆", "biomass", "Biomass");
    this.biomass = bio.value;
    const gen = chip("✦", "genetic", "Genetic");
    this.genetic = gen.value;
    this.geneticChip = gen.root;

    const lvl = el("div", "chip level-chip");
    this.level = el("span", "chip-value", "Lv 1");
    const lvlBar = el("div", "level-bar");
    this.levelFill = el("div", "level-fill");
    lvlBar.append(this.levelFill);
    this.levelText = el("span", "level-text");
    const lvlCol = el("div", "level-col");
    lvlCol.append(lvlBar, this.levelText);
    lvl.append(this.level, lvlCol);

    this.healthBox = el("div", "cargo health");
    this.healthBox.setAttribute("aria-label", "Health");
    const healthLabel = el("div", "cargo-label");
    healthLabel.append(el("span", undefined, "♥ Health"));
    this.healthText = el("span", "cargo-value", "100 / 100");
    healthLabel.append(this.healthText);
    const hbar = el("div", "cargo-bar");
    this.healthFill = el("div", "health-fill");
    hbar.append(this.healthFill);
    this.healthBox.append(healthLabel, hbar);

    this.cargoBox = el("div", "cargo");
    const cargoLabel = el("div", "cargo-label");
    cargoLabel.append(el("span", undefined, "Cargo"));
    this.cargoText = el("span", "cargo-value", "0 / 20");
    cargoLabel.append(this.cargoText);
    const bar = el("div", "cargo-bar");
    this.cargoFill = el("div", "cargo-fill");
    bar.append(this.cargoFill);
    this.cargoBox.append(cargoLabel, bar);
    const bars = el("div", "hud-bars");
    bars.append(this.healthBox, this.cargoBox);
    top.append(bio.root, gen.root, lvl, bars);

    // Objectives and hints flow under the HUD so they never overlap it as it wraps.
    const sub = el("div", "hud-sub");
    this.quests = el("div", "quests");
    this.quests.setAttribute("aria-live", "polite");
    this.hint = el("div", "hint");
    sub.append(this.quests, this.hint);
    top.append(sub);

    this.doorCard = el("div", "door-card hidden");
    this.doorCard.setAttribute("role", "region");
    this.doorTitle = el("h3");
    this.doorList = el("ul", "door-reqs");
    this.doorBtn = el("button", "btn btn-buy", "Unlock");
    this.doorBtn.addEventListener("click", () => {
      if (this.currentDoor) cb.onUnlockDoor(this.currentDoor);
    });
    this.doorCard.append(this.doorTitle, this.doorList, this.doorBtn);

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
    card.append(head, el("p", "panel-note", "Game paused. Spend banked resources; cargo must be deposited at base first."));
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
    const evo = el("section", "evo");
    evo.setAttribute("aria-label", "Evolution");
    const evoHead = el("div", "evo-head");
    evoHead.append(el("h3", undefined, "Evolution"));
    this.evoForm = el("span", "evo-form");
    evoHead.append(this.evoForm);
    this.evoNext = el("div", "evo-next");
    this.evoDesc = el("p", "evo-desc");
    this.evoList = el("ul", "door-reqs");
    this.evoBtn = el("button", "btn btn-evolve", "Evolve");
    this.evoBtn.addEventListener("click", () => cb.onEvolve());
    evo.append(evoHead, this.evoNext, this.evoDesc, this.evoList, this.evoBtn);
    card.append(evo);

    // Free respec, two-tap confirm, only at base.
    const respec = el("section", "respec");
    this.respecBtn = el("button", "btn btn-secondary", "Reset mutations");
    this.respecNote = el("p", "panel-note");
    this.respecBtn.addEventListener("click", () => {
      const now = performance.now();
      // The confirming tap must be deliberate: not part of a double-tap on the first.
      if (now < this.respecArmedUntil && now - this.respecArmedAt >= 400) {
        this.respecArmedUntil = 0;
        cb.onRespec();
      } else if (now >= this.respecArmedUntil) {
        this.respecArmedAt = now;
        this.respecArmedUntil = now + 3000;
        this.last = "";
        window.setTimeout(() => {
          this.last = "";
        }, 3100);
      }
      this.renderRespec();
    });
    respec.append(this.respecBtn, this.respecNote);
    card.append(respec);

    const settings = el("div", "panel-settings");
    const hand = el("button", "btn btn-secondary", "Swap button side");
    hand.addEventListener("click", () => cb.onToggleHand());
    settings.append(hand);
    card.append(settings);
    this.panel.append(card);

    this.toastEl = el("div", "toast hidden");
    this.toastEl.setAttribute("role", "status");
    this.overlay = el("div", "overlay hidden");
    this.vignette = el("div", "vignette");
    this.vignette.setAttribute("aria-hidden", "true");

    root.append(this.vignette, top, this.doorCard, this.upgradeBtn, this.panel, this.toastEl, this.overlay);
  }

  setLeftHanded(left: boolean): void {
    this.upgradeBtn.classList.toggle("left", left);
  }

  get upgradesOpen(): boolean {
    return !this.panel.classList.contains("hidden");
  }

  showUpgrades(open: boolean): void {
    this.panel.classList.toggle("hidden", !open);
    // Closing (or reopening) the panel always disarms a pending reset.
    this.respecArmedUntil = 0;
    this.last = "";
  }

  /** Messages queue so simultaneous events (quest + level-up) are all readable. */
  toast(msg: string, seconds = 2.5): void {
    this.toastQueue.push(msg);
    if (!this.toastBusy) this.nextToast(seconds);
  }

  private nextToast(seconds: number): void {
    const msg = this.toastQueue.shift();
    if (msg === undefined) {
      this.toastBusy = false;
      this.toastEl.classList.add("hidden");
      return;
    }
    this.toastBusy = true;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove("hidden");
    window.setTimeout(() => this.nextToast(seconds), seconds * 1000);
  }

  /** Brief red flash at the screen edges when the player takes damage. */
  flashDamage(): void {
    this.vignette.classList.remove("hit");
    // Force a reflow so the animation restarts on rapid hits.
    void this.vignette.offsetWidth;
    this.vignette.classList.add("hit");
  }

  /** Full-screen blocking message (e.g. game open in another tab). */
  block(title: string, body: string): void {
    this.overlay.replaceChildren(el("h2", undefined, title), el("p", undefined, body));
    this.overlay.classList.remove("hidden");
  }

  update(w: World, s: HudState): void {
    const p = w.progress;
    const cargo = cargoWeight(p.cargo);
    const cap = w.stats.cargoCapacity;
    const key = [
      p.banked.biomass, p.banked.genetic, p.xp, cargo, cap, s.respecBlocker, Math.ceil(p.player.health), w.stats.maxHealth, w.cargoFull, s.inBase, s.door?.id,
      this.upgradesOpen, JSON.stringify(p.quests), p.unlockedDoors.length, p.evolution, JSON.stringify(p.upgrades),
    ].join("|");
    if (key === this.last) return;
    this.last = key;

    this.biomass.textContent = fmt(Math.floor(p.banked.biomass));
    this.genetic.textContent = fmt(Math.floor(p.banked.genetic));
    // Genetic material appears once it matters, to keep the first minutes uncluttered.
    this.geneticChip.classList.toggle("hidden", p.banked.genetic === 0 && p.unlockedDoors.length === 0);

    const lp = levelProgress(p.xp);
    this.level.textContent = `Lv ${lp.level}`;
    this.levelFill.style.width = lp.span === null ? "100%" : `${(lp.into / lp.span) * 100}%`;
    this.levelText.textContent = lp.span === null ? "Max level" : `${fmt(lp.into)} / ${lp.span} XP`;

    const hp = Math.ceil(p.player.health);
    const maxHp = w.stats.maxHealth;
    const low = hp <= maxHp * 0.3;
    this.healthText.textContent = low ? `LOW ${hp} / ${maxHp}` : `${hp} / ${maxHp}`;
    this.healthFill.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
    this.healthBox.classList.toggle("low", low);
    this.vignette.classList.toggle("low", low);

    this.cargoText.textContent = `${fmt(cargo)} / ${fmt(cap)}`;
    this.cargoFill.style.width = `${Math.min(100, (cargo / cap) * 100)}%`;
    this.cargoBox.classList.toggle("full", w.cargoFull);

    this.renderQuests(w);
    this.renderDoor(w, s.door);

    let hint = "";
    if (w.cargoFull && !s.inBase) hint = "Cargo full — return to base ▼";
    else if (s.inBase && cargo > 0) hint = "Depositing…";
    else if (p.xp === 0) hint = "Move near workers to capture them";
    this.hint.textContent = hint;
    this.hint.classList.toggle("hidden", hint === "");
    this.hint.classList.toggle("warn", w.cargoFull && !s.inBase);

    let affordable = false;
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const row = this.rows.get(id)!;
      const lvl = p.upgrades[id];
      const cost = nextCost(p, id);
      const cur = upgradeValue(p, id);
      const next = upgradeValue(p, id, lvl + 1);
      row.level.textContent = ` Lv ${lvl}/${maxLevel(p, id)}`;
      row.value.textContent = cost === null
        ? `${fmt(cur)}${def.unit} (max)`
        : `${fmt(cur)}${def.unit} → ${fmt(next)}${def.unit}`;
      if (cost === null) {
        row.buy.textContent = cappedByEvolution(p, id) ? "Evolve to raise cap" : "Maxed";
        row.buy.disabled = true;
      } else {
        const can = p.banked[def.currency] >= cost;
        affordable ||= can;
        row.buy.textContent = `Buy · ${cost} ${CURRENCY_ICON[def.currency]}`;
        row.buy.disabled = !can;
        row.buy.setAttribute("aria-label", `Buy ${def.name} for ${cost} ${CURRENCY_LABEL[def.currency].toLowerCase()}`);
      }
    }
    this.respecBlocker = s.respecBlocker;
    this.renderRespec();
    const evoReady = this.renderEvolution(w);
    affordable ||= evoReady;
    this.upgradeBtn.classList.toggle("ready", affordable);
    this.upgradeBtn.textContent = affordable ? "Upgrades ●" : "Upgrades";
  }

  private renderQuests(w: World): void {
    const active = activeQuests(w.progress).slice(0, 3);
    this.quests.classList.toggle("hidden", active.length === 0);
    this.quests.replaceChildren(
      el("div", "quests-title", "Objectives"),
      ...active.map((q) => {
        const row = el("div", "quest");
        const target = goalTarget(q.goal);
        row.append(el("span", "quest-name", q.title));
        if (target > 1) row.append(el("span", "quest-count", `${fmt(Math.floor(questCount(w.progress, q.id)))} / ${target}`));
        return row;
      }),
    );
  }

  private renderRespec(): void {
    const blocked = this.respecBlocker;
    if (blocked) this.respecArmedUntil = 0;
    const armed = performance.now() < this.respecArmedUntil;
    this.respecBtn.disabled = blocked !== null;
    this.respecBtn.textContent = armed ? "Tap again to reset all mutations" : "Reset mutations (free, full refund)";
    this.respecBtn.classList.toggle("armed", armed);
    this.respecNote.textContent =
      blocked === "notAtBase" ? "Available while standing at the base."
      : blocked === "cargoAboard" ? "Deposit your cargo first."
      : "Refunds everything paid for current mutations. Evolution is kept.";
  }

  /** Returns true when the player can evolve right now. */
  private renderEvolution(w: World): boolean {
    const p = w.progress;
    this.evoForm.textContent = `Current: ${FORM_NAMES[p.evolution] ?? "Unknown"}`;
    const next = nextEvolution(p);
    if (!next) {
      this.evoNext.textContent = "Final form reached";
      this.evoDesc.textContent = "";
      this.evoList.replaceChildren();
      this.evoBtn.classList.add("hidden");
      return false;
    }
    this.evoBtn.classList.remove("hidden");
    this.evoNext.textContent = `Next: ${next.name}`;
    this.evoDesc.textContent = next.description;
    const reqs = evolutionRequirements(p);
    requirementList(this.evoList, reqs);
    const ready = reqs.every((r) => r.met);
    this.evoBtn.disabled = !ready;
    this.evoBtn.textContent = ready ? `Evolve into ${next.name}` : "Requirements not met";
    return ready;
  }

  private renderDoor(w: World, door: DoorDef | null): void {
    this.currentDoor = door;
    this.doorCard.classList.toggle("hidden", door === null);
    if (!door) return;
    const reqs = doorRequirements(w.progress, door);
    this.doorTitle.textContent = `${door.name} — locked`;
    this.doorCard.setAttribute("aria-label", `${door.name} requirements`);
    requirementList(this.doorList, reqs);
    const ready = reqs.every((r) => r.met);
    this.doorBtn.disabled = !ready;
    this.doorBtn.textContent = ready ? "Unlock" : "Requirements not met";
  }
}
