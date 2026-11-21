# BLB Tower Defense

Play it: https://mervalations.github.io/blb-tower-defense/

A standalone remake of the Warcraft III custom map **Poker TD 2.2** (`Poke TD-version VN 2.2.w3x`).
Same map layout, rules and numbers, with all-new original art and sound. No Warcraft assets are used.

## Play
Double-click `index.html`. It runs in any modern browser, offline, with nothing to install.

## Graphics
Pick on the menu: **3D Ultra** (lighting, shadows, bloom glow, particles), **3D Fast** (no shadows or bloom, for older machines), or **Classic 2D**.
Ultra drops to Fast automatically if the frame rate struggles. The 3D view uses Three.js r158 (bundled in `js/lib/`, MIT licence).

## Music and controls
- Soundtrack: `assets/music/` (td2–td7, the owner's Suno tracks) online. When run from your own folder it also plays the tracks in `assets/music/local/` (git-ignored, never uploaded). The sound button (or M) cycles music+sound / sound only / muted. If no track loads, a generated lounge-jazz band plays instead.
- Boss voice lines: `assets/sfx/`, set per boss in `js/bosses.js` (`intro`, `defeat`) plus `PTD.BOSS_ATTACK_SFX`. Convert a video's audio with `python tools/mp4-audio.py in.mp4 out.m4a`.
- Camera: drag or WASD to pan, wheel to zoom, right-drag or Q/E to rotate and tilt, H to return to your lane. A fly-in intro plays at the start of each game (click to skip).

## Play online with friends
- **Play Online:** everyone who presses it lands at the shared public table. The first person there hosts, and anyone can press Start.
- **Private Table:** you get a 5-letter room code and an invite link (`?table=CODE`) to send friends.
- Computer players fill any empty seats (up to 8). If someone disconnects, a computer takes over their seat.
- The host's browser runs the game and streams it to everyone (WebRTC via PeerJS). Online play needs an internet connection; single player works offline.
- Test it with `node tools/mp-test.js <outdir>` (two headless Chrome windows play a hand together).

## What carried over from the map
- The 8-lane board, maze roads, spawn corners and central vault (read from the map's pathing grid and regions).
- 5-card hands, one swap of up to 4 cards, combining poker hands into towers, folding, and dealer tipping with the original odds table.
- Hand-winner gold bonus, 45-second hand timer, 12 looters per wave every 2s, 30 levels with 5 bosses.
- Tower stats per suit and per hand, looter HP, bounties and leak costs.
- The final boss shells your towers; Two Pair towers are immune.

## Looter crews
Every round brings a different themed crew (Pirates, Ninjas, Zombies, Space Aliens, Cavemen, Robots, Wizards, Cowboys, Mummies, Clowns, Vikings, Ghosts, Dino Riders, Knights, Astronauts, Garden Gnomes, Luchadores, Vampires, Yetis, Chefs, Deep-Sea Divers, Mad Scientists, Gladiators, Jungle Explorers, Disco Crew). Each wave mixes three crew members and ends with a bigger leader wearing a floating crown. Looks are cosmetic: each round keeps the original HP, bounty and leak cost. Edit crews in `js/crews3d.js` and the round order in `PTD.LEVELS` (`js/data.js`).

## Difficulty
The original was built for 8 humans covering each other's lanes, so solo it's brutal.
**Classic 2.2** keeps the exact original looter HP. The other modes flatten the HP curve
(`creepHp` in `js/game.js`, tuned with `node tools/sim.js`).

## Customise
- **Bosses:** edit names, colours and face pictures in `js/bosses.js`. Put square face images in `assets/bosses/`.
- **Rules and balance:** `js/data.js`.

## Files
| File | What |
|---|---|
| `js/mapdata.js` | Board grid and lanes extracted from the original map (generated) |
| `js/data.js` | Rules, towers, levels, tip odds |
| `js/poker.js` | Deck and hand evaluation |
| `js/game.js` | Simulation and AI rivals (no DOM; runs headless) |
| `js/art.js`, `js/render.js` | Procedural art and the 2D renderer |
| `js/render3d.js` | 3D renderer (Three.js, hand-rolled bloom, raised felt terrain) |
| `tools/blender/looters.py` | Builds looter models in Blender (`blender -b -P tools/blender/looters.py -- assets/models`), then `python tools/embed-models.py` |
| `js/models.js` | Blender models embedded for the 3D view (generated) |
| `js/looters3d.js` | 3D looter character kit (heads, hats, props, ghost and dino-rider bodies, walks) and the bosses |
| `js/crews3d.js` | The 25 themed looter crews, one per round: 3 members plus a crowned leader each |
| `js/scenery3d.js` | Marquee lights, lane chevrons, wall clutter, spawn arches, jackpot plaza, the casino room |
| `js/towers3d.js` | Tower models: one per suit for single cards, one per hand type for combos, each fitted to a size budget that grows gently with the hand |
| `js/bossfaces.js` | Boss faces inlined for the 3D view (regenerate with `python tools/embed-faces.py`) |
| `js/audio.js` | Synthesised sound: layered effects with a small reverb, and a musical sting per looter crew |
| `js/net.js` | Online multiplayer (host-authoritative, PeerJS) |
| `js/ui.js` | HUD, lobby, input, main loop |
| `tools/sim.js` | Headless AI-vs-AI balance runs |
| `tools/browser-test.js` | Headless Chrome play-test with screenshots |
