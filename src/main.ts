import "./ui/styles.css";
import { FACILITY } from "./content/map";
import type { UpgradeId } from "./content/upgrades";
import { newProgress } from "./domain/progress";
import { CURRENCIES, CURRENCY_LABEL, emptyWallet } from "./content/currencies";
import { FORM_NAMES } from "./content/evolution";
import { pointInRect } from "./game/geometry";
import { QUESTS } from "./content/quests";
import { levelForXp } from "./domain/levels";
import type { CargoDrop } from "./domain/progress";
import { UPGRADE_IDS } from "./content/upgrades";
import { capAtTier, tableCostForLevels } from "./domain/economy";
import { devCompleteActive } from "./domain/quests";
import { buildStructure, nearReactor, repair, buyUpgrade, evolveCreature, nearbyLockedDoor, openDoor, pickPerk, respec, respecBlocker } from "./game/actions";
import { FixedLoop } from "./game/loop";
import { stepWorld } from "./game/step";
import { inBase } from "./game/systems/deposit";
import { createWorld, gainXp, pushQuestOutcome, refreshStats, SIM_HZ, type TargetEntity, type World } from "./game/world";
import { defaultSettings, toSaveFile, type SaveFile, type Settings } from "./persistence/schema";
import { exportFileName, exportText, IMPORT_ERRORS, parseImport } from "./persistence/transfer";
import { acquireActiveTabLock, SaveStore } from "./persistence/store";
import { GameRenderer } from "./render/renderer";
import { Hud } from "./ui/hud";
import { InputController } from "./ui/input";

const AUTOSAVE_TICKS = SIM_HZ * 10;

/** The warden, if the player is in its hall and it's alive (drives the boss bar). */
function engagedBoss(w: World): TargetEntity | null {
  const boss = w.targets.find((t) => t.def.behavior === "boss");
  if (!boss) return null;
  if (boss.held) return boss;
  return pointInRect(w.player.x, w.player.z, boss.zoneRect, 4.5) ? boss : null;
}

