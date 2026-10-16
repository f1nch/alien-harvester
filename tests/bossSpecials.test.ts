import { describe, expect, it } from "vitest";
import { BIOMES } from "../src/content/biomes";
import type { BossSpecial } from "../src/content/reactor";
import { TARGETS, type TargetTypeId } from "../src/content/targets";
import { newProgress } from "../src/domain/progress";
import { stepWorld } from "../src/game/step";
import { BOSS_RADIUS, bossUntargetable, hazardCovers, updateBoss, type Hazard } from "../src/game/systems/boss";
import { createWorld, retireTarget, SIM_DT, type TargetEntity, type World } from "../src/game/world";

const BOSSES = (Object.keys(TARGETS) as TargetTypeId[]).filter((id) => TARGETS[id].behavior === "boss");

/** The boss's floor with every door open, the player standing `gap` in front of it, built to survive. */
function fight(bossId: TargetTypeId, gap = 6) {
  const i = BIOMES.findIndex((b) => b.map.spawns.some((s) => s.type === bossId));
  const def = BIOMES[i]!;
  const p = newProgress(def.map);
  p.depth = i;
  p.floor = def.id;
  p.visits[def.id] = 1;
  for (const d of def.map.doors) p.unlockedDoors.push(d.id);
  p.firstDeathForgiven = true;
  const w = createWorld(def.map, p);
  const boss = w.targets.find((t) => t.def.id === bossId)!;
  w.player.x = w.player.prevX = boss.x;
  w.player.z = w.player.prevZ = Math.max(boss.zoneRect.minZ + 1, boss.z - gap);
  w.progress.player.health = 1e6;
  w.stats.maxHealth = 1e6;
  w.stats.captureRadius = 0;
  return { w, boss };
}

function special<K extends BossSpecial["kind"]>(t: TargetEntity, kind: K): Extract<BossSpecial, { kind: K }> {
  const s = t.def.bossTuning!.special!;
  expect(s.kind).toBe(kind);
  return s as Extract<BossSpecial, { kind: K }>;
}

/** Ready the signature move and let the boss choose it. */
function cast(w: World, boss: TargetEntity): void {
  const b = boss.boss!;
  b.state = "chase";
  b.specialCooldown = 0;
  b.chargeCooldown = 99;
  stepWorld(w);
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) stepWorld(w);
};
const health = (w: World) => w.progress.player.health;

describe("every floor boss fights differently", () => {
  it("each boss after the warden has its own signature move", () => {
    // A move and its variant (scattered pods, a dive from the sky) count as different moves.
    const kinds = BOSSES.filter((id) => id !== "boss").map((id) => {
      const s = TARGETS[id].bossTuning?.special;
      if (!s) return undefined;
      return s.kind + (s.kind === "icefall" && s.scatter ? ":scatter" : "") + (s.kind === "burrow" && s.fly ? ":fly" : "");
    });
    expect(kinds.every(Boolean)).toBe(true);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(TARGETS.boss.bossTuning?.special).toBeUndefined();
  });

  it("the warden never lays a hazard or casts", () => {
    const { w, boss } = fight("boss", 5);
    run(w, 20);
    expect(boss.boss!.hazards).toHaveLength(0);
    expect(boss.boss!.state).not.toBe("casting");
  });

  for (const id of BOSSES.filter((b) => b !== "boss")) {
    it(`${TARGETS[id].name} uses its move in a real fight, and it lands or misses without breaking the fight`, () => {
      // Start outside the move's minimum range (the whirlpool is for creatures keeping their distance).
      const { w, boss } = fight(id, 5 + (TARGETS[id].bossTuning?.special?.minRange ?? 0));
      // A ranged move: hold off the opening charge so the boss is still at range when it's ready.
      if ((TARGETS[id].bossTuning?.special?.minRange ?? 0) > 3) boss.boss!.chargeCooldown = 99;
      const seen = new Set<string>();
      for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
        stepWorld(w);
        if (boss.boss!.specialActive) seen.add("special");
        if (!w.targets.includes(boss)) break;
      }
      expect(seen.has("special")).toBe(true);
      expect(Number.isFinite(boss.x) && Number.isFinite(boss.z)).toBe(true);
      // Never leaves its hall, whatever the move did.
      expect(boss.x).toBeGreaterThanOrEqual(boss.zoneRect.minX);
      expect(boss.x).toBeLessThanOrEqual(boss.zoneRect.maxX);
      expect(boss.z).toBeGreaterThanOrEqual(boss.zoneRect.minZ);
      expect(boss.z).toBeLessThanOrEqual(boss.zoneRect.maxZ);
    });
  }
});

