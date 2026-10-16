import { zoneAt, type DoorDef } from "../content/map";
import { goalTarget } from "../content/quests";
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from "../content/upgrades";
import { doorRequirements } from "../domain/doors";
import { FORM_NAMES } from "../content/evolution";
import { CHOICES_PER_LEVEL, PERKS } from "../content/perks";
import { CATCHER, DRONE, OUTPOST, REFINERY, VAT } from "../content/structures";

import { catcherLevel, droneCapacity, nextStep, refineryIdle, refineryInput, refineryLevel, stepRequirements, STRUCTURE_KINDS, vatLevel, type StructureKind } from "../domain/structures";
import { describePerk, isLegal, perkStacks } from "../domain/perks";
import { CURRENCY_LABEL, LATE_CURRENCIES, type Currency } from "../content/currencies";
import { canAfford, capRaise, maxLevel, nextCost, nextExtraCost, upgradePrice, upgradeValue } from "../domain/economy";
import { evolutionRequirements, nextEvolution } from "../domain/evolution";
import type { Requirement } from "../domain/requirements";
import { levelProgress } from "../domain/levels";
import { cargoWeight } from "../domain/progress";
import { activeQuests, questCount } from "../domain/quests";
import type { TargetEntity, World } from "../game/world";
import { reactorRequirements, summonRequirements } from "../domain/reactor";
import { clearRequirements, nextBiome } from "../domain/biome";
import { BOOSTS, FRENZY, SUMMON, type BoostId } from "../content/feeding";
import { COLD } from "../content/cold";
import { stormReachCut } from "../game/systems/storm";
import { MUTAGEN, MUTAGEN_IDS, type MutagenId } from "../content/mutagen";
import { TARGETS, type TargetTypeId } from "../content/targets";
import { BESTIARY_MILESTONES, inBestiary, milestonesReached } from "../domain/bestiary";
import { describeCraving } from "../domain/cravings";
import { mutagenLevel, nextMutagenCost } from "../domain/mutagen";
import { MAX_IMPORT_BYTES, type SaveSummary } from "../persistence/transfer";

export function structureName(kind: StructureKind): string {
  return { vat: VAT.name, drone: DRONE.name, refinery: REFINERY.name, catcher: CATCHER.name, outpost: OUTPOST.name }[kind];
}

/** Distinct shapes per currency, so cost labels don't rely on colour. */
export const CURRENCY_ICON: Record<Currency, string> = { biomass: "◆", genetic: "✦", parts: "⬢", mutagen: "✺", crystals: "❄", alloy: "▰", amber: "◈", shards: "◬", pearls: "◉", glass: "✹", spores: "✿", moonstone: "☾", bogiron: "▣", silk: "≈" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Wallet chips stay narrow at any depth: 12345 → "12.3k", then M, B, T, then e-notation. */
export function compact(n: number): string {
  const v = Math.floor(n);
  if (v < 10000) return String(v);
  const units: Array<[number, string]> = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]];
  if (v >= 1e15) return v.toExponential(1).replace("+", "");
  for (const [size, unit] of units) {
    if (v < size) continue;
    const x = v / size;
    return `${x < 100 ? Math.floor(x * 10) / 10 : Math.floor(x)}${unit}`;
  }
  return String(v);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Only values the structures UI shows; never the vat timer or drone position, which change every tick. */
function structureKey(w: World): string {
  const { vat, drone, refinery, catcher, outpost } = w.progress.structures;
  const k = w.catcher;
  return [
    vat.built, vat.level, vat.stock, drone.built, drone.level, cargoWeight(drone.cargo), w.droneMode, w.stats.farmRate,
    refinery.built, refinery.level, refinery.stock, refinery.running,
    catcher.built, catcher.level, cargoWeight(catcher.cargo), k.mode, outpost.built,
  ].join(",");
}

/** Wallet order. Machine parts and alloy only ever show in costs, never in the wallet. */
const WALLET_ORDER: Currency[] = ["biomass", "genetic", "crystals", "amber", "shards", "pearls", ...LATE_CURRENCIES, "mutagen"];

const OBJECTIVES_PREF = "alien-harvester.hud.objectivesOpen";

/** The player's own choice to keep the objectives open or closed on this device, if any. */
function readObjectivesPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(OBJECTIVES_PREF);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeObjectivesPref(open: boolean): void {
  try {
    window.localStorage.setItem(OBJECTIVES_PREF, open ? "1" : "0");
  } catch {
    // Storage blocked: the panel still works, it just isn't remembered.
  }
}

/** What the feeding meter and hints show; changes trigger a HUD redraw. */
function feedKey(w: World): string {
  const f = w.feeding;
  const boosts = Object.entries(f.boosts).map(([id, left]) => `${id}${Math.ceil(left ?? 0)}`).join("");
  return [f.combo, Math.ceil(f.frenzy), Math.ceil(f.prizedLeft), w.targets.some((t) => t.prized && t.held), w.targets.some((t) => t.prized), boosts].join(",");
}

export interface HudCallbacks {
  onOpenUpgrades(): void;
  onCloseUpgrades(): void;
  onBuy(id: UpgradeId): void;
  onToggleHand(): void;
  onUnlockDoor(door: DoorDef): void;
  onEvolve(): void;
  onRespec(): void;
  onBuildStructure(kind: StructureKind): void;
  onRepair(): void;
  /** Feed the finished objective machine for a reward wave. */
  onSummon(): void;
  onBuyMutagen(id: MutagenId): void;
  /** Take the way on (elevator or portal) to the next biome. */
  onLeaveBiome(): void;
  onExportDownload(): void;
  onExportCopy(): void;
  /** Validate text (from a file or paste); the HUD then shows a preview or an error. */
  onImportText(text: string): void;
  /** A file couldn't be used before reading its text (too big, or unreadable). */
  onImportRejected(reason: "tooLarge" | "unreadable"): void;
  onImportConfirm(): void;
  onCloseCompletion(): void;
  onOpenPerks(): void;
  onClosePerks(): void;
  /** Pick an option of the pending choice for `level`, or the fallback. */
  onPickPerk(level: number, option: number | "fallback"): void;
}

/** Creatures here pay hive amber (so the amber chip and Chitin plating are worth showing). */
function worldHasAmber(w: World): boolean {
  return worldPays(w, "amber");
}

/** Creatures on this floor pay this currency. */
function worldPays(w: World, c: Currency): boolean {
  return w.map.spawns.some((s) => (w.biome.targets[s.type].reward[c] ?? 0) > 0);
}

/** A helper's badge: its name and load, busy or idle, the full status for hover and screen readers. */
function helperBadge(badge: HTMLElement, name: string, load: string, status: string, busy: boolean): void {
  badge.textContent = `${name} ${load}`;
  badge.classList.toggle("busy", busy);
  badge.title = `${name}: ${status} (${load})`;
  badge.setAttribute("aria-label", badge.title);
}

/** Matters on this floor: its creatures pay it (or, for crystals, it has freezing rooms). */
function floorCurrency(w: World, c: Currency): boolean {
  return c === "biomass" || worldPays(w, c) || (c === "crystals" && w.map.zones.some((z) => z.cold));
}

