import { describe, expect, it } from "vitest";
import { FACILITY, zoneAt } from "../src/content/map";
import { goalTarget, QUESTS } from "../src/content/quests";
import { doorRequirements, unlockDoor } from "../src/domain/doors";
import { addXp, levelForXp, levelProgress, xpForLevel } from "../src/domain/levels";
import { newProgress } from "../src/domain/progress";
import { activeQuests, applyQuestEvent, isDone } from "../src/domain/quests";
import { buyUpgrade, openDoor } from "../src/game/actions";
import { hasLineOfSight } from "../src/game/geometry";
import { stepWorld } from "../src/game/step";
import { createWorld } from "../src/game/world";
import { testWorld } from "./helpers";

const door = (id: string) => FACILITY.doors.find((d) => d.id === id)!;

describe("levels", () => {
  it("maps XP to levels and reports every level crossed", () => {
    const p = newProgress(FACILITY);
    expect(levelForXp(0)).toBe(1);
    expect(addXp(p, 59)).toEqual([]);
    expect(addXp(p, 1)).toEqual([2]);
    expect(addXp(p, 1000)).toEqual([3, 4, 5]);
  });

  it("never runs out of levels: past the table each span is 1.35x the last", () => {
    expect(levelForXp(4999)).toBe(9);
    expect(levelForXp(5000)).toBe(10);
    // Level 10's span was 1400, so level 11 needs 1890 more.
    expect(xpForLevel(11)).toBe(6890);
    expect(xpForLevel(12)).toBe(6890 + 2552);
    expect(levelForXp(6889)).toBe(10);
    expect(levelForXp(6890)).toBe(11);
    for (let l = 2; l < 60; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l) - 0.5)).toBe(l - 1);
    }
    expect(Number.isFinite(xpForLevel(1000))).toBe(true);
    const lp = levelProgress(xpForLevel(30) + 10);
    expect(lp).toEqual({ level: 30, into: 10, span: xpForLevel(31) - xpForLevel(30) });
  });
});

describe("quests", () => {
  it("has unique IDs and prerequisites that exist and form no cycles", () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS.length);
    const order = new Map(QUESTS.map((q, i) => [q.id, i]));
    for (const q of QUESTS) {
      for (const pre of q.prereqs) {
        expect(ids.has(pre)).toBe(true);
        // Prereqs listed earlier implies the graph is acyclic.
        expect(order.get(pre)!).toBeLessThan(order.get(q.id)!);
      }
    }
  });

  it("every door's quest requirement exists", () => {
    const ids = new Set(QUESTS.map((q) => q.id));
    for (const d of FACILITY.doors) for (const q of d.requirements.quests ?? []) expect(ids.has(q)).toBe(true);
  });

  it("only counts progress while active and grants rewards exactly once", () => {
    const p = newProgress(FACILITY);
    // Bank events before q-first-bank is active don't count.
    applyQuestEvent(p, { kind: "bank", currency: "biomass", amount: 100 });
    expect(p.quests["q-first-bank"]).toBeUndefined();

    for (let i = 0; i < 4; i++) applyQuestEvent(p, { kind: "capture", target: "worker" });
    expect(isDone(p, "q-first-catch")).toBe(false);
    const out = applyQuestEvent(p, { kind: "capture", target: "worker" });
    expect(out.completed.map((q) => q.id)).toEqual(["q-first-catch"]);
    expect(p.banked.biomass).toBe(10);
    expect(p.xp).toBe(10);

    // Further captures don't re-grant.
    applyQuestEvent(p, { kind: "capture", target: "worker" });
    expect(p.banked.biomass).toBe(10);
    expect(activeQuests(p).map((q) => q.id)).toEqual(["q-first-bank"]);
  });

  it("ignores captures of the wrong type", () => {
    const p = newProgress(FACILITY);
    for (let i = 0; i < 10; i++) applyQuestEvent(p, { kind: "capture", target: "runner" });
    expect(p.quests["q-first-catch"]).toBeUndefined();
  });

  it("caps counts at the goal", () => {
    const p = newProgress(FACILITY);
    p.quests["q-first-catch"] = { count: 5, done: true };
    applyQuestEvent(p, { kind: "bank", currency: "biomass", amount: 1000 });
    expect(p.quests["q-first-bank"]!.count).toBe(goalTarget({ kind: "bank", currency: "biomass", count: 30 }));
  });
});