describe("hazards", () => {
  it("circles and lanes cover what they draw", () => {
    const c: Hazard = { shape: "circle", style: "ice", x: 0, z: 0, radius: 1.5, timer: 1, total: 1, damage: 1, cast: 1 };
    expect(hazardCovers(c, 1.4, 0)).toBe(true);
    expect(hazardCovers(c, 1.6, 0)).toBe(false);
    const l: Hazard = { shape: "lane", style: "lash", x: 0, z: 0, dirX: 0, dirZ: 1, length: 10, halfWidth: 0.9, timer: 1, total: 1, damage: 1, cast: 1 };
    expect(hazardCovers(l, 0.8, 5)).toBe(true);
    expect(hazardCovers(l, 1, 5)).toBe(false);
    expect(hazardCovers(l, 0, -0.5)).toBe(false);
    expect(hazardCovers(l, 0, 10.5)).toBe(false);
  });

  it("damage scales with the floor's depth, like the slam's", () => {
    const { w, boss } = fight("cryoSentinel", 5);
    const S = special(boss, "icefall");
    cast(w, boss);
    const before = health(w);
    run(w, S.delay + 0.05); // just the first spike, aimed at where the player stood
    expect(before - health(w)).toBe(Math.max(1, Math.round(S.damage * w.biome.scale.damage)));
  });
});

describe("cryo sentinel: icefall", () => {
  it("lays spikes around the player, the first on them; they land after the windup and chill", () => {
    const { w, boss } = fight("cryoSentinel", 5);
    const S = special(boss, "icefall");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz).toHaveLength(S.count);
    expect(hazardCovers(hz[0]!, w.player.x, w.player.z)).toBe(true);
    const before = health(w);
    run(w, S.delay - 0.1);
    expect(health(w)).toBe(before);
    run(w, 0.2);
    expect(health(w)).toBeLessThan(before);
    expect(w.chill).toBeGreaterThan(0);
  });

  it("stepping out of the rings dodges every spike", () => {
    const { w, boss } = fight("cryoSentinel", 5);
    const S = special(boss, "icefall");
    cast(w, boss);
    // Walk far enough that no ring (spread + radius) can reach, staying in the hall.
    const r = boss.zoneRect;
    w.player.x = w.player.x - r.minX > r.maxX - w.player.x ? r.minX + 0.5 : r.maxX - 0.5;
    w.player.z = boss.z; // also out of slam reach? keep the boss busy elsewhere
    boss.boss!.chargeCooldown = 99;
    const covered = boss.boss!.hazards.some((h) => hazardCovers(h, w.player.x, w.player.z));
    expect(covered).toBe(false);
    const hits: boolean[] = [];
    for (let i = 0; i < Math.round((S.delay + S.count * S.stagger + 0.2) / SIM_DT); i++) {
      w.events.length = 0;
      stepWorld(w);
      for (const e of w.events) if (e.type === "hazardLanded") hits.push(e.hit);
    }
    expect(hits).toHaveLength(S.count);
    expect(hits.every((h) => !h)).toBe(true);
  });
});

describe("alpha specimen: frenzy", () => {
  it("chains its extra charges with the shorter windup, then is stunned", () => {
    const { w, boss } = fight("alphaSpecimen", 8);
    const S = special(boss, "frenzy");
    cast(w, boss);
    const b = boss.boss!;
    expect(b.state).toBe("chargeWindup");
    expect(b.chain).toBe(S.extraCharges);
    expect(b.chargeLength).toBe(S.distance);
    // Finish the current charge in open floor: it wheels round for the next.
    b.state = "charging";
    b.travelled = boss.def.bossTuning!.chargeDistance;
    b.dirX = 0;
    b.dirZ = 0;
    updateBoss(w, boss, SIM_DT);
    expect(b.state).toBe("chargeWindup");
    expect(b.total).toBe(S.windup);
    expect(b.chain).toBe(S.extraCharges - 1);
    b.chain = 0;
    b.state = "charging";
    b.travelled = boss.def.bossTuning!.chargeDistance;
    updateBoss(w, boss, SIM_DT);
    expect(b.state).toBe("stunned");
  });

  it("ramming a wall ends the frenzy at once", () => {
    const { w, boss } = fight("alphaSpecimen", 8);
    cast(w, boss);
    const b = boss.boss!;
    // Point it straight at the hall's back wall, right beside it.
    boss.z = boss.zoneRect.maxZ - BOSS_RADIUS - 0.01;
    b.state = "charging";
    b.travelled = 0;
    b.dirX = 0;
    b.dirZ = 1;
    updateBoss(w, boss, SIM_DT);
    expect(b.state).toBe("stunned");
    expect(b.chain).toBe(0);
  });
});