/** Earned or useful by now. Each currency appears where it first matters, and stays once earned. */
function walletShows(w: World, c: Currency): boolean {
  const p = w.progress;
  if (c === "biomass" || p.banked[c] > 0) return true;
  // Genetic material waits for the first door, to keep the first minutes uncluttered.
  if (c === "genetic") return p.unlockedDoors.length > 0;
  if (c === "mutagen") return Object.keys(p.mutagenLevels).length > 0;
  return floorCurrency(w, c);
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
  /** On a pad (the base or a forward base): the hold banks here. */
  inBase: boolean;
  /** Locked door the player is standing next to. */
  door: DoorDef | null;
  /** Why a respec isn't allowed right now, or null if it is. */
  respecBlocker: "notAtBase" | "cargoAboard" | null;
  /** The warden, when the player is in its hall and it is alive. */
  boss: TargetEntity | null;
  /** Standing at the reactor console. */
  atReactor: boolean;
  /** Standing at the biome's way on (elevator or portal). */
  atExit: boolean;
}

export interface CompletionStats {
  title: string;
  body: string;
  level: number;
  form: string;
  playSeconds: number;
  questsDone: number;
  questsTotal: number;
  perksTaken: number;
}

export class Hud {
  /** Wallet: this floor's currencies inline, every earned currency one tap away. */
  private walletBox: HTMLElement;
  private walletBtn: HTMLButtonElement;
  private walletMain: HTMLElement;
  private walletCount: HTMLElement;
  private walletMore: HTMLElement;
  private coins = new Map<Currency, { mini: HTMLElement; miniValue: HTMLElement; full: HTMLElement; fullValue: HTMLElement }>();
  /** Phones fit two currencies inline, wider screens four. */
  private narrow = window.matchMedia("(max-width: 420px)");
  private stormBox: HTMLElement;
  private stormText: HTMLElement;
  private stormFill: HTMLElement;
  private feedBox: HTMLElement;
  private feedText: HTMLElement;
  private feedFill: HTMLElement;
  private mutagenRows = new Map<MutagenId, { level: HTMLElement; buy: HTMLButtonElement }>();
  private bestiaryList: HTMLElement;
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
  private questDetails: HTMLDetailsElement;
  private questLine: HTMLElement;
  private questBody: HTMLElement;
  private doorCard: HTMLElement;
  private doorTitle: HTMLElement;
  private doorList: HTMLElement;
  private doorBtn: HTMLButtonElement;
  private currentDoor: DoorDef | null = null;
  private upgradeBtn: HTMLButtonElement;
  private perkBtn: HTMLButtonElement;
  private perkPanel: HTMLElement;
  private perkTitle: HTMLElement;
  private perkCards: HTMLElement;
  private perkFallback: HTMLButtonElement;
  private perkCb: Pick<HudCallbacks, "onPickPerk">;
  /** Choice the cards currently show, and when they appeared (guards against double-taps). */
  private perkShownLevel = 0;
  private perkShownAt = 0;
  private panel: HTMLElement;
  private rows = new Map<UpgradeId, { root: HTMLElement; level: HTMLElement; value: HTMLElement; buy: HTMLButtonElement }>();
  private evoForm: HTMLElement;
  private evoNext: HTMLElement;
  private evoDesc: HTMLElement;
  private evoList: HTMLElement;
  private evoBtn: HTMLButtonElement;
  private structureRows = new Map<StructureKind, { root: HTMLElement; status: HTMLElement; reqs: HTMLElement; btn: HTMLButtonElement }>();
  private droneBadge: HTMLElement;
  private catcherBadge: HTMLElement;
  private catcherText = "";
  private bossBar: HTMLElement;
  private bossFill: HTMLElement;
  private bossState: HTMLElement;
  private bossName: HTMLElement;
  private chillBox: HTMLElement;
  private chillText: HTMLElement;
  private chillFill: HTMLElement;
  private reactorCard: HTMLElement;
  private reactorList: HTMLElement;
  private reactorBtn: HTMLButtonElement;
  private reactorNote: HTMLElement;
  /** Once the objective is done, the card's button summons reward waves. */
  private reactorSummons = false;
  private exitCard: HTMLElement;
  private exitTitle: HTMLElement;
  private exitNote: HTMLElement;
  private exitList: HTMLElement;
  private exitBtn: HTMLButtonElement;
  private exitNeedsConfirm = false;
  private exitArmedAt = 0;
  private completionTitle: HTMLElement;
  private completionBody: HTMLElement;
  private reactorTitle: HTMLElement;
  private completion: HTMLElement;
  private importPreview: HTMLElement;
  private importText: HTMLTextAreaElement;
  private importConfirm: HTMLButtonElement;
  private importArmedAt = 0;
  private completionStats: HTMLElement;
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
    // Top HUD: a compact status card (level, health, cargo) and the objective line on the
    // left; the wallet and helper badges on the right. The middle stays open for play.
    const top = el("div", "hud-top");

    const status = el("div", "hud-status");
    const lvlRow = el("div", "level-row");
    this.level = el("span", "level-badge", "Lv 1");
    const lvlBar = el("div", "level-bar");
    this.levelFill = el("div", "level-fill");
    lvlBar.append(this.levelFill);
    this.levelText = el("span", "level-text");
    lvlRow.append(this.level, lvlBar, this.levelText);

    this.healthBox = el("div", "meter health");
    this.healthBox.setAttribute("aria-label", "Health");
    const healthLabel = el("div", "meter-label");
    const healthName = el("span", "meter-name");
    healthName.append(el("span", "meter-icon", "♥"), el("span", "meter-word", " Health"));
    this.healthText = el("span", "meter-value", "100 / 100");
    healthLabel.append(healthName, this.healthText);
    const hbar = el("div", "cargo-bar");
    this.healthFill = el("div", "health-fill");
    hbar.append(this.healthFill);
    this.healthBox.append(healthLabel, hbar);

    this.cargoBox = el("div", "meter cargo-meter");
    this.cargoBox.setAttribute("aria-label", "Cargo");
    const cargoLabel = el("div", "meter-label");
    cargoLabel.append(el("span", "meter-name", "Cargo"));
    this.cargoText = el("span", "meter-value", "0 / 20");
    cargoLabel.append(this.cargoText);
    const bar = el("div", "cargo-bar");
    this.cargoFill = el("div", "cargo-fill");
    bar.append(this.cargoFill);
    this.cargoBox.append(cargoLabel, bar);
    const bars = el("div", "hud-bars");
    bars.append(this.healthBox, this.cargoBox);
    status.append(lvlRow, bars);

