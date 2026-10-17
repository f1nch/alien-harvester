import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { REACTOR, WARDEN } from "../src/content/reactor";
import { TARGETS } from "../src/content/targets";
import { newProgress, type ProgressState } from "../src/domain/progress";
import { isDone } from "../src/domain/quests";
import { reactorRequirements, repairReactor } from "../src/domain/reactor";
import { FixedLoop } from "../src/game/loop";
import { nearReactor, repair } from "../src/game/actions";
import { stepWorld } from "../src/game/step";
import { createWorld, SIM_DT, type TargetEntity, type World } from "../src/game/world";
import { holderPower } from "../src/game/systems/capture";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";

/** Everything open up to the reactor hall. */
function lateGame(): ProgressState {
  const p = newProgress(FACILITY);
  p.unlockedDoors.push("door-service", "door-security", "door-reactor");
  for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade", "q-open-service", "q-genetic", "q-evolve", "q-open-security", "q-open-reactor"]) {
    p.quests[id] = { count: 999, done: true };
  }
  p.firstDeathForgiven = true;
  return p;
}

function arena(px: number, pz: number, opts: { capture?: boolean } = {}) {
  const w = createWorld(FACILITY, lateGame());
  const boss = w.targets.find((t) => t.def.id === "boss")!;
  w.player.x = w.player.prevX = px;
  w.player.z = w.player.prevZ = pz;
  w.progress.player.health = 10_000; // survive long enough to observe
  w.stats.maxHealth = 10_000;
  if (!opts.capture) w.stats.captureRadius = 0;
  return { w, boss };
}

const run = (w: World, seconds: number, input = { x: 0, z: 0 }) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    w.input.x = input.x;
    w.input.z = input.z;
    stepWorld(w);
  }
};
const b = (t: TargetEntity) => t.boss!;

describe("reactor warden", () => {
  it("spawns in the reactor hall and ignores players outside it", () => {
    const { w, boss } = arena(0, -5); // containment, away from every hostile
    run(w, 3);
    expect(b(boss).state).toBe("idle");
    expect(w.progress.player.health).toBe(10_000);
  });

  it("telegraphs the slam: no damage during the windup, damage after if still in the ring", () => {
    const { w, boss } = arena(0, 83);
    run(w, SIM_DT * 2);
    expect(b(boss).state).toBe("slamWindup");
    run(w, WARDEN.slamWindup - 0.15);
    expect(w.progress.player.health).toBe(10_000);
    run(w, 0.3);
    expect(w.progress.player.health).toBe(10_000 - WARDEN.slamDamage);
  });

  it("stepping out of the ring during the windup dodges the slam", () => {
    const { w, boss } = arena(0, 83);
    run(w, SIM_DT * 2);
    expect(b(boss).state).toBe("slamWindup");
    w.player.x = 0;
    w.player.z = 79; // 6m away
    run(w, WARDEN.slamWindup + 0.1);
    expect(w.progress.player.health).toBe(10_000);
  });

  it("charges down a lane locked at the start of the windup; sidestepping avoids it", () => {
    const { w, boss } = arena(0, 78);
    b(boss).chargeCooldown = 0;
    run(w, SIM_DT * 2);
    expect(b(boss).state).toBe("chargeWindup");
    expect(b(boss).dirZ).toBeLessThan(-0.99); // straight at the player
    w.player.x = 3.5; // sidestep out of the lane
    run(w, WARDEN.chargeWindup + 2);
    expect(w.progress.player.health).toBe(10_000);
  });

  it("standing in the lane gets hit once per charge", () => {
    const { w, boss } = arena(0, 78);
    b(boss).chargeCooldown = 0;
    run(w, SIM_DT * 2);
    expect(b(boss).state).toBe("chargeWindup");
    run(w, WARDEN.chargeWindup + 1.5);
    expect(w.progress.player.health).toBe(10_000 - WARDEN.chargeDamage);
  });

  it("ramming a pillar stuns it for longer", () => {
    // Pillar at (5.5, 81): bait the charge from the far side of it.
    const { w, boss } = arena(8, 79);
    boss.x = 3;
    boss.z = 83;
    b(boss).chargeCooldown = 0;
    run(w, SIM_DT * 2);
    expect(b(boss).state).toBe("chargeWindup");
    let stunned = false;
    for (let i = 0; i < 4 / SIM_DT && !stunned; i++) {
      stepWorld(w);
      stunned = w.events.some((e) => e.type === "bossStunned");
    }
    expect(stunned).toBe(true);
    expect(b(boss).state).toBe("stunned");
    expect(b(boss).timer).toBeGreaterThan(WARDEN.stunAfterCharge);
  });

  it("held, it slows down rather than stopping", () => {
    const { w, boss } = arena(0, 81, { capture: true });
    w.stats.captureRadius = 5;
    boss.boss!.state = "chase";
    run(w, SIM_DT * 2);
    expect(boss.held).toBe(true);
  });
});

