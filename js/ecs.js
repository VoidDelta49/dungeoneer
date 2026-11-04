// Minimal ECS: an entity is a plain object whose keys are its components.
// Systems are plain functions (world, dt) that query entities by component names.
export class World {
  ents = new Set();
  add(e) { this.ents.add(e); return e; }
  remove(e) { this.ents.delete(e); }
  *query(...names) { for (const e of this.ents) if (names.every(n => n in e)) yield e; }
  one(name) { for (const e of this.query(name)) return e; }
}
