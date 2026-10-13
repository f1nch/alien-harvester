/** Uniform grid for radius queries on the X/Z plane. Rebuilt once per tick. */
export class SpatialHash<T extends { x: number; z: number }> {
  private cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cz: number): number {
    return ((cx + 32768) << 16) | ((cz + 32768) & 0xffff);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.z / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(item);
  }

  query(x: number, z: number, radius: number, out: T[] = []): T[] {
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / this.cellSize);
    const x1 = Math.floor((x + radius) / this.cellSize);
    const z0 = Math.floor((z - radius) / this.cellSize);
    const z1 = Math.floor((z + radius) / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this.cells.get(this.key(cx, cz));
        if (!cell) continue;
        for (const it of cell) {
          const dx = it.x - x;
          const dz = it.z - z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}
