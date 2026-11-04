# Dungeoneer

- Always commit and push directly to `main` (not feature branches).
- three.js game, no build step. `index.html` = HTML/CSS + cache busting; code is ES modules in `js/` using a tiny ECS.
  - `js/ecs.js` World (entities = plain objects of components), `js/main.js` system lists + loop.
  - `js/level.js` grid data, `js/render.js` scene/meshes, `js/input.js` desktop (WASD + mouse) and mobile (stick, drag-look, FIRE/JUMP/SLIDE) input.
  - `js/systems/*` player physics, enemies, combat, view/HUD.
- Bump `VERSION` in `index.html` on every change; add new module files to its `MODULES` list.
