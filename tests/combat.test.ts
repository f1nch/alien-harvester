import { describe, expect, it } from "vitest";
import { FACILITY } from "../src/content/map";
import { TARGETS } from "../src/content/targets";
import { newProgress } from "../src/domain/progress";
import { applyQuestEvent, isDone } from "../src/domain/quests";
import { stepWorld } from "../src/game/step";
import { BASE_HEAL_PER_SEC, die, RESPAWN_INVULNERABLE } from "../src/game/systems/combat";
import { SIM_DT, type World } from "../src/game/world";
import { defaultSettings, parseSave, SCHEMA_VERSION, toSaveFile } from "../src/persistence/schema";
import { testWorld } from "./helpers";

const G = TARGETS.guard.combat!;
const run = (w: World, seconds: number, input = { x: 0, z: 0 }) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    w.input.x = input.x;
    w.input.z = input.z;
    stepWorld(w);
  }
};

/** Guard at (gx, 0), player at the origin, capture disabled so only combat runs. */
function guardWorld(gx: number, props: Parameters<typeof testWorld>[1] = []) {
  const w = testWorld([[gx, 0]], props, "guard");
  w.player.x = 0;
  w.player.z = 0;
  w.stats.captureRadius = 0;
  const g = w.targets[0]!;
  g.idle = 0;
  return { w, g };
}

