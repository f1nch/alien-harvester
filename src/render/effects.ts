import {
  Color4, DynamicTexture, ParticleSystem, Scene, Vector3,
} from "@babylonjs/core";

/** A soft round sprite shared by every particle effect. */
function moteTexture(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture("moteTex", { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

interface BurstStyle {
  colors: [Color4, Color4];
  size: [number, number];
  life: [number, number];
  speed: [number, number];
  gravity: number;
  /** Spread of initial directions: 1 = full sphere, small = mostly upward. */
  spread: number;
}

const STYLES = {
  capture: { colors: [new Color4(0.4, 1, 0.5, 1), new Color4(0.7, 1, 0.3, 1)], size: [0.08, 0.18], life: [0.35, 0.7], speed: [1.5, 3.5], gravity: -2, spread: 1 },
  deposit: { colors: [new Color4(0.3, 1, 0.85, 1), new Color4(0.6, 0.9, 1, 1)], size: [0.1, 0.22], life: [0.6, 1.1], speed: [1.5, 3], gravity: 1.5, spread: 0.3 },
  hit: { colors: [new Color4(1, 0.35, 0.2, 1), new Color4(1, 0.8, 0.3, 1)], size: [0.06, 0.14], life: [0.2, 0.45], speed: [3, 6], gravity: -6, spread: 1 },
  levelUp: { colors: [new Color4(0.75, 0.55, 1, 1), new Color4(0.4, 1, 0.9, 1)], size: [0.12, 0.26], life: [0.7, 1.3], speed: [2, 4.5], gravity: 0.5, spread: 0.6 },
  evolve: { colors: [new Color4(0.3, 0.9, 1, 1), new Color4(1, 0.4, 0.9, 1)], size: [0.15, 0.35], life: [0.9, 1.6], speed: [3, 6], gravity: 0, spread: 1 },
  // Boss signature strikes landing: shattering ice, and thrown-up sand or debris.
  ice: { colors: [new Color4(0.75, 0.95, 1, 1), new Color4(0.35, 0.8, 1, 1)], size: [0.08, 0.2], life: [0.35, 0.7], speed: [2.5, 5], gravity: -8, spread: 0.5 },
  spore: { colors: [new Color4(0.6, 1, 0.35, 1), new Color4(0.85, 1, 0.6, 1)], size: [0.12, 0.28], life: [0.6, 1.2], speed: [1, 2.5], gravity: 0.6, spread: 0.8 },
  ember: { colors: [new Color4(1, 0.55, 0.1, 1), new Color4(1, 0.2, 0.05, 1)], size: [0.08, 0.2], life: [0.4, 0.9], speed: [2.5, 5], gravity: -4, spread: 0.5 },
  dust: { colors: [new Color4(0.85, 0.65, 0.4, 1), new Color4(0.55, 0.42, 0.3, 1)], size: [0.14, 0.32], life: [0.5, 1], speed: [2, 4.5], gravity: -5, spread: 0.45 },
} satisfies Record<string, BurstStyle>;

export type BurstKind = keyof typeof STYLES;

/**
 * One-shot particle bursts for game feedback. Each kind owns a single pooled
 * system that emits on demand, so bursts never allocate per event.
 */
export class Effects {
  private systems = new Map<BurstKind, ParticleSystem>();

  constructor(scene: Scene, private enabled: boolean) {
    if (!enabled) return;
    const tex = moteTexture(scene);
    for (const kind of Object.keys(STYLES) as BurstKind[]) {
      const st: BurstStyle = STYLES[kind];
      const ps = new ParticleSystem(`fx-${kind}`, 160, scene);
      ps.particleTexture = tex;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.color1 = st.colors[0];
      ps.color2 = st.colors[1];
      ps.colorDead = new Color4(0, 0, 0, 0);
      ps.minSize = st.size[0];
      ps.maxSize = st.size[1];
      ps.minLifeTime = st.life[0];
      ps.maxLifeTime = st.life[1];
      ps.minEmitPower = st.speed[0];
      ps.maxEmitPower = st.speed[1];
      ps.gravity = new Vector3(0, st.gravity, 0);
      ps.direction1 = new Vector3(-st.spread, 1, -st.spread);
      ps.direction2 = new Vector3(st.spread, 1, st.spread);
      ps.emitRate = 0;
      ps.emitter = new Vector3();
      ps.minEmitBox = new Vector3(-0.15, 0, -0.15);
      ps.maxEmitBox = new Vector3(0.15, 0.2, 0.15);
      ps.start();
      this.systems.set(kind, ps);
    }
  }

  burst(kind: BurstKind, x: number, y: number, z: number, count = 24): void {
    if (!this.enabled) return;
    const ps = this.systems.get(kind);
    if (!ps) return;
    (ps.emitter as Vector3).set(x, y, z);
    ps.manualEmitCount = Math.max(ps.manualEmitCount, 0) + count;
  }
}
