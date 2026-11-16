# dustline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ardiansyahmam/dustline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ardiansyahmam/dustline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE — a tactical 3v3 bomb-defusal FPS on three.js. You and two bot teammates hold an abandoned solar plant in a dust basin against three enemy bots: two sites (Solar Array and Pump House), five fictional weapons plus two grenades, a round economy with a buy phase, and bots that hold angles, rotate between sites, and plant or defuse the spike. Best-of-13, first to 7 rounds wins; sides swap after round 6. No overtime: at 6-6, round 13 is the decider.

## Run it

```sh
node serve.mjs
```

Then open http://localhost:8080 in a desktop browser with WebGL 2. Click to lock the mouse. WASD to move, click to fire, R to reload, B for the buy menu, E to plant or defuse, G to throw a grenade.

## Character models

The three bot characters are free low-poly models from Polyfork, used under CC BY 4.0: Aircrew Pilot, Armoured Knight Hero and Buddhist Monk. Full attribution lives in `game/models/CREDITS.md` (the same notice is baked into each `.glb`). The map, weapons, HUD, audio and all other geometry are original, built from code.

## Design (Supra)

- **Weapons:** Vesper-9 SMG, Talon-5 rifle, Cinder .50 Magnum, Brine-12 shotgun, Rift-47 rifle, plus a free P9 sidearm. Blink flash ($250, blinds up to 1.6 s) and Haze smoke ($300, radius 5 m, 9 s). Vest $650, helmet $350 (headshots −35%), defuse kit $400 (defuse 4 s instead of 6).
- **Rounds:** buy 12 s, round 95 s, fuse 35 s, plant 3.5 s. Start $1,000, cap $10,000. Win $2,800 (detonation $3,200); loss $1,800 + $400 per consecutive loss, capped at $3,000. Kill rewards follow the weapon (Vesper $300, Talon/Rift $200, Magnum $300, Brine $500). Plant/defuse +$300.
- **Bots:** 5 rotating roles (entry, support, mid-control, anchor, lurker). Vision cone 105° to 26 m; footsteps heard at 17 m (35 m on the Pump Duct grate), gunshots at 35 m. Reaction 0.25–0.55 s, aim settle 0.35–0.8 s; difficulty raises aim consistency and coordination, never wallhacks or damage. Anchor peeks briefly then relocates; retakes come through two angles.
- **Map:** A Solar Array, B Pump House, Mid Inverter Court, rotations Solar Spine (long, exposed) and Pump Duct (fast, loud grate). Chokes: A Gate, Mid gantry, Pump Duct mouth. No site is visible from the attacker spawn.
- **Game-feel:** FOV 75°, walk 4.2 m/s, sprint 6 m/s (Shift), crouch 2.1 m/s; spread grows while moving and recovers after stopping; per-weapon recoil, reload, move-speed penalty, range falloff and armor penetration.

---

<sub>Entered on [make.fun](https://make.fun/?ref=m4e2jcyf&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