describe("guards", () => {
  it("notice a visible player, close in, and strike after a windup", () => {
    const { w, g } = guardWorld(4);
    const hp = w.progress.player.health;
    run(w, 0.2);
    expect(g.ai).toBe("chase");
    run(w, 1.5);
    expect(["windup", "recover"]).toContain(g.ai);
    run(w, G.windupSeconds + 0.1);
    expect(w.progress.player.health).toBe(hp - G.damage);
  });

  it("deal no damage before the windup completes", () => {
    const { w, g } = guardWorld(1.2);
    run(w, SIM_DT);
    expect(g.ai).toBe("windup");
    run(w, G.windupSeconds - 0.1);
    expect(w.progress.player.health).toBe(100);
  });

  it("miss if the player steps out of reach during the windup", () => {
    const { w, g } = guardWorld(1.2);
    run(w, SIM_DT);
    expect(g.ai).toBe("windup");
    w.player.x = -3; // dodge
    run(w, G.windupSeconds + 0.05);
    expect(w.progress.player.health).toBe(100);
    expect(w.events.some((e) => e.type === "strike" && !e.hit)).toBe(true);
  });

  it("wait out the cooldown between strikes", () => {
    const { w } = guardWorld(1.2);
    run(w, G.windupSeconds + 0.1);
    expect(w.progress.player.health).toBe(100 - G.damage);
    run(w, G.cooldownSeconds - 0.2);
    expect(w.progress.player.health).toBe(100 - G.damage);
  });

  it("don't see the player through walls", () => {
    const { w, g } = guardWorld(3, [{ minX: 1.4, maxX: 1.6, minZ: -3, maxZ: 3 }]);
    g.idle = 1e9;
    run(w, 1);
    expect(g.ai).toBe("patrol");
  });

  it("give up past their leash and walk home", () => {
    const { w, g } = guardWorld(4);
    run(w, 0.2);
    expect(g.ai).toBe("chase");
    // Drag the guard far from home as if lured.
    g.x = 4 - G.leashRadius - 1;
    run(w, SIM_DT * 2);
    expect(g.ai).toBe("return");
    w.player.x = 50; // out of sight entirely
    w.player.z = 0;
    run(w, 12);
    expect(Math.hypot(g.x - 4, g.z)).toBeLessThan(1.5);
    expect(g.ai).toBe("patrol");
  });

  it("can't move while held but can still strike", () => {
    const w = testWorld([[1.5, 0]], [], "guard");
    w.player.x = 0;
    w.player.z = 0;
    const g = w.targets[0]!;
    run(w, SIM_DT * 2);
    expect(g.held).toBe(true);
    const x = g.x;
    run(w, G.windupSeconds + 0.1);
    expect(g.x).toBeCloseTo(x, 5);
    expect(w.progress.player.health).toBe(100 - G.damage);
  });

  it("standing still while capturing gets you hit: held guards creep closer", () => {
    const w = testWorld([[1.85, 0]], [], "guard");
    w.player.x = 0;
    w.player.z = 0;
    run(w, 6);
    expect(w.progress.player.health).toBeLessThan(100);
  });

  it("backing off while capturing (kiting) avoids damage", () => {
    const w = testWorld([[1.85, 0]], [], "guard");
    w.player.x = 0;
    w.player.z = 0;
    for (let i = 0; i < 6 / SIM_DT && w.progress.cargo.length === 0; i++) {
      const g = w.targets[0];
      // Keep the guard between strike reach and capture reach.
      const d = g ? Math.hypot(g.x - w.player.x, g.z - w.player.z) : 99;
      w.input.x = d < 1.8 ? -0.25 : 0;
      w.input.z = 0;
      stepWorld(w);
    }
    expect(w.progress.cargo.map((d) => d.type)).toEqual(["guard"]);
    expect(w.progress.player.health).toBe(100);
  });

  it("strikes need line of sight when they land", () => {
    const { w, g } = guardWorld(1.2);
    run(w, SIM_DT);
    expect(g.ai).toBe("windup");
    // A wall drops between them mid-windup (stands in for ducking behind cover).
    w.obstacles.push({ minX: 0.5, maxX: 0.7, minZ: -2, maxZ: 2 });
    run(w, G.windupSeconds + 0.05);
    expect(w.progress.player.health).toBe(100);
  });

  it("a guard blocked on its way home gives up and patrols instead of staying passive", () => {
    const { w, g } = guardWorld(0);
    g.homeX = 0;
    g.homeZ = 0;
    // A wall between the guard and home that it can't path around in a straight line.
    w.obstacles.push({ minX: 2, maxX: 3, minZ: -6, maxZ: 6 });
    g.x = 5;
    g.z = 0;
    g.ai = "return";
    g.aiTimer = (2 * G.leashRadius) / G.chaseSpeed;
    w.player.x = 50;
    run(w, g.aiTimer + 1);
    expect(g.ai).toBe("patrol");
  });

  it("guards notice a player standing in the doorway just outside their zone", () => {
    const zone = { minX: -20, maxX: 20, minZ: 0, maxZ: 20 };
    const w = testWorld([[0, 2]], [], "guard", { zones: [{ id: "security", name: "S", rect: zone, tint: [1, 1, 1] }] });
    const g = w.targets[0]!;
    g.zoneRect = zone;
    g.idle = 0;
    w.stats.captureRadius = 0;
    w.player.x = 0;
    w.player.z = -0.5; // just outside the zone edge
    run(w, 0.2);
    expect(g.ai).not.toBe("patrol");
  });
});