/** Tells the player exactly what a death cost them. */
function deathMessage(forgiven: boolean, lost: readonly CargoDrop[]): string {
  if (forgiven) return "You were overwhelmed — first defeat forgiven, your cargo was kept. Next time, unbanked cargo is lost.";
  if (lost.length === 0) return "You were overwhelmed and returned to base. Nothing was lost.";
  const totals = emptyWallet();
  for (const d of lost) for (const c of CURRENCIES) totals[c] += d.reward[c] ?? 0;
  const parts = CURRENCIES.filter((c) => totals[c] > 0).map((c) => `${totals[c]} ${CURRENCY_LABEL[c].toLowerCase()}`);
  return `You were overwhelmed and returned to base. Lost unbanked cargo: ${parts.join(", ")}.`;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  const uiRoot = document.getElementById("ui")!;
  const zone = document.getElementById("joystick-zone")!;
  const room = FACILITY;

  let world: World;
  let settings: Settings = defaultSettings();
  let saveFailedShown = false;
  /** UI callbacks are ignored until boot has finished creating the world and loop. */
  let ready = false;
  /** Set when loading failed, or while an import reloads: never write over real progress. */
  let readOnly = false;
  /** Loading failed this session: saving stays off for good, and export would only copy an empty game. */
  let loadFailed = false;
  /** A validated import waiting for the player's confirmation. */
  let pendingImport: SaveFile | null = null;
  const store = new SaveStore(room);

  const hud = new Hud(uiRoot, {
    onOpenUpgrades: () => ready && setUpgradesOpen(true),
    onCloseUpgrades: () => ready && setUpgradesOpen(false),
    onBuy: (id: UpgradeId) => {
      if (!ready) return;
      if (buyUpgrade(world, id).ok) {
        refreshHud();
        void save();
      }
    },
    onUnlockDoor: (door) => {
      if (!ready) return;
      if (openDoor(world, door).ok) {
        hud.toast(`${door.name} opened`);
        refreshHud();
        void save();
      }
    },
    onEvolve: () => {
      if (!ready) return;
      if (evolveCreature(world).ok) {
        refreshHud();
        void save();
      }
    },
    onRespec: () => {
      if (!ready) return;
      const r = respec(world);
      if (r.ok) {
        const parts = CURRENCIES.filter((c) => r.refund[c] > 0).map((c) => `${r.refund[c]} ${CURRENCY_LABEL[c].toLowerCase()}`);
        hud.toast(`Mutations reset. Refunded ${parts.join(", ") || "nothing"}.`, 4);
        refreshHud();
        void save();
      }
    },
    onOpenPerks: () => ready && setPerksOpen(true),
    onClosePerks: () => ready && setPerksOpen(false),
    onPickPerk: (level, option) => {
      if (!ready) return;
      // Only act on the choice the player was actually looking at.
      if (world.progress.pendingPerks[0]?.level !== level) return;
      if (pickPerk(world, option).ok) {
        refreshHud();
        void save();
        // Stay open while more choices are queued.
        if (world.progress.pendingPerks.length === 0) setPerksOpen(false);
      }
    },
    onBuildStructure: (kind) => {
      if (!ready) return;
      if (buildStructure(world, kind).ok) {
        refreshHud();
        void save();
      }
    },
    onRepair: () => {
      if (!ready) return;
      if (repair(world).ok) {
        refreshHud();
        void save();
      }
    },
    onCloseCompletion: () => {
      if (!ready) return;
      hud.showCompletion(null);
      loop.resume("completion");
    },
    onExportDownload: () => {
      if (!ready) return;
      if (loadFailed) {
        hud.toast("Your saved progress couldn't be read this session, so there's nothing to export. Reload to try again.", 6);
        return;
      }
      const text = exportText(toSaveFile(world.progress, settings));
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName();
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      hud.toast("Save file downloaded.");
    },
    onExportCopy: () => {
      if (!ready) return;
      if (loadFailed) {
        hud.toast("Your saved progress couldn't be read this session, so there's nothing to export. Reload to try again.", 6);
        return;
      }
      const text = exportText(toSaveFile(world.progress, settings));
      navigator.clipboard?.writeText(text).then(
        () => hud.toast("Save text copied. Paste it somewhere safe."),
        () => hud.toast("Couldn't copy automatically. Use Download save file instead.", 4),
      ) ?? hud.toast("Copying isn't available here. Use Download save file instead.", 4);
    },
    onImportRejected: (reason) => {
      if (!ready || !hud.upgradesOpen) return;
      pendingImport = null;
      hud.showImportPreview({ error: reason === "tooLarge" ? IMPORT_ERRORS.tooLarge : "That file couldn't be read." });
    },
    onImportText: (text) => {
      // Ignore a file read that finishes after the panel was closed.
      if (!ready || !hud.upgradesOpen) return;
      const r = parseImport(text, room);
      pendingImport = r.ok ? r.save : null;
      hud.showImportPreview(r.ok ? { summary: r.summary } : { error: IMPORT_ERRORS[r.reason] });
    },
    onImportConfirm: () => {
      if (!ready || !pendingImport) return;
      const incoming = pendingImport;
      pendingImport = null;
      // Freeze saving first: the reload's save-on-hide must not write the old game over the import.
      readOnly = true;
      loop.pause("import");
      store.importSave(incoming).then(
        () => location.reload(),
        (err) => {
          console.error("Import failed", err);
          // Back to how it was: a session whose load failed must stay read-only.
          readOnly = loadFailed;
          loop.resume("import");
          hud.showImportPreview({ error: "The import couldn't be saved. Your current progress is unchanged." });
        },
      );
    },
    onToggleHand: () => {
      if (!ready) return;
      settings.leftHanded = !settings.leftHanded;
      applySettings();
      void save();
    },
  });

  if (!(await acquireActiveTabLock())) {
    hud.block("Already open", "Alien Harvester is running in another tab. Close it there to play here.");
    return;
  }

  let recovered = false;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  try {
    const result = await store.load();
    if (result.status === "newer") {
      hud.block("Update required", "Your progress was saved by a newer version of the game. Reload to get the latest version.");
      return;
    }
    recovered = result.recovered;
    if (result.save) settings = result.save.settings;
    world = createWorld(room, result.save?.progress ?? newProgress(room), seed);
  } catch (err) {
    console.error("Load failed", err);
    readOnly = true;
    loadFailed = true;
    hud.toast("Couldn't read saved progress. Saving is off this session — reload to try again.", 8);
    world = createWorld(room, newProgress(room), seed);
  }

  const renderer = new GameRenderer(canvas, room, { reducedEffects: settings.reducedEffects });
  const input = new InputController(zone);
  const loop = new FixedLoop((dt) => stepWorld(world, dt), { hz: SIM_HZ, maxStepsPerFrame: 5 });
  renderer.snapCamera(world);
  if (import.meta.env.DEV) {
    // Dynamic import keeps the testing panel out of production bundles entirely.
    void import("./ui/devTools").then(({ mountDevTools }) => {
      const after = () => {
        refreshHud();
        void save();
      };
      mountDevTools(uiRoot, {
        grant: (currency, amount) => {
          world.progress.banked[currency] += amount;
          after();
        },
        addXp: (amount) => {
          gainXp(world, amount);
          after();
        },
        completeObjectives: () => {
          pushQuestOutcome(world, devCompleteActive(world.progress));
          after();
        },
        devolve: () => {
          const p = world.progress;
          p.evolution = Math.max(0, p.evolution - 1);
          for (const id of UPGRADE_IDS) {
            const capped = Math.min(p.upgrades[id], capAtTier(id, p.evolution));
            if (capped < p.upgrades[id]) p.upgradeSpent[id] = tableCostForLevels(id, capped);
            p.upgrades[id] = capped;
          }
          refreshStats(world);
          // Keep the hold within the reduced capacity, matching what a reload would do.
          let held = 0;
          p.cargo = p.cargo.filter((d) => (held += d.weight) <= world.stats.cargoCapacity);
          after();
        },
      });
    });
    // Debug hook for automated checks: advance the simulation deterministically.
    Object.assign(window, {
      __game: {
        get world() { return world; },
        loop,
        step(n: number, ix = 0, iz = 0) {
          for (let i = 0; i < n; i++) {
            world.input.x = ix;
            world.input.z = iz;
            stepWorld(world);
          }
        },
      },
    });
  }

  function refreshHud(): void {
    hud.update(world, {
      inBase: inBase(world),
      door: nearbyLockedDoor(world),
      respecBlocker: respecBlocker(world),
      boss: engagedBoss(world),
      atReactor: nearReactor(world),
    });
  }

  function showCompletion(): void {
    const p = world.progress;
    loop.pause("completion");
    input.reset();
    hud.showCompletion({
      level: levelForXp(p.xp),
      form: FORM_NAMES[p.evolution] ?? "Unknown",
      playSeconds: p.playSeconds,
      questsDone: QUESTS.filter((q) => p.quests[q.id]?.done).length,
      questsTotal: QUESTS.length,
      perksTaken: Object.values(p.perks).reduce((a, n) => a + (n ?? 0), 0),
    });
  }

  function applySettings(): void {
    input.setLeftHanded(settings.leftHanded);
    hud.setLeftHanded(settings.leftHanded);
  }
  applySettings();

  async function save(): Promise<void> {
    if (readOnly) return;
    try {
      await store.write(toSaveFile(world.progress, settings));
      saveFailedShown = false;
    } catch (err) {
      console.error("Save failed", err);
      if (!saveFailedShown) hud.toast("Saving failed — progress since the last save may be lost.", 5);
      saveFailedShown = true;
    }
  }

  function setPerksOpen(open: boolean): void {
    if (open) loop.pause("perks");
    input.reset();
    hud.showPerks(open);
    if (!open) loop.resume("perks");
  }

  function setUpgradesOpen(open: boolean): void {
    if (open) loop.pause("menu");
    input.reset();
    // A half-finished import never survives closing the panel.
    if (!open) pendingImport = null;
    hud.showUpgrades(open);
    if (open) void save();
    else loop.resume("menu");
  }

  // Foreground-only: hidden pages freeze the simulation and earn nothing.
  const onHidden = () => {
    loop.pause("hidden");
    input.reset();
    void save();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onHidden();
    else loop.resume("hidden");
  });
  window.addEventListener("pagehide", () => {
    loop.pause("pagehide");
    onHidden();
  });
  window.addEventListener("pageshow", () => {
    loop.resume("pagehide");
    if (!document.hidden) loop.resume("hidden");
  });
  // Switching to another app with the window still visible also freezes play.
  window.addEventListener("blur", () => {
    loop.pause("blur");
    input.reset();
    void save();
  });
  window.addEventListener("focus", () => loop.resume("blur"));
  if (document.hidden) loop.pause("hidden");

  window.addEventListener("resize", () => renderer.resize());
  window.addEventListener("orientationchange", () => renderer.resize());

  if (recovered) {
    hud.toast("Latest save was unreadable; restored the previous snapshot.", 5);
    void save();
  }

  let lastSaveTick = world.tick;
  let depositUnsaved = false;
  ready = true;
  renderer.engine.runRenderLoop(() => {
    input.read(world.input);
    const alpha = loop.frame(performance.now());

    const events = world.events;
    if (events.length) {
      renderer.handleEvents(events);
      let saveNow = false;
      for (const e of events) {
        if (e.type === "deposited") depositUnsaved = true;
        else if (e.type === "depositComplete") saveNow = true;
        else if (e.type === "questComplete") {
          hud.toast(`Objective complete: ${e.quest.title}`);
          saveNow = true;
        } else if (e.type === "levelUp") {
          hud.toast(`Level ${e.level} reached — perk ready`);
          saveNow = true;
        } else if (e.type === "playerHit") {
          hud.flashDamage();
        } else if (e.type === "died") {
          hud.toast(deathMessage(e.forgiven, e.lost), 6);
          saveNow = true;
        } else if (e.type === "evolved") {
          hud.toast(`Evolved into ${FORM_NAMES[e.tier] ?? "a new form"}!`, 3.5);
          saveNow = true;
        } else if (e.type === "bossDefeated") {
          hud.toast("The reactor warden is down! Bank its parts and repair the reactor.", 4);
          saveNow = true;
        } else if (e.type === "reactorRepaired") {
          showCompletion();
          saveNow = true;
        } else if (e.type === "structureBuilt") {
          const name = e.kind === "vat" ? "Biomass vat" : "Delivery drone";
          hud.toast(e.level === 1 ? `${name} built` : `${name} upgraded to level ${e.level}`);
          saveNow = true;
        } else if (e.type === "droneDeposited") {
          // The drone banked cargo: persist it like a player deposit.
          saveNow = true;
        } else if (e.type === "doorUnlocked" || e.type === "purchased") saveNow = true;
      }
      world.events = [];
      if (saveNow) depositUnsaved = false;
      if (saveNow) {
        lastSaveTick = world.tick;
        void save();
      }
    }
    // Also save if the player walks off the base part-way through a deposit.
    if (depositUnsaved && !inBase(world)) {
      depositUnsaved = false;
      lastSaveTick = world.tick;
      void save();
    }
    if (world.tick - lastSaveTick >= AUTOSAVE_TICKS) {
      lastSaveTick = world.tick;
      void save();
    }

    renderer.render(world, loop.paused ? 1 : alpha);
    refreshHud();
  });
}

void boot();
