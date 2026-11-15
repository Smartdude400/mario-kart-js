# Sunset Speedway

**A top-down kart racer in the spirit of the classics — three laps, item boxes, drift boosts and a grid of AI rivals, all in one HTML page.**

Sunset Speedway is a complete little kart racing game: pick a character and a kart, hit the
grid, and race three laps of a closed circuit with a shortcut, surface-dependent grip, and
item boxes that can turn the race around. Everything is drawn on a 2D canvas with a rotating,
zooming chase camera; all audio is synthesized.

## Features

- **Full race weekend** — title screen, character and kart select, countdown, three-lap race,
  pause and results.
- **Three characters** — Blaze, Pebble and Tank, with different weight and shove behavior.
- **Three kart classes** — Standard, Speedster and Gripper trade top speed, acceleration and
  handling.
- **Drift-boost system** — hold a drift to charge blue, orange and purple mini-turbos of
  increasing strength.
- **Items** — boost mushrooms, triple mushrooms, banana peels, green shells, homing red shells
  and a lightning bolt that shrinks the field.
- **AI rivals** — opponents that race the line, use items and fight for position.
- **A real track** — Sunset Speedway: Catmull-Rom spline road, off-track grass and sand that
  kill your grip, a narrow shortcut, and procedural scenery.
- **Juice** — particles, screen shake, skid marks, synthesized engine and item sounds.

## Quick start

No build step, no dependencies. Serve the folder over HTTP:

```sh
npx serve .
# or: python -m http.server 8080
```

Open the printed URL and press Start.

## Controls

| Key | Action |
| --- | --- |
| Arrow Up | Accelerate |
| Arrow Down | Brake / reverse |
| Arrow Left / Right | Steer (hold while turning to drift) |
| Space | Use item |

## Tech

Pure HTML/Canvas/JavaScript — twelve small modules (`track`, `kart`, `ai`, `items`,
`particles`, `audio`, …) with no framework and no external assets. An original fan homage to
classic kart racers; not affiliated with or endorsed by Nintendo.