describe("death", () => {
  const withCargo = () => {
    const w = testWorld([]);
    w.progress.cargo.push({ type: "worker", weight: 2, reward: { biomass: 3 } }, { type: "worker", weight: 2, reward: { biomass: 3 } });
    w.progress.banked.biomass = 50;
    w.progress.xp = 70;
    w.progress.upgrades.moveSpeed = 2;
    w.player.x = 5;
    w.player.z = 5;
    return w;
  };

  it("dying with no cargo does not spend the first-death exemption", () => {
    const w = testWorld([]);
    w.progress.player.health = 0;
    stepWorld(w);
    expect(w.events.find((x) => x.type === "died")).toMatchObject({ forgiven: false, lost: [] });
    expect(w.progress.firstDeathForgiven).toBe(false);
  });

  it("the first death is forgiven: cargo kept, flagged as used", () => {
    const w = withCargo();
    w.progress.player.health = 0;
    stepWorld(w);
    const e = w.events.find((x) => x.type === "died");
    expect(e).toMatchObject({ forgiven: true, lost: [] });
    expect(w.progress.cargo).toHaveLength(2);
    expect(w.progress.firstDeathForgiven).toBe(true);
  });

  it("later deaths drop unbanked cargo only and return the player to base healed", () => {
    const w = withCargo();
    w.progress.firstDeathForgiven = true;
    w.progress.player.health = 0;
    stepWorld(w);
    const e = w.events.find((x) => x.type === "died");
    expect(e?.type === "died" && e.lost).toHaveLength(2);
    expect(w.progress.cargo).toHaveLength(0);
    expect(w.progress.banked.biomass).toBe(50);
    expect(w.progress.xp).toBe(70);
    expect(w.progress.upgrades.moveSpeed).toBe(2);
    expect([w.player.x, w.player.z]).toEqual([w.map.base.x, w.map.base.z]);
    expect(w.progress.player.health).toBe(w.stats.maxHealth);
  });

  it("cancels capture progress and releases tentacles", () => {
    const w = testWorld([[1, 0]]);
    w.player.x = 0;
    w.player.z = 0;
    run(w, 0.5);
    const t = w.tentacles.find(Boolean)!;
    die(w);
    expect(w.tentacles.every((x) => x === null)).toBe(true);
    expect(t.held).toBe(false);
    expect(t.progress).toBe(0);
  });

  it("grants brief invulnerability after respawn", () => {
    const { w } = guardWorld(1.2);
    w.progress.firstDeathForgiven = true;
    die(w);
    w.player.x = 0;
    w.player.z = 0;
    w.targets[0]!.ai = "windup";
    w.targets[0]!.aiTimer = 0.01;
    run(w, 0.1);
    expect(w.progress.player.health).toBe(100);
    expect(w.player.invulnerable).toBeGreaterThan(RESPAWN_INVULNERABLE - 0.5);
  });
});

describe("healing", () => {
  it("heals quickly at base and slowly elsewhere after a delay", () => {
    const w = testWorld([]);
    w.progress.player.health = 40;
    w.player.x = w.map.base.x;
    w.player.z = w.map.base.z;
    run(w, 1);
    expect(w.progress.player.health).toBeCloseTo(40 + BASE_HEAL_PER_SEC, 0);

    w.player.x = 10;
    w.player.z = 10;
    w.progress.player.health = 40;
    w.player.sinceHit = 0;
    run(w, 2);
    expect(w.progress.player.health).toBe(40);
    run(w, 4);
    expect(w.progress.player.health).toBeGreaterThan(40);
  });
});

describe("guard quest and saves", () => {
  it("both guard types count toward q-guards", () => {
    const p = newProgress(FACILITY);
    for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade", "q-open-service", "q-genetic", "q-open-security"]) {
      p.quests[id] = { count: 999, done: true };
    }
    for (let i = 0; i < 5; i++) applyQuestEvent(p, { kind: "capture", target: "guard" });
    applyQuestEvent(p, { kind: "capture", target: "worker" });
    for (let i = 0; i < 5; i++) applyQuestEvent(p, { kind: "capture", target: "armoredGuard" });
    expect(isDone(p, "q-guards")).toBe(true);
  });

  it("migrates v3 saves with the first-death exemption still available", () => {
    const v3 = JSON.parse(JSON.stringify(toSaveFile(newProgress(FACILITY), defaultSettings())));
    v3.schemaVersion = 3;
    delete v3.progress.firstDeathForgiven;
    const parsed = parseSave(v3, FACILITY)!;
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.progress.firstDeathForgiven).toBe(false);
  });

  it("never loads a dead player", () => {
    const p = newProgress(FACILITY);
    p.player.health = 0;
    expect(parseSave(toSaveFile(p, defaultSettings()), FACILITY)!.progress.player.health).toBe(100);
  });
});