    // Wallet: the button shows this floor's currencies; tapping it lists every one earned.
    this.walletBox = el("div", "hud-wallet");
    this.walletBtn = el("button", "wallet-btn");
    this.walletBtn.type = "button";
    this.walletBtn.setAttribute("aria-expanded", "false");
    this.walletBtn.setAttribute("aria-controls", "wallet-more");
    this.walletMain = el("span", "wallet-main");
    this.walletCount = el("span", "wallet-count");
    this.walletBtn.append(this.walletMain, this.walletCount);
    this.walletMore = el("div", "wallet-more hidden");
    this.walletMore.id = "wallet-more";
    this.walletMore.setAttribute("role", "group");
    this.walletMore.setAttribute("aria-label", "All currencies");
    for (const c of WALLET_ORDER) {
      const mini = el("span", "coin");
      const miniValue = el("span", "coin-value", "0");
      mini.append(el("span", `chip-icon ${c}`, CURRENCY_ICON[c]), miniValue);
      mini.title = CURRENCY_LABEL[c];
      const full = el("div", "coin-row");
      const fullValue = el("span", "coin-value", "0");
      full.append(el("span", `chip-icon ${c}`, CURRENCY_ICON[c]), el("span", "coin-label", CURRENCY_LABEL[c]), fullValue);
      this.coins.set(c, { mini, miniValue, full, fullValue });
    }
    this.walletBtn.addEventListener("click", () => this.setWalletOpen(this.walletMore.classList.contains("hidden")));
    // A tap anywhere else closes the list, so it never lingers over the world.
    document.addEventListener("pointerdown", (e) => {
      if (!this.walletBox.contains(e.target as Node)) this.setWalletOpen(false);
    }, true);
    this.narrow.addEventListener("change", () => (this.last = ""));
    this.walletBox.append(this.walletBtn, this.walletMore);

    // Helpers working for you: one short badge each, the full sentence on hover and for screen readers.
    this.droneBadge = el("div", "helper-badge hidden");
    this.catcherBadge = el("div", "helper-badge hidden");
    const badges = el("div", "hud-badges");
    badges.append(this.droneBadge, this.catcherBadge);
    const side = el("div", "hud-side");
    side.append(this.walletBox, badges);

    // Combo toward a feeding frenzy, or the frenzy itself.
    this.feedBox = el("div", "feed-meter hidden");
    this.feedBox.setAttribute("role", "status");
    this.feedText = el("span", "feed-text");
    const feedBar = el("div", "cargo-bar");
    this.feedFill = el("div", "feed-fill");
    feedBar.append(this.feedFill);
    this.feedBox.append(this.feedText, feedBar);
    // Chill in freezing rooms: how cold, and what it's costing.
    this.chillBox = el("div", "feed-meter chill-meter hidden");
    this.chillBox.setAttribute("role", "status");
    this.chillText = el("span", "feed-text");
    const chillBar = el("div", "cargo-bar");
    this.chillFill = el("div", "chill-fill");
    chillBar.append(this.chillFill);
    this.chillBox.append(this.chillText, chillBar);
    this.stormBox = el("div", "feed-meter storm-meter hidden");
    this.stormBox.setAttribute("role", "status");
    this.stormText = el("span", "feed-text");
    const stormBar = el("div", "cargo-bar");
    this.stormFill = el("div", "storm-fill");
    stormBar.append(this.stormFill);
    this.stormBox.append(this.stormText, stormBar);

    // Objective: one line (floor, next step, open cravings) that expands to the full list.
    // Starts open on wide screens and closed on phones; a choice the player makes is remembered.
    const sub = el("div", "hud-sub");
    this.questDetails = el("details", "quests");
    this.questLine = el("summary", "quest-line");
    this.questBody = el("div", "quest-body");
    this.questBody.setAttribute("aria-live", "polite");
    this.questDetails.append(this.questLine, this.questBody);
    const phone = window.matchMedia("(max-width: 759px)");
    const saved = readObjectivesPref();
    this.questDetails.open = saved ?? !phone.matches;
    phone.addEventListener("change", (event) => {
      if (readObjectivesPref() === null) this.questDetails.open = !event.matches;
    });
    this.questLine.addEventListener("click", () => writeObjectivesPref(!this.questDetails.open));
    this.hint = el("div", "hint");
    sub.append(this.questDetails, this.feedBox, this.chillBox, this.stormBox, this.hint);
    top.append(status, side, sub);

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

    // Warden capture bar: progress plus a text state (not colour alone).
    this.bossBar = el("div", "boss-bar hidden");
    this.bossBar.setAttribute("role", "status");
    const bossHead = el("div", "boss-head");
    this.bossName = el("span", "boss-name");
    bossHead.append(this.bossName);
    this.bossState = el("span", "boss-state");
    bossHead.append(this.bossState);
    const bossTrack = el("div", "cargo-bar");
    this.bossFill = el("div", "boss-fill");
    bossTrack.append(this.bossFill);
    this.bossBar.append(bossHead, bossTrack);

    // Reactor console card (like a door card).
    this.reactorCard = el("div", "door-card reactor-card hidden");
    this.reactorTitle = el("h3", undefined, "Reactor console");
    this.reactorList = el("ul", "door-reqs");
    this.reactorBtn = el("button", "btn btn-buy", "Repair the reactor");
    this.reactorBtn.addEventListener("click", () => (this.reactorSummons ? cb.onSummon() : cb.onRepair()));
    this.reactorNote = el("p", "exit-note hidden");
    this.reactorCard.append(this.reactorTitle, this.reactorNote, this.reactorList, this.reactorBtn);

    // The way on (elevator or portal): what's still needed, or where it leads.
    this.exitCard = el("div", "door-card exit-card hidden");
    this.exitCard.setAttribute("role", "region");
    this.exitTitle = el("h3");
    this.exitNote = el("p", "exit-note");
    this.exitList = el("ul", "door-reqs");
    this.exitBtn = el("button", "btn btn-buy");
    this.exitBtn.addEventListener("click", () => {
      // Leaving with a summoned wave still roaming forfeits it: two deliberate taps.
      const now = performance.now();
      if (!this.exitNeedsConfirm || (this.exitArmedAt && now - this.exitArmedAt >= 400 && now - this.exitArmedAt < 4000)) {
        this.exitArmedAt = 0;
        cb.onLeaveBiome();
      } else {
        this.exitArmedAt = now;
        this.exitBtn.textContent = "Tap again to leave the wave behind";
      }
    });
    this.exitCard.append(this.exitTitle, this.exitNote, this.exitList, this.exitBtn);

    // Objective-complete screen (the reactor in the facility).
    this.completion = el("div", "panel completion hidden");
    this.completion.setAttribute("role", "dialog");
    this.completion.setAttribute("aria-label", "Objective complete");
    const cc = el("div", "panel-card");
    this.completionTitle = el("h2");
    this.completionBody = el("p", "panel-note");
    cc.append(this.completionTitle, this.completionBody);
    this.completionStats = el("dl", "completion-stats");
    const keep = el("button", "btn btn-buy", "Keep playing");
    keep.addEventListener("click", () => cb.onCloseCompletion());
    cc.append(this.completionStats, keep);
    this.completion.append(cc);