describe("overseer mech: barrage", () => {
  it("lays a line of shells through the player that land one after another", () => {
    const { w, boss } = fight("overseerMech", 7);
    const S = special(boss, "barrage");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz.length).toBeGreaterThan(2);
    expect(hz.length).toBeLessThanOrEqual(S.count);
    expect(hz.some((h) => hazardCovers(h, w.player.x, w.player.z))).toBe(true);
    for (let i = 1; i < hz.length; i++) expect(hz[i]!.timer).toBeGreaterThan(hz[i - 1]!.timer);
    const before = health(w);
    run(w, S.delay + S.count * S.stagger + 0.1);
    expect(health(w)).toBeLessThan(before);
  });
});

describe("hive queen: brood", () => {
  it("calls brood beside her after the cast, never more than her limit", () => {
    const { w, boss } = fight("hiveQueen", 6);
    const S = special(boss, "brood");
    cast(w, boss);
    expect(w.targets.filter((t) => t.brood)).toHaveLength(0);
    run(w, S.cast + 0.05);
    const brood = w.targets.filter((t) => t.brood);
    expect(brood).toHaveLength(S.count);
    expect(brood.every((t) => t.def.id === S.type)).toBe(true);
    for (const t of brood) expect(Math.hypot(t.x - boss.x, t.z - boss.z)).toBeLessThan(4);
    // Again and again: the hall never holds more than the limit.
    for (let k = 0; k < 4; k++) {
      cast(w, boss);
      run(w, S.cast + 0.05);
    }
    expect(w.targets.filter((t) => t.brood).length).toBeLessThanOrEqual(S.max);
  });

  it("brood never respawn and leave no spawn timer behind", () => {
    const { w, boss } = fight("hiveQueen", 6);
    const S = special(boss, "brood");
    cast(w, boss);
    run(w, S.cast + 0.05);
    const one = w.targets.find((t) => t.brood)!;
    w.targets.splice(w.targets.indexOf(one), 1);
    retireTarget(w, one);
    expect(Object.keys(w.progress.spawnCooldowns)).not.toContain("brood");
    expect(Object.keys(w.progress.spawnCooldowns)).not.toContain(one.spawnId);
  });
});

describe("sand wyrm: burrow", () => {
  it("dives out of reach, tunnels to the player, erupts under them, then is stunned and catchable", () => {
    const { w, boss } = fight("sandWyrm", 8);
    const S = special(boss, "burrow");
    w.stats.captureRadius = 30;
    cast(w, boss);
    run(w, S.cast + 0.05);
    const b = boss.boss!;
    expect(b.state).toBe("burrowed");
    expect(bossUntargetable(boss)).toBe(true);
    expect(boss.held).toBe(false);
    for (let i = 0; i < S.maxSeconds / SIM_DT && b.state === "burrowed"; i++) stepWorld(w);
    expect(b.state).toBe("erupting");
    const ring = b.hazards.find((h) => h.style === "erupt")!;
    expect(hazardCovers(ring, w.player.x, w.player.z)).toBe(true);
    const before = health(w);
    run(w, S.eruptWindup + 0.05);
    expect(health(w)).toBeLessThan(before);
    expect(b.state).toBe("stunned");
    stepWorld(w);
    expect(bossUntargetable(boss)).toBe(false);
  });

  it("held when it dives, its capture progress decays rather than vanishing", () => {
    const { w, boss } = fight("sandWyrm", 8);
    const S = special(boss, "burrow");
    w.stats.captureRadius = 30;
    run(w, 0.2);
    expect(w.tentacles.includes(boss)).toBe(true);
    boss.progress = 0.5;
    cast(w, boss);
    run(w, S.cast + 0.4);
    expect(boss.boss!.state).toBe("burrowed");
    expect(boss.held).toBe(false);
    const p = boss.progress;
    run(w, 0.2);
    expect(boss.progress).toBeLessThan(p);
    expect(boss.progress).toBeGreaterThan(0.4);
  });
});