describe("doors", () => {
  it("lists every requirement with progress", () => {
    const p = newProgress(FACILITY);
    const reqs = doorRequirements(p, door("door-service"));
    expect(reqs.map((r) => r.met)).toEqual([false, false, false]);
    expect(reqs.map((r) => r.progress)).toEqual(["Lv 1 / 2", "Not done", "0 / 60"]);
  });

  it("never deducts anything unless every requirement is met", () => {
    const p = newProgress(FACILITY);
    p.banked.biomass = 500;
    p.xp = 100; // level 2
    expect(unlockDoor(p, door("door-service"))).toEqual({ ok: false, reason: "requirements" });
    expect(p.banked.biomass).toBe(500);
    p.quests["q-first-upgrade"] = { count: 1, done: true };
    expect(unlockDoor(p, door("door-service"))).toEqual({ ok: true });
    expect(p.banked.biomass).toBe(440);
    expect(unlockDoor(p, door("door-service"))).toEqual({ ok: false, reason: "already" });
    expect(p.banked.biomass).toBe(440);
  });

  it("a locked door blocks movement and sight; opening it clears both", () => {
    const p = newProgress(FACILITY);
    const w = createWorld(FACILITY, p);
    expect(hasLineOfSight(0, 16, 0, 19, w.obstacles)).toBe(false);
    w.player.x = 0;
    w.player.z = 15;
    for (let i = 0; i < 90; i++) {
      w.input.z = 1;
      stepWorld(w);
    }
    expect(w.player.z).toBeLessThan(17);

    p.banked.biomass = 60;
    p.xp = 100;
    p.quests["q-first-upgrade"] = { count: 1, done: true };
    expect(openDoor(w, door("door-service")).ok).toBe(true);
    expect(hasLineOfSight(0, 16, 0, 19, w.obstacles)).toBe(true);
    for (let i = 0; i < 90; i++) {
      w.input.z = 1;
      stepWorld(w);
    }
    expect(zoneAt(FACILITY, w.player.x, w.player.z)?.id).toBe("service");
    expect(w.events.some((e) => e.type === "doorUnlocked")).toBe(true);
  });

  it("opening the door advances the matching quest", () => {
    const p = newProgress(FACILITY);
    for (const id of ["q-first-catch", "q-first-bank", "q-first-upgrade"]) p.quests[id] = { count: 1, done: true };
    p.banked.biomass = 60;
    p.xp = 100;
    const w = createWorld(FACILITY, p);
    openDoor(w, door("door-service"));
    expect(isDone(p, "q-open-service")).toBe(true);
  });
});

describe("tutorial chain through actions", () => {
  it("buying an upgrade completes q-first-upgrade when it is active", () => {
    const p = newProgress(FACILITY);
    p.quests["q-first-catch"] = { count: 5, done: true };
    p.quests["q-first-bank"] = { count: 30, done: true };
    p.banked.biomass = 100;
    const w = createWorld(FACILITY, p);
    expect(buyUpgrade(w, "capturePower").ok).toBe(true);
    expect(isDone(p, "q-first-upgrade")).toBe(true);
    expect(w.events.map((e) => e.type)).toContain("questComplete");
  });
});