    // Level-up perks: opened deliberately (never auto-popped mid-fight), and pausing while open.
    this.perkCb = cb;
    this.perkBtn = el("button", "btn btn-perk hidden", "Perk ready");
    this.perkBtn.addEventListener("click", () => cb.onOpenPerks());
    this.perkPanel = el("div", "panel perk-panel hidden");
    this.perkPanel.setAttribute("role", "dialog");
    this.perkPanel.setAttribute("aria-label", "Choose a perk");
    const perkCard = el("div", "panel-card");
    const perkHead = el("div", "panel-head");
    this.perkTitle = el("h2", undefined, "Choose a perk");
    const perkClose = el("button", "btn btn-close", "Later");
    perkClose.addEventListener("click", () => cb.onClosePerks());
    perkHead.append(this.perkTitle, perkClose);
    this.perkCards = el("div", "perk-cards");
    this.perkFallback = el("button", "btn btn-buy hidden", "Take a biomass cache instead");
    this.perkFallback.addEventListener("click", () => this.pick("fallback"));
    perkCard.append(perkHead, el("p", "panel-note", "Game paused. Choices are fixed when you level up."), this.perkCards, this.perkFallback);
    this.perkPanel.append(perkCard);

    this.panel = el("div", "panel hidden");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Upgrades");
    const card = el("div", "panel-card upgrade-card");
    const head = el("div", "panel-head");
    const panelTitle = el("h2", undefined, "Mutations");
    head.append(panelTitle);
    const close = el("button", "btn btn-close", "Close");
    close.addEventListener("click", () => cb.onCloseUpgrades());
    head.append(close);
    card.append(head, el("p", "panel-note", "Game paused. Spend banked resources; cargo must be deposited at base first."));
    const navigation = el("nav", "panel-nav");
    navigation.setAttribute("aria-label", "Upgrade categories");
    const mutationsPage = el("div", "upgrade-page");
    const structuresPage = el("div", "upgrade-page hidden");
    const researchPage = el("div", "upgrade-page hidden");
    const settingsPage = el("div", "upgrade-page hidden");
    const pages = [mutationsPage, structuresPage, researchPage, settingsPage];
    const categories = ["Mutations", "Structures", "Research", "Settings"];
    const categoryButtons = categories.map((name, index) => {
      const button = el("button", "btn category-btn", name);
      button.type = "button";
      button.setAttribute("aria-pressed", String(index === 0));
      button.addEventListener("click", () => {
        pages.forEach((page, i) => {
          page.classList.toggle("hidden", i !== index);
          if (i === index) page.scrollTop = 0;
        });
        categoryButtons.forEach((item, i) => item.setAttribute("aria-pressed", String(i === index)));
        panelTitle.textContent = name;
      });
      return button;
    });
    navigation.append(...categoryButtons);
    card.append(navigation, ...pages);
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
      mutationsPage.append(row);
      this.rows.set(id, { root: row, level, value, buy });
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
    mutationsPage.append(evo);

    // Structures: build and upgrade the vat and the drone.
    const structures = el("section", "structures");
    structures.setAttribute("aria-label", "Structures");
    structures.append(el("h3", undefined, "Structures"));
    for (const kind of STRUCTURE_KINDS) {
      const row = el("div", "structure-row");
      const name = el("div", "up-name", structureName(kind));
      const status = el("div", "up-value");
      const reqs = el("ul", "door-reqs");
      const btn = el("button", "btn btn-buy");
      btn.addEventListener("click", () => cb.onBuildStructure(kind));
      row.append(name, status, reqs, btn);
      structures.append(row);
      this.structureRows.set(kind, { root: row, status, reqs, btn });
    }
    structuresPage.append(structures);

    // Mutagen mutations: tune the loop (paid in mutagen from cravings, prized specimens, the bestiary).
    const mutagenSection = el("section", "structures mutagen");
    mutagenSection.setAttribute("aria-label", "Mutagen mutations");
    mutagenSection.append(el("h3", undefined, "Mutagen mutations"), el("p", "panel-note", "Earned from cravings, prized specimens and the bestiary. Kept when you reset mutations."));
    for (const id of MUTAGEN_IDS) {
      const def = MUTAGEN[id];
      const row = el("div", "up-row");
      const info = el("div", "up-info");
      const name = el("div", "up-name", def.name);
      const level = el("span", "up-level");
      name.append(level);
      info.append(name, el("div", "up-value", def.perLevel));
      const buy = el("button", "btn btn-buy");
      buy.addEventListener("click", () => cb.onBuyMutagen(id));
      row.append(info, buy);
      mutagenSection.append(row);
      this.mutagenRows.set(id, { level, buy });
    }
    researchPage.append(mutagenSection);

    // Bestiary: lifetime captures per creature, with milestones.
    const bestiary = el("section", "structures bestiary");
    bestiary.setAttribute("aria-label", "Bestiary");
    bestiary.append(el("h3", undefined, "Bestiary"), el("p", "panel-note", `Milestones at ${BESTIARY_MILESTONES.map((m) => m.count).join(", ")} captures pay mutagen and add 1% capture power each.`));
    this.bestiaryList = el("ul", "bestiary-list");
    bestiary.append(this.bestiaryList);
    researchPage.append(bestiary);

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
    mutationsPage.append(respec);

