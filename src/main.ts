import "./ui/styles.css";
import { FACILITY } from "./content/map";
import type { UpgradeId } from "./content/upgrades";
import { newProgress } from "./domain/progress";
import { CURRENCIES, CURRENCY_LABEL, emptyWallet } from "./content/currencies";
import { FORM_NAMES } from "./content/evolution";
import type { CargoDrop } from "./domain/progress";
import { UPGRADE_IDS } from "./content/upgrades";
import { capAtTier, tableCostForLevels } from "./domain/economy";
import { devCompleteActive } from "./domain/quests";
import { buyUpgrade, evolveCreature, nearbyLockedDoor, openDoor, respec, respecBlocker } from "./game/actions";
import { FixedLoop } from "./game/loop";
import { stepWorld } from "./game/step";
import { inBase } from "./game/systems/deposit";
import { createWorld, gainXp, pushQuestOutcome, refreshStats, SIM_HZ, type World } from "./game/world";
import { defaultSettings, toSaveFile, type Settings } from "./persistence/schema";
import { acquireActiveTabLock, SaveStore } from "./persistence/store";
import { GameRenderer } from "./render/renderer";
import { Hud } from "./ui/hud";
import { InputController } from "./ui/input";

const AUTOSAVE_TICKS = SIM_HZ * 10;

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
  /** Set when loading failed: never write, so a fresh game can't overwrite real progress. */
  let readOnly = false;
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
    hud.update(world, { inBase: inBase(world), door: nearbyLockedDoor(world), respecBlocker: respecBlocker(world) });
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

  function setUpgradesOpen(open: boolean): void {
    if (open) loop.pause("menu");
    input.reset();
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
          hud.toast(`Level ${e.level} reached`);
          saveNow = true;
        } else if (e.type === "playerHit") {
          hud.flashDamage();
        } else if (e.type === "died") {
          hud.toast(deathMessage(e.forgiven, e.lost), 6);
          saveNow = true;
        } else if (e.type === "evolved") {
          hud.toast(`Evolved into ${FORM_NAMES[e.tier] ?? "a new form"}!`, 3.5);
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