describe("capturing the warden", () => {
  const holding = () => {
    const { w, boss } = arena(0, 81.5, { capture: true });
    w.stats.captureRadius = 6;
    w.stats.tentacles = 3;
    // Keep it still and harmless so only capture is measured.
    boss.boss!.state = "recover";
    boss.boss!.timer = 1e9;
    return { w, boss };
  };

  it("every spare tentacle grabs it, and their power stacks with diminishing returns", () => {
    const { w, boss } = holding();
    run(w, 1);
    expect(w.tentacles.filter((t) => t === boss)).toHaveLength(3);
    const perSecond = (holderPower(3) * w.stats.capturePower) / TARGETS.boss.resistance;
    expect(boss.progress).toBeCloseTo(perSecond * (1 - SIM_DT), 2);
  });

  it("stunned, it captures twice as fast", () => {
    const { w, boss } = holding();
    boss.boss!.state = "stunned";
    run(w, 1);
    const perSecond = (holderPower(3) * w.stats.capturePower * WARDEN.stunnedCaptureBonus) / TARGETS.boss.resistance;
    expect(boss.progress).toBeCloseTo(perSecond * (1 - SIM_DT), 2);
  });

  it("progress decays slowly out of reach instead of resetting", () => {
    const { w, boss } = holding();
    run(w, 3);
    const p = boss.progress;
    w.player.z = 70; // well out of reach
    run(w, 2);
    expect(boss.progress).toBeGreaterThan(p - 2 / TARGETS.boss.captureDecaySeconds! - 0.01);
    expect(boss.progress).toBeLessThan(p);
  });

  it("defeating it completes q-boss, drops parts, and it returns later", () => {
    const { w, boss } = holding();
    run(w, SIM_DT * 2); // tentacles attach (attaching starts progress at 0)
    boss.progress = 0.99;
    run(w, 1);
    expect(w.targets.includes(boss)).toBe(false);
    expect(w.events.some((e) => e.type === "bossDefeated")).toBe(true);
    expect(isDone(w.progress, "q-boss")).toBe(true);
    expect(w.progress.cargo.find((d) => d.type === "boss")?.reward.parts).toBe(5);
    expect(w.progress.banked.parts).toBe(10); // q-boss reward
    expect(w.progress.spawnCooldowns["reactor-boss0"]).toBeGreaterThan(170);
    expect(w.tentacles.every((t) => t !== boss)).toBe(true);
  });
});

describe("reactor repair", () => {
  it("needs the warden defeated plus parts and biomass; one transaction, once", () => {
    const p = lateGame();
    p.banked = { biomass: 1000, genetic: 0, parts: 50, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0, glass: 0, spores: 0, moonstone: 0, bogiron: 0, silk: 0 };
    expect(repairReactor(p)).toEqual({ ok: false, reason: "requirements" });
    expect(p.banked.parts).toBe(50);
    p.quests["q-boss"] = { count: 1, done: true };
    expect(reactorRequirements(p).every((r) => r.met)).toBe(true);
    expect(repairReactor(p)).toEqual({ ok: true });
    expect(p.banked).toMatchObject({ biomass: 700, parts: 35 });
    expect(p.reactorRepaired).toBe(true);
    expect(repairReactor(p)).toEqual({ ok: false, reason: "done" });
    expect(p.banked.parts).toBe(35);
  });

  it("the game action emits the completion event; the console is reachable", () => {
    const p = lateGame();
    p.quests["q-boss"] = { count: 1, done: true };
    p.banked = { biomass: 300, genetic: 0, parts: 15, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0, glass: 0, spores: 0, moonstone: 0, bogiron: 0, silk: 0 };
    const w = createWorld(FACILITY, p);
    w.player.x = REACTOR.x;
    w.player.z = REACTOR.z - 2;
    expect(nearReactor(w)).toBe(true);
    expect(repair(w).ok).toBe(true);
    expect(w.events.some((e) => e.type === "reactorRepaired")).toBe(true);
  });

  it("the parts it needs come from the warden and its quest alone (no rare drops required)", () => {
    expect((TARGETS.boss.reward.parts ?? 0) + 10).toBeGreaterThanOrEqual(REACTOR.repair.cost.parts);
  });
});