describe("runners", () => {
  it("flee from a visible player and stop when out of range", () => {
    const w = testWorld([[2, 0]], [], "runner");
    const t = w.targets[0]!;
    t.idle = 0;
    w.player.x = 0;
    w.player.z = 0;
    // Keep the player out of capture reach logic: only look at movement.
    w.stats.captureRadius = 0;
    for (let i = 0; i < 15; i++) stepWorld(w);
    expect(t.fleeing).toBe(true);
    expect(t.x).toBeGreaterThan(2.5);
    for (let i = 0; i < 60; i++) stepWorld(w);
    expect(t.x).toBeGreaterThanOrEqual(4 - 0.2);
  });

  it("don't notice the player through walls", () => {
    const w = testWorld([[2, 0]], [{ minX: 0.8, maxX: 1.2, minZ: -2, maxZ: 2 }], "runner");
    const t = w.targets[0]!;
    t.idle = 1e9;
    w.player.x = 0;
    w.player.z = 0;
    for (let i = 0; i < 15; i++) stepWorld(w);
    expect(t.fleeing).toBe(false);
    expect(t.x).toBeCloseTo(2, 5);
  });

  it("stop fleeing while held by a tentacle", () => {
    const w = testWorld([[1, 0]], [], "runner");
    const t = w.targets[0]!;
    w.player.x = 0;
    w.player.z = 0;
    stepWorld(w);
    expect(t.held).toBe(true);
    const x = t.x;
    for (let i = 0; i < 10; i++) stepWorld(w);
    expect(t.x).toBeCloseTo(x, 5);
    expect(t.fleeing).toBe(false);
  });
});

describe("map", () => {
  it("spawn points sit inside a zone and outside every solid", () => {
    const solids = [...FACILITY.walls, ...FACILITY.props, ...FACILITY.doors.map((d) => d.rect)];
    for (const s of FACILITY.spawns) {
      expect(zoneAt(FACILITY, s.x, s.z), s.id).not.toBeNull();
      for (const r of solids) {
        const inside = s.x > r.minX && s.x < r.maxX && s.z > r.minZ && s.z < r.maxZ;
        expect(inside, s.id).toBe(false);
      }
    }
  });

  it("spawn IDs are unique", () => {
    const ids = FACILITY.spawns.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("player spawn and base are in containment", () => {
    expect(zoneAt(FACILITY, FACILITY.playerSpawn.x, FACILITY.playerSpawn.z)?.id).toBe("containment");
    expect(zoneAt(FACILITY, FACILITY.base.x, FACILITY.base.z)?.id).toBe("containment");
  });
});


describe("review regressions", () => {
  it("a migrated save with every upgrade maxed can still finish the tutorial", () => {
    const p = newProgress(FACILITY);
    for (const id of Object.keys(p.upgrades) as Array<keyof typeof p.upgrades>) p.upgrades[id] = 99;
    for (let i = 0; i < 5; i++) applyQuestEvent(p, { kind: "capture", target: "worker" });
    applyQuestEvent(p, { kind: "bank", currency: "biomass", amount: 30 });
    expect(isDone(p, "q-first-upgrade")).toBe(true);
  });

  it("buying a mutation before the quest is active still counts later", () => {
    const p = newProgress(FACILITY);
    p.upgrades.capturePower = 1;
    for (let i = 0; i < 5; i++) applyQuestEvent(p, { kind: "capture", target: "worker" });
    applyQuestEvent(p, { kind: "bank", currency: "biomass", amount: 30 });
    expect(isDone(p, "q-first-upgrade")).toBe(true);
  });

  it("runners can't flee out of their home zone through an open door", () => {
    const p = newProgress(FACILITY);
    p.unlockedDoors.push("door-service");
    const w = createWorld(FACILITY, p);
    const r = w.targets.find((t) => t.def.id === "runner")!;
    r.x = 0;
    r.z = 19;
    w.player.x = 0;
    w.player.z = 22; // chase it toward the doorway
    w.stats.captureRadius = 0;
    for (let i = 0; i < 120; i++) stepWorld(w);
    expect(zoneAt(FACILITY, r.x, r.z)?.id).toBe("service");
  });
});
