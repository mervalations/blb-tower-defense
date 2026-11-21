# Poker TD

A standalone remake of the Warcraft III custom map **Poker TD 2.2** (`Poke TD-version VN 2.2.w3x`).
Same map layout, rules and numbers, with all-new original art and sound. No Warcraft assets are used.

## Play
Double-click `index.html`. It runs in any modern browser, offline, with nothing to install.

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
| `js/art.js`, `js/render.js` | Procedural art and the renderer |
| `js/audio.js` | Synthesised sound |
| `js/net.js` | Online multiplayer (host-authoritative, PeerJS) |
| `js/ui.js` | HUD, lobby, input, main loop |
| `tools/sim.js` | Headless AI-vs-AI balance runs |
| `tools/browser-test.js` | Headless Chrome play-test with screenshots |