describe("tide kraken: lash", () => {
  it("fans its arms at the player along lanes that stop at walls", () => {
    const { w, boss } = fight("tideKraken", 6);
    const S = special(boss, "lash");
    cast(w, boss);
    const hz = boss.boss!.hazards;
    expect(hz).toHaveLength(S.lanes);
    for (const h of hz) expect(h.shape === "lane" && h.length <= S.length).toBe(true);
    expect(hazardCovers(hz[Math.floor(S.lanes / 2)]!, w.player.x, w.player.z)).toBe(true);
    const before = health(w);
    run(w, S.delay + 0.05);
    expect(health(w)).toBeLessThan(before);
  });
});

describe("signature move review regressions", () => {
  const hazardHits = (w: World, seconds: number) => {
    let hits = 0;
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      w.events.length = 0;
      stepWorld(w);
      for (const e of w.events) if (e.type === "hazardLanded" && e.hit) hits++;
    }
    return hits;
  };

  it("the kraken's fanned arms hurt once up close, not once per arm", () => {
    const { w, boss } = fight("tideKraken", 1.5);
    const S = special(boss, "lash");
    cast(w, boss);
    expect(boss.boss!.hazards.filter((h) => hazardCovers(h, w.player.x, w.player.z)).length).toBeGreaterThan(1);
    const before = health(w);
    expect(hazardHits(w, S.delay + 0.05)).toBe(1);
    expect(before - health(w)).toBe(Math.max(1, Math.round(S.damage * w.biome.scale.damage)));
  });

  it("standing still in a barrage costs one shell, not every overlapping one", () => {
    const { w, boss } = fight("overseerMech", 7);
    const S = special(boss, "barrage");
    cast(w, boss);
    expect(hazardHits(w, S.delay + S.count * S.stagger + 0.1)).toBe(1);
  });

  it("the wyrm's eruption can't reach through a wall into the next room", () => {
    const { w, boss } = fight("sandWyrm", 8);
    // In the market, just behind the wall of the wyrm's tomb.
    w.player.x = w.player.prevX = 4;
    w.player.z = w.player.prevZ = 89.4;
    expect(boss.zoneRect.minZ).toBeGreaterThan(w.player.z);
    cast(w, boss);
    expect(boss.boss!.state).toBe("casting");
    let landed = 0;
    let hit = false;
    for (let i = 0; i < Math.round(8 / SIM_DT) && landed === 0; i++) {
      w.events.length = 0;
      stepWorld(w);
      for (const e of w.events) if (e.type === "hazardLanded") {
        landed++;
        hit ||= e.hit;
      }
    }
    expect(landed).toBe(1);
    expect(hit).toBe(false);
  });
});

describe("hive queen: the brood can't be farmed", () => {
  it("she calls her brood at most `calls` times in her life", () => {
    const { w, boss } = fight("hiveQueen", 6);
    const S = special(boss, "brood");
    for (let k = 0; k < S.calls; k++) {
      // Clear the hall each time so only the call limit can stop her.
      w.targets = w.targets.filter((t) => !t.brood);
      cast(w, boss);
      expect(boss.boss!.state).toBe("casting");
      run(w, S.cast + 0.05);
    }
    w.targets = w.targets.filter((t) => !t.brood);
    cast(w, boss);
    expect(boss.boss!.state).not.toBe("casting");
    expect(boss.boss!.broodCalls).toBe(S.calls);
  });

  it("leaving her hall scatters the brood, freeing any tentacle on them", () => {
    const { w, boss } = fight("hiveQueen", 6);
    const S = special(boss, "brood");
    w.stats.captureRadius = 30;
    cast(w, boss);
    run(w, S.cast + 0.05);
    expect(w.targets.some((t) => t.brood)).toBe(true);
    // Walk well clear of the hall (past the engage margin).
    w.player.z = w.player.prevZ = boss.zoneRect.minZ - 8;
    w.stats.captureRadius = 0;
    run(w, 2); // she finishes recovering from the call, then notices the player has gone
    expect(w.targets.some((t) => t.brood)).toBe(false);
    expect(w.tentacles.some((t) => t?.brood)).toBe(false);
  });

  it("catching the queen scatters her brood", () => {
    const { w, boss } = fight("hiveQueen", 6);
    const S = special(boss, "brood");
    cast(w, boss);
    run(w, S.cast + 0.05);
    expect(w.targets.some((t) => t.brood)).toBe(true);
    // Every tentacle on the queen, one tick from done.
    w.stats.captureRadius = 30;
    w.player.z = w.player.prevZ = boss.z - 2;
    w.tentacles.fill(boss);
    boss.held = true;
    boss.progress = 0.99995;
    run(w, 0.5);
    expect(w.targets.includes(boss)).toBe(false);
    expect(w.targets.some((t) => t.brood)).toBe(false);
  });
});