describe("play time and saves", () => {
  it("play time counts simulation time only", () => {
    const w = createWorld(FACILITY, newProgress(FACILITY));
    const loop = new FixedLoop((dt) => stepWorld(w, dt), { hz: 30, maxStepsPerFrame: 5 });
    loop.frame(0);
    loop.frame(1000);
    loop.pause("hidden");
    loop.frame(10_000_000);
    loop.resume("hidden");
    loop.frame(10_000_000);
    expect(w.progress.playSeconds).toBeLessThan(0.2);
    expect(w.progress.playSeconds).toBeGreaterThan(0);
  });

  it("migrates v7 saves, and round-trips completion", () => {
    const v7 = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v7.schemaVersion = 7;
    delete v7.progress.reactorRepaired;
    delete v7.progress.playSeconds;
    const parsed = parseSave(v7)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress).toMatchObject({ reactorRepaired: false, playSeconds: 0 });

    const p = lateGame();
    p.reactorRepaired = true;
    p.playSeconds = 4321.5;
    expect(parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!.progress)
      .toMatchObject({ reactorRepaired: true, playSeconds: 4321.5 });
  });

  it("a boss drop in cargo survives save and reload", () => {
    const p = lateGame();
    p.cargo.push({ type: "boss", weight: 0, reward: { ...TARGETS.boss.reward } });
    const parsed = parseSave(JSON.parse(JSON.stringify(toSaveFile(p, defaultSettings()))))!;
    expect(parsed.progress.cargo[0]).toMatchObject({ type: "boss", reward: { parts: 5 } });
  });
});

describe("warden review regressions", () => {
  it("fights back against a captor standing in the doorway", () => {
    const { w, boss } = arena(0, 75.5, { capture: true });
    w.stats.captureRadius = 6;
    boss.x = 0;
    boss.z = 79;
    b(boss).chargeCooldown = 99;
    // Security-sector guards spawn near this doorway; keep the tentacles on the warden.
    w.targets = w.targets.filter((t) => t === boss || Math.hypot(t.x, t.z - 75.5) > 8);
    run(w, SIM_DT * 3);
    expect(boss.held).toBe(true);
    expect(b(boss).state).not.toBe("idle");
  });

  it("frees all but one tentacle once out of reach past grace", () => {
    const { w, boss } = arena(0, 81.5, { capture: true });
    w.stats.captureRadius = 6;
    w.stats.tentacles = 3;
    b(boss).state = "recover";
    b(boss).timer = 1e9;
    run(w, 1);
    expect(w.tentacles.filter((t) => t === boss)).toHaveLength(3);
    w.player.z = 60; // retreat into security
    run(w, 0.6);
    expect(w.tentacles.filter((t) => t === boss)).toHaveLength(1);
    expect(boss.progress).toBeGreaterThan(0);
  });

  it("pillars block the slam", () => {
    const { w, boss } = arena(0, 80);
    // Pillar at (5.5, 81): boss on one side, player tucked behind it.
    boss.x = 3.6;
    boss.z = 81;
    w.player.x = 7.0;
    w.player.z = 81;
    b(boss).state = "slamWindup";
    b(boss).timer = 0.01;
    run(w, SIM_DT * 2);
    expect(w.progress.player.health).toBe(10_000);
  });

  it("extra tentacles have diminishing returns", () => {
    expect(holderPower(1)).toBe(1);
    expect(holderPower(6)).toBeLessThan(3.1);
    expect(holderPower(3)).toBeGreaterThan(holderPower(2));
  });

  it("repair needs the player at the console", () => {
    const p = lateGame();
    p.quests["q-boss"] = { count: 1, done: true };
    p.banked = { biomass: 300, genetic: 0, parts: 15, mutagen: 0, crystals: 0, alloy: 0, amber: 0, shards: 0, pearls: 0, glass: 0, spores: 0, moonstone: 0, bogiron: 0, silk: 0 };
    const w = createWorld(FACILITY, p);
    expect(repair(w)).toEqual({ ok: false, reason: "notAtConsole" });
    expect(p.reactorRepaired).toBe(false);
  });
});