    // Save data: export (download or copy) and import (file or paste), with a preview before replacing.
    const data = el("section", "save-data");
    data.setAttribute("aria-label", "Save data");
    data.append(el("h3", undefined, "Save data"), el("p", "panel-note", "Keep a copy of your progress, or move it to another device."));
    const exportRow = el("div", "save-row");
    const download = el("button", "btn btn-secondary", "Download save file");
    download.addEventListener("click", () => cb.onExportDownload());
    const copy = el("button", "btn btn-secondary", "Copy save text");
    copy.addEventListener("click", () => cb.onExportCopy());
    exportRow.append(download, copy);
    const importRow = el("div", "save-row");
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json,text/plain";
    fileInput.className = "visually-hidden";
    fileInput.setAttribute("aria-label", "Choose a save file");
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      // Reject huge files before reading them into memory.
      if (file.size > MAX_IMPORT_BYTES) {
        cb.onImportRejected("tooLarge");
        return;
      }
      file.text().then((t) => cb.onImportText(t), () => cb.onImportRejected("unreadable"));
    });
    const chooseFile = el("button", "btn btn-secondary", "Import from file");
    chooseFile.addEventListener("click", () => fileInput.click());
    const pasteToggle = el("button", "btn btn-secondary", "Paste save text");
    this.importText = el("textarea", "import-text hidden");
    this.importText.setAttribute("aria-label", "Paste save text");
    this.importText.placeholder = "Paste exported save text here";
    const checkPaste = el("button", "btn btn-secondary hidden", "Check pasted save");
    pasteToggle.addEventListener("click", () => {
      const show = this.importText.classList.toggle("hidden") === false;
      checkPaste.classList.toggle("hidden", !show);
      if (show) this.importText.focus();
    });
    checkPaste.addEventListener("click", () => cb.onImportText(this.importText.value));
    importRow.append(chooseFile, pasteToggle);
    this.importPreview = el("div", "import-preview hidden");
    this.importPreview.setAttribute("role", "status");
    this.importConfirm = el("button", "btn btn-danger hidden", "Replace current progress");
    this.importConfirm.addEventListener("click", () => {
      // Two deliberate taps, and never a double-tap: replacing progress is serious.
      const now = performance.now();
      if (this.importArmedAt && now - this.importArmedAt >= 400 && now - this.importArmedAt < 4000) {
        this.importArmedAt = 0;
        cb.onImportConfirm();
      } else {
        this.importArmedAt = now;
        this.importConfirm.textContent = "Tap again to replace your progress";
      }
    });
    data.append(exportRow, importRow, fileInput, this.importText, checkPaste, this.importPreview, this.importConfirm);
    settingsPage.append(data);

    const settings = el("div", "panel-settings");
    const hand = el("button", "btn btn-secondary", "Swap button side");
    hand.addEventListener("click", () => cb.onToggleHand());
    settings.append(hand);
    settingsPage.append(settings);
    this.panel.append(card);

    this.toastEl = el("div", "toast hidden");
    this.toastEl.setAttribute("role", "status");
    this.overlay = el("div", "overlay hidden");
    this.vignette = el("div", "vignette");
    this.vignette.setAttribute("aria-hidden", "true");

    root.append(this.vignette, top, this.bossBar, this.reactorCard, this.exitCard, this.completion, this.doorCard, this.upgradeBtn, this.perkBtn, this.perkPanel, this.panel, this.toastEl, this.overlay);
  }

  setLeftHanded(left: boolean): void {
    this.upgradeBtn.classList.toggle("left", left);
    this.perkBtn.classList.toggle("left", left);
  }

  get perksOpen(): boolean {
    return !this.perkPanel.classList.contains("hidden");
  }

  showPerks(open: boolean): void {
    this.perkPanel.classList.toggle("hidden", !open);
    this.last = "";
  }

  get upgradesOpen(): boolean {
    return !this.panel.classList.contains("hidden");
  }

  showUpgrades(open: boolean): void {
    this.panel.classList.toggle("hidden", !open);
    // A half-finished import never survives closing the panel.
    if (!open) this.showImportPreview(null);
    // Closing (or reopening) the panel always disarms a pending reset.
    this.respecArmedUntil = 0;
    this.last = "";
  }

  /** Messages queue so simultaneous events (quest + level-up) are all readable. */
  toast(msg: string, seconds = 2.5): void {
    this.toastQueue.push(msg);
    if (!this.toastBusy) this.nextToast(seconds);
  }

  /** Routine news (a helper banked its load): shown briefly when nothing else is, otherwise dropped. */
  notice(msg: string): void {
    if (!this.toastBusy) this.toast(msg, 1.6);
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
    this.renderCatcher(w);
    const cargo = cargoWeight(p.cargo);
    const cap = w.stats.cargoCapacity;
    const key = [
      p.banked.biomass, p.banked.genetic, p.banked.parts, p.banked.mutagen, p.banked.crystals, p.banked.alloy, p.banked.amber, p.banked.shards, p.banked.pearls, ...LATE_CURRENCIES.map((c) => p.banked[c]), w.chillApplied, w.storm.phase, w.stormApplied, Math.round(w.storm.intensity * 10), feedKey(w), JSON.stringify(p.cravings), JSON.stringify(p.mutagenLevels), JSON.stringify(p.bestiary), p.xp, cargo, cap, s.atReactor, s.atExit, p.depth, p.reactorRepaired, p.summon.left,
      s.boss ? `${Math.round(s.boss.progress * 100)}:${s.boss.boss?.state}` : "", s.respecBlocker, Math.ceil(p.player.health), w.stats.maxHealth, w.cargoFull, s.inBase, s.door?.id,
      this.upgradesOpen, this.perksOpen, structureKey(w), JSON.stringify(p.pendingPerks), JSON.stringify(p.perks), JSON.stringify(p.quests), p.unlockedDoors.length, p.evolution, JSON.stringify(p.upgrades),
    ].join("|");
    if (key === this.last) return;
    this.last = key;

    this.renderWallet(w);
    this.renderFeeding(w);
    this.renderChill(w);
    this.renderStorm(w);
    this.renderMutagen(w);
    this.renderBestiary(w);

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
    this.renderBoss(s.boss);
    this.renderReactor(w, s.atReactor);
    this.renderExit(w, s.atExit);
    this.renderStructures(w);
    this.renderPerks(w);
    this.renderDoor(w, s.door);

    let hint = "";
    const prized = w.targets.find((t) => t.prized);
    const boosts = (Object.entries(w.feeding.boosts) as Array<[BoostId, number]>).map(([id, left]) => `${BOOSTS[id].name} ${Math.ceil(left)}s`);
    if (w.cargoFull && !s.inBase) hint = "Cargo full — return to base ▼";
    else if (prized) hint = prized.held ? `★ Prized ${prized.def.name.toLowerCase()} in your grip — hold on!` : `★ A prized ${prized.def.name.toLowerCase()} is loose! ${Math.ceil(w.feeding.prizedLeft)}s`;
    else if (boosts.length) hint = boosts.join(" · ");
    else if (s.inBase && cargo > 0) hint = "Depositing…";
    else if (p.xp === 0) hint = "Move near creatures to capture them";
    this.hint.textContent = hint;
    this.hint.classList.toggle("hidden", hint === "");
    this.hint.classList.toggle("warn", w.cargoFull && !s.inBase);

    let affordable = false;
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const row = this.rows.get(id)!;
      const lvl = p.upgrades[id];
      const hidden = lvl === 0 && ((id === "thermalFat" && !w.map.zones.some((z) => z.cold))
        || (id === "chitin" && p.banked.amber === 0 && !worldHasAmber(w))
        || (id === "dustLids" && p.banked.shards === 0 && !worldPays(w, "shards"))
        || (id === "webbedLimbs" && p.banked.pearls === 0 && !worldPays(w, "pearls") && !w.map.currents));
      row.root.classList.toggle("hidden", hidden);
      const cost = nextCost(p, id);
      const cur = upgradeValue(p, id);
      const next = upgradeValue(p, id, lvl + 1);
      row.level.textContent = ` Lv ${lvl}/${maxLevel(p, id)}`;
      row.value.textContent = cost === null
        ? `${fmt(cur)}${def.unit} (max)`
        : `${fmt(cur)}${def.unit} → ${fmt(next)}${def.unit}`;
      if (cost === null) {
        const raise = capRaise(p, id);
        row.buy.textContent = raise === "evolve" ? "Evolve to raise cap" : raise === "nextBiome" ? "Go deeper to raise cap" : "Maxed";
        row.buy.disabled = true;
      } else {
        // Deep capture-power levels also cost alloy (UpgradeDef.extraCost).
        const extra = nextExtraCost(p, id);
        const can = canAfford(p, upgradePrice(p, id)!);
        affordable ||= can && !hidden;
        const extraText = extra ? ` + ${fmt(extra.amount)} ${CURRENCY_ICON[extra.currency]}` : "";
        row.buy.textContent = `Buy · ${fmt(cost)} ${CURRENCY_ICON[def.currency]}${extraText}`;
        row.buy.disabled = !can;
        const extraLabel = extra ? ` and ${extra.amount} ${CURRENCY_LABEL[extra.currency].toLowerCase()}` : "";
        row.buy.setAttribute("aria-label", `Buy ${def.name} for ${cost} ${CURRENCY_LABEL[def.currency].toLowerCase()}${extraLabel}`);
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
    const p = w.progress;
    const active = activeQuests(p).slice(0, 3);
    // Once the quest chain is done there is still always a next step.
    const next = active.length > 0 ? null
      : !p.reactorRepaired ? w.biome.objective.task
      : w.biome.def.exit.action;
    const objectives = active.map((q) => {
        const row = el("div", "quest");
        const target = goalTarget(q.goal);
        row.append(el("span", "quest-name", q.title));
        if (target > 1) row.append(el("span", "quest-count", `${fmt(Math.floor(questCount(w.progress, q.id)))} / ${target}`));
        return row;
      });

    // The line: floor, the next step (with its count), and how many cravings are open.
    const lead = next ? el("span", "quest-name", next) : objectives[0];
    const line: HTMLElement[] = [el("span", "quest-floor", w.biome.name)];
    if (lead) line.push(lead);
    if (p.cravings.length) {
      const cravings = el("span", "quest-cravings", `✺${p.cravings.length}`);
      cravings.setAttribute("aria-label", `${p.cravings.length} cravings`);
      line.push(cravings);
    }
    this.questLine.replaceChildren(...line);

    const extras = objectives.slice(next ? 0 : 1);
    this.questDetails.classList.toggle("bare", extras.length === 0 && p.cravings.length === 0);
    this.questBody.replaceChildren(
      ...extras,
      ...(p.cravings.length ? [el("div", "quests-title cravings-title", "Cravings")] : []),
      ...p.cravings.map((c) => {
        const row = el("div", "quest craving");
        row.append(el("span", "quest-name", describeCraving(c)));
        const count = c.goal > 1 ? `${fmt(Math.floor(c.progress))}/${c.goal} ` : "";
        row.append(el("span", "quest-count", `${count}✺${c.reward}`));
        return row;
      }),
    );
  }

  /** Inline: this floor's currencies (two on a phone, four wider). The list: every one earned. */
  private renderWallet(w: World): void {
    const shown = WALLET_ORDER.filter((c) => walletShows(w, c));
    const local = shown.filter((c) => floorCurrency(w, c));
    // Biomass first, then what this floor is about, then genetic material if there's room.
    const ranked = [...local.filter((c) => c !== "genetic"), ...local.filter((c) => c === "genetic")];
    const inline = new Set(ranked.slice(0, this.narrow.matches ? 2 : 4));
    const mini: HTMLElement[] = [];
    const full: HTMLElement[] = [];
    for (const c of shown) {
      const coin = this.coins.get(c)!;
      const value = compact(w.progress.banked[c]);
      coin.miniValue.textContent = value;
      coin.fullValue.textContent = value;
      if (inline.has(c)) mini.push(coin.mini);
      full.push(coin.full);
    }
    this.walletMain.replaceChildren(...mini);
    this.walletMore.replaceChildren(...full);
    const more = shown.length - inline.size;
    this.walletCount.textContent = more > 0 ? `+${more}` : "";
    const summary = shown.filter((c) => inline.has(c)).map((c) => `${compact(w.progress.banked[c])} ${CURRENCY_LABEL[c].toLowerCase()}`).join(", ");
    this.walletBtn.setAttribute("aria-label", `Wallet: ${summary}${more > 0 ? `, and ${more} more` : ""}. Show all currencies.`);
  }

  private setWalletOpen(open: boolean): void {
    this.walletMore.classList.toggle("hidden", !open);
    this.walletBtn.setAttribute("aria-expanded", String(open));
    this.walletBox.classList.toggle("open", open);
  }

  private pick(option: number | "fallback"): void {
    // A double-tap must not land on the next queued choice's freshly rendered cards.
    if (performance.now() - this.perkShownAt < 350) return;
    this.perkCb.onPickPerk(this.perkShownLevel, option);
  }

  private renderBoss(boss: TargetEntity | null): void {
    this.bossBar.classList.toggle("hidden", boss === null);
    if (!boss) return;
    this.bossName.textContent = boss.def.name;
    const pct = Math.round(Math.max(0, Math.min(1, boss.progress)) * 100);
    this.bossFill.style.width = `${pct}%`;
    const state = boss.boss?.state;
    const special = boss.boss?.specialActive ? boss.def.bossTuning?.special?.label : undefined;
    const label = state === "stunned" ? "STUNNED · capture ×2"
      : state === "erupting" ? (boss.def.bossTuning?.special?.kind === "burrow" && boss.def.bossTuning.special.fly ? "Diving: get clear!" : "Erupting: get clear!")
      : state === "casting" || state === "burrowed" || (state === "chargeWindup" && special) ? special ?? "Look out"
      : state === "chargeWindup" ? "Charge incoming"
      : state === "slamWindup" ? "Slam incoming"
      : `Captured ${pct}%`;
    this.bossState.textContent = label;
    this.bossBar.classList.toggle("stunned", state === "stunned");
    this.bossBar.classList.toggle("danger", state === "chargeWindup" || state === "slamWindup" || state === "casting" || state === "burrowed" || state === "erupting");
  }

  private renderFeeding(w: World): void {
    const f = w.feeding;
    const frenzy = f.frenzy > 0;
    this.feedBox.classList.toggle("hidden", !frenzy && f.combo === 0);
    this.feedBox.classList.toggle("frenzy", frenzy);
    this.feedText.textContent = frenzy ? `FEEDING FRENZY · capture ×2 · ${Math.ceil(f.frenzy)}s` : `Combo ${f.combo} / ${FRENZY.combo}`;
    this.feedFill.style.width = frenzy ? "100%" : `${(f.combo / FRENZY.combo) * 100}%`;
  }

  private renderChill(w: World): void {
    const chill = w.chillApplied;
    this.chillBox.classList.toggle("hidden", chill <= 0);
    this.vignette.classList.toggle("cold", chill >= 0.5);
    if (chill <= 0) return;
    const pct = Math.round(chill * 100);
    this.chillText.textContent = `❄ Chill ${pct}% · speed −${Math.round(COLD.speedPenalty * chill)}%, capture −${Math.round(COLD.powerPenalty * chill)}%${chill >= 1 ? " · find a heat vent" : ""}`;
    this.chillFill.style.width = `${pct}%`;
  }

  /** Sandstorms: a warning while one gathers, then what it's costing you (or that you're sheltered). */
  private renderStorm(w: World): void {
    const s = w.storm;
    // Shown from the warning until the storm has fully died down.
    const show = !!w.map.storms && (s.phase !== "calm" || s.intensity > 0);
    this.stormBox.classList.toggle("hidden", !show);
    if (!show) return;
    if (s.phase === "warning") {
      this.stormText.textContent = "🌪 Sandstorm coming · get under a canopy or into the ruins";
      this.stormFill.style.width = "0%";
      return;
    }
    const felt = w.stormApplied;
    const cut = Math.round(stormReachCut(w));
    this.stormText.textContent = felt > 0 ? `🌪 Sandstorm · reach −${cut}% · find shelter` : "🌪 Sandstorm · sheltered";
    this.stormFill.style.width = `${Math.round(s.intensity * 100)}%`;
  }

  private renderMutagen(w: World): void {
    const p = w.progress;
    for (const id of MUTAGEN_IDS) {
      const row = this.mutagenRows.get(id)!;
      row.level.textContent = ` Lv ${mutagenLevel(p, id)}/${MUTAGEN[id].costs.length}`;
      const cost = nextMutagenCost(p, id);
      row.buy.disabled = cost === null || p.banked.mutagen < cost;
      row.buy.textContent = cost === null ? "Maxed" : `Buy · ${cost} ✺`;
      row.buy.setAttribute("aria-label", cost === null ? `${MUTAGEN[id].name} maxed` : `Buy ${MUTAGEN[id].name} for ${cost} mutagen`);
    }
  }

  private renderBestiary(w: World): void {
    const p = w.progress;
    const types = (Object.keys(TARGETS) as TargetTypeId[]).filter(inBestiary);
    this.bestiaryList.replaceChildren(...types.map((t) => {
      const n = p.bestiary[t] ?? 0;
      const next = BESTIARY_MILESTONES.find((m) => n < m.count);
      const li = el("li", n > 0 ? "seen" : "unseen");
      li.append(
        el("span", "req-label", n > 0 ? TARGETS[t].name : "???"),
        el("span", "req-progress", next ? `${n} / ${next.count}` : `${n} · complete`),
        el("span", "req-mark", "★".repeat(milestonesReached(n)) || "·"),
      );
      return li;
    }));
  }

  private renderExit(w: World, near: boolean): void {
    this.exitCard.classList.toggle("hidden", !near);
    if (!near) return;
    const p = w.progress;
    const exit = w.biome.def.exit;
    const reqs = clearRequirements(p);
    const open = reqs.every((r) => r.met);
    const next = nextBiome(p);
    this.exitCard.setAttribute("aria-label", exit.name);
    this.exitTitle.textContent = open ? `${exit.name} — powered` : `${exit.name} — no power`;
    this.exitNote.textContent = open
      ? `Leads to ${next.name}. You keep everything you've harvested, your mutations, perks and form. Unbanked cargo is banked on the way.`
        + (p.summon.left > 0 ? ` The ${p.summon.left} summoned creatures still roaming stay behind.` : "")
      : "Clear this floor to use it:";
    if (open) this.exitList.replaceChildren();
    else requirementList(this.exitList, reqs);
    this.exitBtn.disabled = !open;
    this.exitNeedsConfirm = open && p.summon.left > 0;
    if (!this.exitNeedsConfirm) this.exitArmedAt = 0;
    const armed = this.exitArmedAt > 0 && performance.now() - this.exitArmedAt < 4000;
    this.exitBtn.textContent = !open ? "Not powered yet" : armed ? "Tap again to leave the wave behind" : exit.action;
  }

  private renderReactor(w: World, near: boolean): void {
    this.reactorCard.classList.toggle("hidden", !near);
    if (!near) return;
    const p = w.progress;
    this.reactorSummons = p.reactorRepaired;
    this.reactorNote.classList.toggle("hidden", !p.reactorRepaired);
    if (p.reactorRepaired) {
      // A finished machine takes this floor's currency for a reward wave: a goal before leaving.
      this.reactorTitle.textContent = w.biome.objective.doneTitle;
      const left = p.summon.left;
      this.reactorNote.textContent = left > 0
        ? `Wave roaming: ${left} summoned ${left === 1 ? "creature" : "creatures"} left to catch.`
        : `Feed it to summon a wave of ${SUMMON.count} creatures, each worth ${SUMMON.rewardMultiplier}× the usual payout.`;
      const reqs = left > 0 ? [] : summonRequirements(p);
      requirementList(this.reactorList, reqs);
      const ok = left === 0 && reqs.every((r) => r.met);
      this.reactorBtn.classList.remove("hidden");
      this.reactorBtn.disabled = !ok;
      this.reactorBtn.textContent = left > 0 ? "Wave in progress" : ok ? "Summon a wave" : "Can't afford a wave";
      return;
    }
    this.reactorTitle.textContent = `${w.biome.objective.name} — damaged`;
    const reqs = reactorRequirements(p);
    requirementList(this.reactorList, reqs);
    const ok = reqs.every((r) => r.met);
    this.reactorBtn.classList.remove("hidden");
    this.reactorBtn.disabled = !ok;
    this.reactorBtn.textContent = ok ? w.biome.objective.task : "Requirements not met";
  }

  /** Show the result of checking an import: a summary to confirm, or why it was rejected. */
  showImportPreview(result: { summary: SaveSummary } | { error: string } | null): void {
    this.importArmedAt = 0;
    this.importConfirm.textContent = "Replace current progress";
    this.importPreview.classList.toggle("hidden", result === null);
    this.importConfirm.classList.toggle("hidden", !(result && "summary" in result));
    this.importPreview.classList.toggle("error", !!result && "error" in result);
    if (!result) return;
    if ("error" in result) {
      this.importPreview.replaceChildren(el("p", undefined, result.error));
      return;
    }
    const s = result.summary;
    const rows: Array<[string, string]> = [
      ["Level", String(s.level)],
      ["Form", s.form],
      ["Biomass", String(s.biomass)],
      ["Genetic material", String(s.genetic)],
      ["Machine parts", String(s.parts)],
      ["Mutagen", String(s.mutagen)],
      ["Cryo crystals", String(s.crystals)],
      ["Alloy", String(s.alloy)],
      ["Hive amber", String(s.amber)],
      ["Relic shards", String(s.shards)],
      ["Tide pearls", String(s.pearls)],
      ...LATE_CURRENCIES.map((c): [string, string] => [CURRENCY_LABEL[c], String(s.late[c])]),
      ["Location", s.place],
      ["Doors open", String(s.doorsOpen)],
      ["Objectives done", String(s.questsDone)],
      ["Floor objective done", s.reactorRepaired ? "Yes" : "No"],
    ];
    const dl = el("dl", "completion-stats");
    dl.append(...rows.flatMap(([k, v]) => [el("dt", undefined, k), el("dd", undefined, v)]));
    this.importPreview.replaceChildren(
      el("p", undefined, "This save is valid. Importing replaces your current progress; a backup of it is kept on this device."),
      dl,
    );
  }

  get completionOpen(): boolean {
    return !this.completion.classList.contains("hidden");
  }

  showCompletion(stats: CompletionStats | null): void {
    this.completion.classList.toggle("hidden", stats === null);
    if (!stats) return;
    this.completionTitle.textContent = stats.title;
    this.completionBody.textContent = stats.body;
    const h = Math.floor(stats.playSeconds / 3600);
    const m = Math.floor((stats.playSeconds % 3600) / 60);
    const rows: Array<[string, string]> = [
      ["Level", String(stats.level)],
      ["Form", stats.form],
      ["Play time", h > 0 ? `${h} h ${m} min` : `${m} min`],
      ["Objectives", `${stats.questsDone} / ${stats.questsTotal}`],
      ["Perks taken", String(stats.perksTaken)],
    ];
    this.completionStats.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", undefined, k), el("dd", undefined, v)]));
  }

  private renderStructures(w: World): void {
    const p = w.progress;
    for (const kind of STRUCTURE_KINDS) {
      const row = this.structureRows.get(kind)!;
      const s = p.structures[kind];
      // Crystal-built helpers stay out of the way until you've seen a crystal (or alloy: the refinery makes it, and the catcher comes with it).
      const hidden = (kind === "refinery" || kind === "catcher") && !s.built && p.banked.crystals <= 0 && p.banked.alloy <= 0;
      row.root.classList.toggle("hidden", hidden);
      if (hidden) continue;
      const zoneName = (site: { x: number; z: number }) => (zoneAt(w.map, site.x, site.z)?.name ?? "facility").toLowerCase();
      if (kind === "refinery") {
        const r = p.structures.refinery;
        const lvl = refineryLevel(r);
        const input = refineryInput(p.depth);
        const uses = `${fmt(input.biomass)} biomass + ${fmt(input.parts)} parts`;
        const idle = refineryIdle(p);
        row.status.textContent = r.built
          ? `Level ${r.level} · ${r.stock}/${lvl.storage} alloy batches · ${idle === "full" ? "full: collect it" : idle === "input" ? `waiting for ${uses}` : "refining"}`
          : `Not built. Turns ${uses} from your bank into alloy, in the ${zoneName(w.biome.def.sites.refinery)}.`;
      } else if (kind === "catcher") {
        const c = p.structures.catcher;
        const lvl = catcherLevel(c);
        row.status.textContent = c.built
          ? `Level ${c.level} · grip ${lvl.powerPercent}% of yours · carries ${lvl.capacity}`
          : "Not built. Hunts creatures near you and flies them to the nearest pad.";
      } else if (kind === "outpost") {
        row.status.textContent = p.structures.outpost.built
          ? `Built in the ${zoneName(w.biome.def.sites.outpost)}. Bank here${w.map.zones.some((z) => z.cold) ? "; it's heated, too" : ""}.`
          : `Not built. A second pad to bank at, in the ${zoneName(w.biome.def.sites.outpost)}. One per floor.`;
      } else if (kind === "vat") {
        const v = p.structures.vat;
        const lvl = vatLevel(v);
        row.status.textContent = v.built
          ? `Level ${v.level} · ${v.stock}/${lvl.storage} batches · one every ${fmt(lvl.batchSeconds / w.stats.farmRate)}s`
          : `Not built. Produces biomass batches in the ${(zoneAt(w.map, w.biome.def.sites.vat.x, w.biome.def.sites.vat.z)?.name ?? "facility").toLowerCase()} while you play.`;
      } else if (kind === "drone") {
        const d = p.structures.drone;
        row.status.textContent = d.built
          ? `Level ${d.level} · carries ${droneCapacity(d)}`
          : "Not built. Ferries your cargo back to base, and collects from the vat.";
      }
      const next = nextStep(p, kind);
      if (!next) {
        row.reqs.replaceChildren();
        row.btn.textContent = kind === "outpost" ? "Built" : "Max level";
        row.btn.disabled = true;
        continue;
      }
      const reqs = stepRequirements(p, kind);
      requirementList(row.reqs, reqs);
      const ok = reqs.every((r) => r.met);
      row.btn.disabled = !ok;
      row.btn.textContent = s.built ? `Upgrade to level ${s.level + 1}` : "Build";
      const name = structureName(kind);
      row.btn.setAttribute("aria-label", s.built ? `Upgrade ${name} to level ${s.level + 1}` : `Build ${name}`);
    }

    const d = p.structures.drone;
    this.droneBadge.classList.toggle("hidden", !d.built);
    if (d.built) {
      const load = `${fmt(cargoWeight(d.cargo))}/${droneCapacity(d)}`;
      const label = { idle: "waiting at base", toPlayer: "coming to you", toVat: "collecting from the vat", toRefinery: "collecting alloy", toBase: "delivering" }[w.droneMode];
      helperBadge(this.droneBadge, "Drone", load, label, w.droneMode !== "idle");
    }
  }

  /** Every frame, but only touches the DOM when its text changes (the grip moves each tick). */
  private renderCatcher(w: World): void {
    const c = w.progress.structures.catcher;
    let text = "";
    let load = "";
    let label = "";
    if (c.built) {
      load = `${fmt(cargoWeight(c.cargo))}/${catcherLevel(c).capacity}`;
      const prey = w.catcher.target;
      label = w.catcher.mode === "hunting" && prey ? `catching a ${prey.def.name.toLowerCase()} (${Math.round(w.catcher.progress * 10) * 10}%)` : w.catcher.mode === "toPad" ? "delivering" : "following you";
      text = `${label}|${load}`;
    }
    if (text === this.catcherText) return;
    this.catcherText = text;
    this.catcherBadge.classList.toggle("hidden", text === "");
    if (text) helperBadge(this.catcherBadge, "Catcher", load, label, w.catcher.mode === "hunting" || w.catcher.mode === "toPad");
  }

  private renderPerks(w: World): void {
    const p = w.progress;
    const pending = p.pendingPerks.length;
    this.perkBtn.classList.toggle("hidden", pending === 0);
    this.perkBtn.textContent = pending > 1 ? `Perks ready (${pending})` : "Perk ready";
    const choice = p.pendingPerks[0];
    if (!choice) {
      this.perkCards.replaceChildren();
      return;
    }
    if (choice.level !== this.perkShownLevel) {
      this.perkShownLevel = choice.level;
      this.perkShownAt = performance.now();
    }
    this.perkTitle.textContent = pending > 1 ? `Level ${choice.level} perk (${pending} to choose)` : `Level ${choice.level} perk`;
    let legalCount = 0;
    this.perkCards.replaceChildren(
      ...choice.options.map((id, i) => {
        const def = PERKS[id];
        const legal = isLegal(p, id);
        if (legal) legalCount++;
        const card = el("button", "perk-card");
        card.disabled = !legal;
        const stacks = def.maxStacks === null ? "" : `${perkStacks(p, id)} / ${def.maxStacks}`;
        card.append(
          el("span", "perk-icon", def.icon),
          el("span", "perk-name", def.name),
          el("span", "perk-desc", legal ? describePerk(def, choice.level, p.depth) : "Already at maximum"),
          el("span", "perk-stacks", stacks),
        );
        card.setAttribute("aria-label", `${def.name}: ${describePerk(def, choice.level, p.depth)}${stacks ? `, taken ${stacks}` : ""}`);
        card.addEventListener("click", () => this.pick(i));
        return card;
      }),
    );
    // Always three real options: top up with a biomass cache when earlier picks maxed some.
    this.perkFallback.classList.toggle("hidden", legalCount >= CHOICES_PER_LEVEL);
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
