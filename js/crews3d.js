// Themed looter crews: one theme per round (PTD.LEVELS[].theme). Each wave mixes the three crew
// members and ends with the leader (variant 3), who is drawn bigger and wears a floating crown.
// A member's look = base merged with its own overrides; see build() in js/looters3d.js for keys.
//
// Common keys
//   body: biped (default) | ghost | dino | crab | snake      head: human | canine | rodent | shark | goblin |
//         alien | robot | zombie | clown | vampire | yeti | gnome | mummy | diver
//   skin / fur, top, bottom, shoes, pattern: [kind, colour] (stripes, dots, check, argyle, pinstripe, stars, wraps, sequins)
//   hat: [kind, colour, trim]   prop: item in the right hand   gait / quirk: how it walks and shows off
//   extras: eyepatch, shades, bowtie, scarf, apron, chestplate, bandolier, badge, championBelt, tanks, parrot,
//           shield: [face, rim], furry, ballchain, cape, coat, vest, robe, belt, chain, tie, wide, scale
window.PTD = window.PTD || {};

PTD.CREWS = {
  pirates: {
    base: { skin: '#e0ac8a', top: '#f4f1e8', pattern: ['stripes', '#c0392b'], bottom: '#2c3e50', belt: '#5d4037', gait: 'swagger', quirk: 'laugh' },
    crew: [
      { hat: ['bandana', '#c0392b'], prop: 'cutlass', beard: '#3b2a1a', eyepatch: true },
      { head: 'canine', fur: '#c9944a', hat: ['bandana', '#2980b9'], prop: 'bottle', pattern: null, vest: '#5d4037' },
      { head: 'shark', skin: '#5b8fb9', hat: ['tricorn', '#2c2c2c', '#e1b12c'], prop: 'cutlass', tail: 'fin' },
    ],
    leader: { hat: ['tricorn', '#1b1b1b', '#e1b12c'], coat: '#8e1b1b', pattern: null, beard: '#1b1b1b', prop: 'cutlass', parrot: true, eyepatch: true, wide: 1.2, gait: 'strut', quirk: 'raise' },
  },
  ninjas: {
    base: { skin: '#e0ac8a', top: '#1f2a36', bottom: '#1f2a36', shoes: '#1f2a36', hat: ['ninja', '#1f2a36', '#e74c3c'], faceMask: '#1f2a36', belt: '#e74c3c', gait: 'sneak', quirk: 'look' },
    crew: [
      { prop: 'shuriken', quirk: 'twirl' },
      { hat: ['ninja', '#7f1d1d', '#111111'], top: '#7f1d1d', bottom: '#7f1d1d', faceMask: '#7f1d1d', belt: '#111111', prop: 'sword' },
      { head: 'canine', fur: '#d9622b', hat: ['headband', null, '#2c3e50'], faceMask: null, top: '#2c3e50', bottom: '#2c3e50', prop: 'shuriken', tail: 'bushy', tailC: '#d9622b', gait: 'scurry' },
    ],
    leader: { hat: ['ninja', '#ecf0f1', '#e1b12c'], top: '#ecf0f1', bottom: '#ecf0f1', shoes: '#ecf0f1', faceMask: '#ecf0f1', belt: '#e1b12c', prop: 'sword', wide: 1.15, quirk: 'flex' },
  },
  zombies: {
    base: { head: 'zombie', skin: '#8fbf6a', top: '#6d5a48', pattern: ['check', '#4a3b2e'], bottom: '#3b4a5a', gait: 'shamble', quirk: 'laugh', armsFwd: true },
    crew: [
      { hair: '#3b2a1a' },
      { top: '#ecf0f1', pattern: null, tie: '#c0392b', bottom: '#2c3e50', hair: '#5d4037', skin: '#9ccc7a' },
      { hat: ['helm', '#c0392b'], top: '#c0392b', pattern: ['stripes', '#ffffff'], skin: '#7fae5a', wide: 1.3 },
    ],
    leader: { cape: '#4a235a', top: '#6c3483', pattern: null, wide: 1.3, hair: '#2b2b2b', prop: 'club', armsFwd: false, gait: 'stomp', quirk: 'raise' },
  },
  aliens: {
    base: { head: 'alien', skin: '#7ed957', top: '#9b59b6', pattern: ['dots', '#c39bff'], bottom: '#5b2c6f', shoes: '#2c3e50', gait: 'bounce', quirk: 'wave', prop: 'raygun' },
    crew: [
      {},
      { skin: '#7fd3ff', top: '#2ecc71', pattern: ['stripes', '#a3f7bf'], antC: '#ff7ae0' },
      { skin: '#ff9ff3', top: '#f1c40f', pattern: null, eyes3: true, prop: null, quirk: 'hop' },
    ],
    leader: { skin: '#a3e635', top: '#c0c0c0', pattern: null, cape: '#8e44ad', hat: ['bubble'], wide: 1.15, quirk: 'raise' },
  },
  cavemen: {
    base: { skin: '#c68e6e', top: '#d39b4a', pattern: ['dots', '#5d4037'], bottom: '#d39b4a', shoes: '#c68e6e', hat: ['cavehair', '#3b2a1a'], beard: '#3b2a1a', prop: 'club', gait: 'stomp', quirk: 'flex', angry: true },
    crew: [
      {},
      { skin: '#a87a5a', hat: ['cavehair', '#8b4513'], beard: '#8b4513', prop: 'spear' },
      { wide: 1.4, hat: ['cavehair', '#1b1b1b'], beard: null, top: '#8d6e63', pattern: ['dots', '#3e2723'] },
    ],
    leader: { hat: ['cavehair', '#ecf0f1'], beard: '#ecf0f1', cape: '#8b5a2b', wide: 1.3, chain: true },
  },
  robots: {
    base: { head: 'robot', skin: '#95a5a6', boxy: true, top: '#95a5a6', bottom: '#7f8c8d', shoes: '#34495e', glove: '#7f8c8d', gait: 'march', quirk: 'raise', eyeC: '#5ef2ff' },
    crew: [
      { prop: 'wrench' },
      { skin: '#e67e22', top: '#e67e22', bottom: '#d35400', eyeC: '#ffe066' },
      { skin: '#3498db', top: '#3498db', bottom: '#2c3e50', eyeC: '#ff5e5e', wide: 1.3, prop: 'hammer' },
    ],
    leader: { skin: '#e1b12c', top: '#e1b12c', bottom: '#b8860b', eyeC: '#ff2d55', wide: 1.3, cape: '#c0392b' },
  },
  wizards: {
    base: { skin: '#f0c8a8', top: '#5b3fa0', pattern: ['stars', '#f5d76e'], robe: true, hat: ['wizard', '#5b3fa0', '#f5d76e'], beard: '#ecf0f1', prop: 'wand', gait: 'glide', quirk: 'raise' },
    crew: [
      {},
      { top: '#c0392b', pattern: ['stars', '#ffd166'], hat: ['wizard', '#c0392b', '#ffd166'], beard: '#a0522d', wandC: '#ff9f43' },
      { top: '#16a085', pattern: ['stars', '#a3f7bf'], hat: ['wizard', '#16a085', '#a3f7bf'], beard: null, hair: '#f1c40f', prop: 'flask' },
    ],
    leader: { top: '#1b1b3a', pattern: ['stars', '#7fdfff'], hat: ['wizard', '#1b1b3a', '#7fdfff'], beard: '#ecf0f1', prop: 'orbstaff', wide: 1.2 },
  },
  cowboys: {
    base: { skin: '#d8a27a', top: '#a1673f', pattern: ['check', '#5d4037'], bottom: '#3b5b8a', hat: ['cowboy', '#6e4b2a', '#2d2d2d'], gait: 'swagger', quirk: 'twirl', prop: 'lasso', bandolier: true },
    crew: [
      { mustache: '#3b2a1a' },
      { poncho: '#c0392b', hat: ['cowboy', '#2d2d2d'], beard: '#2b1d12', bandolier: false, quirk: 'look' },
      { head: 'canine', fur: '#b08d57', hat: ['cowboy', '#8b5a2b'], scarf: '#e74c3c', pattern: null, top: '#ecf0f1', vest: '#5d4037', bandolier: false, tail: 'bushy', tailC: '#b08d57' },
    ],
    leader: { vest: '#3b2a1a', pattern: null, top: '#ecf0f1', badge: true, mustache: '#1b1b1b', hat: ['cowboy', '#1b1b1b', '#e1b12c'], wide: 1.2, coat: '#3b2a1a', gait: 'strut' },
  },
  mummies: {
    base: { head: 'mummy', wraps: true, skin: '#e8dcc0', top: '#e8dcc0', pattern: ['wraps', '#b8a67a'], bottom: '#d8c8a0', shoes: '#d8c8a0', gait: 'shamble', armsFwd: true, quirk: 'look' },
    crew: [
      {},
      { skin: '#d6c49a', top: '#d6c49a', pattern: ['wraps', '#9a8a5a'], wrapC: '#9a8a5a' },
      { head: 'canine', wraps: false, fur: '#1b1b1b', inner: '#e1b12c', hat: ['nemes', '#e1b12c', '#2e86de'], armsFwd: false, prop: 'spear', top: '#ecf0f1', pattern: null, belt: '#e1b12c', bottom: '#ecf0f1', shoes: '#e1b12c', gait: 'march' },
    ],
    leader: { hat: ['nemes', '#e1b12c', '#2e86de'], chain: true, cape: '#2e86de', prop: 'orbstaff', wandC: '#ffd34d', armsFwd: false, wide: 1.2, gait: 'glide' },
  },
  clowns: {
    base: { head: 'clown', skin: '#fdfefe', top: '#e74c3c', pattern: ['dots', '#f1c40f'], bottom: '#2e86de', shoes: '#e74c3c', bigShoes: true, hat: ['clownwig', '#ff7f50', '#2ecc71'], bowtie: '#2ecc71', gait: 'bounce', quirk: 'laugh', prop: 'mallet' },
    crew: [
      {},
      { top: '#9b59b6', pattern: ['stripes', '#ffffff'], hat: ['clownwig', '#2ecc71', '#e74c3c'], prop: 'balloon', balloonC: '#f1c40f' },
      { top: '#f1c40f', pattern: ['dots', '#e74c3c'], hat: ['clownwig', '#e84393', '#2e86de'], prop: 'pie', bottom: '#e74c3c' },
    ],
    leader: { head: 'human', skin: '#f0c8a8', top: '#ecf0f1', coat: '#c0392b', pattern: null, bottom: '#ecf0f1', shoes: '#1b1b1b', bigShoes: false, hat: ['top', '#1b1b1b', '#e1b12c'], mustache: '#1b1b1b', prop: 'cane', bowtie: '#1b1b1b', gait: 'strut', quirk: 'twirl' },
  },
  vikings: {
    base: { skin: '#f0c8a8', top: '#7f8c8d', pattern: ['check', '#5d6d7e'], bottom: '#5d4037', belt: '#3e2723', hat: ['viking', '#95a5a6', '#d4a017'], beard: '#e67e22', prop: 'axe', shield: ['#c0392b', '#d4a017'], gait: 'stomp', quirk: 'flex', noSack: false },
    crew: [
      {},
      { beard: '#f1c40f', hat: ['viking', '#7f8c8d', '#7f8c8d'], shield: ['#2980b9', '#ecf0f1'], prop: 'spear' },
      { beard: '#8b4513', wide: 1.45, top: '#8b5a2b', pattern: null, prop: 'hammer', shield: null },
    ],
    leader: { beard: '#ecf0f1', cape: '#8e1b1b', hat: ['viking', '#d4a017', '#d4a017'], wide: 1.3, prop: 'axe', shield: ['#1b1b1b', '#d4a017'] },
  },
  ghosts: {
    base: { body: 'ghost', skin: '#f4f7fb', gait: 'glide', quirk: 'raise', noSack: true },
    crew: [
      {},
      { hat: ['top', '#2c2c2c', '#8e44ad'], prop: 'lantern', lampC: '#7dff8a' },
      { skin: '#d7f5ff', ballchain: true, quirk: 'laugh' },
    ],
    leader: { skin: '#efe3ff', hat: ['crown'], prop: 'lantern', lampC: '#c39bff', scale: 1.1 },
  },
  dinos: {
    base: { body: 'dino', dinoC: '#58a55c', dinoBelly: '#d4e6a5', skin: '#c68e6e', top: '#d39b4a', pattern: ['dots', '#5d4037'], hat: ['cavehair', '#3b2a1a'], gait: 'stomp', quirk: 'hop', prop: 'spear' },
    crew: [
      {},
      { dinoC: '#e67e22', dinoBelly: '#f8c471', hat: ['pith', '#e8dcc0', '#5d4037'], top: '#c8a165', pattern: null, prop: 'net', skin: '#f0c8a8' },
      { dinoC: '#8e44ad', dinoBelly: '#d2b4de', hat: ['bandana', '#c0392b'], head: 'goblin', skin: '#6dbb63', top: '#2c3e50', pattern: null, prop: 'club' },
    ],
    leader: { dinoC: '#c0392b', dinoBelly: '#f5b7b1', dinoBig: true, hat: ['viking', '#95a5a6', '#d4a017'], prop: 'axe', top: '#1b1b1b', pattern: null, beard: '#e67e22' },
  },
  knights: {
    base: { skin: '#f0c8a8', top: '#bdc3c7', chestplate: '#d0d6db', bottom: '#95a5a6', shoes: '#7f8c8d', glove: '#95a5a6', hat: ['knight', '#bdc3c7', '#c0392b'], prop: 'sword', shield: ['#2980b9', '#ecf0f1'], gait: 'march', quirk: 'raise' },
    crew: [
      {},
      { hat: ['knight', '#bdc3c7', '#f1c40f'], shield: ['#c0392b', '#f1c40f'], prop: 'spear' },
      { wide: 1.35, hat: ['knight', '#7f8c8d', '#2ecc71'], shield: ['#27ae60', '#ecf0f1'], prop: 'hammer', beard: '#5d4037' },
    ],
    leader: { chestplate: '#e1b12c', hat: ['knight', '#e1b12c', '#8e44ad'], cape: '#8e44ad', shield: ['#8e44ad', '#e1b12c'], wide: 1.2, mustache: '#5d4037' },
  },
  astronauts: {
    base: { skin: '#f0c8a8', top: '#ecf0f1', bottom: '#ecf0f1', shoes: '#95a5a6', glove: '#bdc3c7', hat: ['bubble'], tanks: '#e67e22', belt: '#7f8c8d', gait: 'bounce', quirk: 'wave', hair: '#3b2a1a' },
    crew: [
      {},
      { tanks: '#2e86de', hair: '#f1c40f', prop: 'flag', flagC: '#2e86de' },
      { head: 'canine', fur: '#ecf0f1', muzzle: '#ffffff', tanks: '#c0392b', hair: null, quirk: 'hop' },
    ],
    leader: { top: '#e67e22', bottom: '#e67e22', tanks: '#ecf0f1', prop: 'raygun', mustache: '#3b2a1a', wide: 1.15, quirk: 'raise' },
  },
  gnomes: {
    base: { head: 'gnome', skin: '#f0c8a8', top: '#2e86de', bottom: '#8b5a2b', belt: '#3e2723', hat: ['gnome', '#e74c3c'], beard: '#ffffff', gait: 'waddle', quirk: 'hop', scale: 0.85, wide: 1.15 },
    crew: [
      { prop: 'shovel' },
      { hat: ['gnome', '#27ae60'], top: '#e67e22', prop: 'lantern' },
      { hat: ['gnome', '#8e44ad'], top: '#f1c40f', beard: '#bdc3c7', prop: 'pickaxe' },
    ],
    leader: { hat: ['gnome', '#e1b12c'], top: '#c0392b', cape: '#2e86de', wide: 1.3, prop: 'shovel', scale: 1 },
  },
  luchadores: {
    base: { skin: '#c68e6e', top: '#c68e6e', bottom: '#c0392b', shoes: '#c0392b', hat: ['luchador', '#c0392b', '#f1c40f'], wide: 1.3, armW: 1.4, gait: 'swagger', quirk: 'flex', belt: '#f1c40f' },
    crew: [
      {},
      { hat: ['luchador', '#2e86de', '#ecf0f1'], bottom: '#2e86de', shoes: '#ecf0f1', cape: '#2e86de', belt: '#ecf0f1' },
      { hat: ['luchador', '#27ae60', '#f1c40f'], bottom: '#27ae60', shoes: '#f1c40f', wide: 1.55, skin: '#a87a5a', top: '#a87a5a' },
    ],
    leader: { hat: ['luchador', '#e1b12c', '#8e44ad'], bottom: '#8e44ad', shoes: '#e1b12c', cape: '#e1b12c', championBelt: true, belt: null, wide: 1.45 },
  },
  vampires: {
    base: { head: 'vampire', skin: '#e8e4f0', top: '#ecf0f1', vest: '#8e1b1b', bottom: '#1b1b1b', cape: '#1b1b1b', bowtie: '#8e1b1b', hair: '#1b1b1b', gait: 'sneak', quirk: 'laugh' },
    crew: [
      {},
      { cape: '#4a235a', vest: '#4a235a', hair: '#7f1d1d', prop: 'goblet' },
      { head: 'rodent', fur: '#4a4a5a', ear: 0.27, inner: '#c0392b', cape: '#2d2d3a', vest: null, top: '#2d2d3a', bowtie: null, gait: 'scurry' },
    ],
    leader: { cape: '#8e1b1b', hair: '#ecf0f1', prop: 'cane', chain: true, wide: 1.2, gait: 'glide', quirk: 'raise' },
  },
  yetis: {
    base: { head: 'yeti', fur: '#f4f7fb', top: '#f4f7fb', bottom: '#f4f7fb', shoes: '#b0c4d8', wide: 1.5, armW: 1.5, furry: true, gait: 'stomp', quirk: 'flex' },
    crew: [
      { scarf: '#e74c3c' },
      { fur: '#d6eaf8', top: '#d6eaf8', bottom: '#d6eaf8', scarf: '#27ae60', hat: ['beanie', '#2e86de', '#ffffff'] },
      { prop: 'club', wide: 1.75 },
    ],
    leader: { fur: '#ffffff', hat: ['viking', '#95a5a6', '#85c1e9'], cape: '#2e86de', wide: 1.8 },
  },
  chefs: {
    base: { skin: '#f0c8a8', top: '#ffffff', apron: '#ffffff', bottom: '#2c3e50', hat: ['toque', '#ffffff'], scarf: '#e74c3c', mustache: '#3b2a1a', gait: 'strut', quirk: 'shake' },
    crew: [
      { prop: 'rollingpin' },
      { prop: 'pan', scarf: '#2e86de', mustache: null, hair: '#f1c40f' },
      { prop: 'cleaver', wide: 1.35, scarf: '#27ae60', beard: '#1b1b1b', mustache: null },
    ],
    leader: { scarf: '#e1b12c', prop: 'ladle', mustache: '#ecf0f1', wide: 1.3, quirk: 'raise' },
  },
  divers: {
    base: { head: 'diver', top: '#a9a397', bottom: '#a9a397', shoes: '#3b3b3b', glove: '#5d4037', flippers: false, belt: '#5d4037', gait: 'stomp', quirk: 'look', prop: 'harpoon' },
    crew: [
      {},
      { top: '#e67e22', bottom: '#e67e22', prop: 'net' },
      { body: 'crab', shell: '#e0703a' },
    ],
    leader: { top: '#2e86de', bottom: '#2e86de', prop: 'trident', wide: 1.25 },
  },
  scientists: {
    base: { skin: '#f0c8a8', top: '#ecf0f1', coat: '#ffffff', bottom: '#34495e', goggles: '#7dff8a', hat: ['wildhair', '#ecf0f1'], prop: 'flask', gait: 'scurry', quirk: 'shake' },
    crew: [
      {},
      { hat: ['wildhair', '#e67e22'], goggles: '#ff9ff3', prop: 'clipboard', flaskC: '#ff9ff3' },
      { head: 'zombie', skin: '#7fae5a', brain: false, bolts: true, hair: '#1b1b1b', top: '#2c3e50', coat: null, bottom: '#2c3e50', wide: 1.45, gait: 'shamble', armsFwd: true, hat: null, goggles: null, prop: null },
    ],
    leader: { hat: ['wildhair', '#ffffff'], goggles: '#ff2d55', prop: 'brainjar', wide: 1.15, quirk: 'raise' },
  },
  gladiators: {
    base: { skin: '#d8a27a', top: '#d8a27a', chestplate: '#c9a227', bottom: '#8e1b1b', shoes: '#8b5a2b', hat: ['gladiator', '#c9a227', '#c0392b'], shield: ['#c0392b', '#c9a227'], prop: 'sword', gait: 'march', quirk: 'raise', wide: 1.2 },
    crew: [
      {},
      { prop: 'trident', hat: ['gladiator', '#95a5a6', '#2e86de'], shield: null, chestplate: '#95a5a6' },
      { prop: 'spear', wide: 1.45, hat: ['gladiator', '#7f8c8d', '#f1c40f'], skin: '#a87a5a', top: '#a87a5a' },
    ],
    leader: { cape: '#8e1b1b', chestplate: '#e1b12c', hat: ['gladiator', '#e1b12c', '#ecf0f1'], wide: 1.35, shield: ['#e1b12c', '#8e1b1b'] },
  },
  explorers: {
    base: { skin: '#e0ac8a', top: '#c8a165', bottom: '#8b7355', belt: '#5d4037', hat: ['pith', '#e8dcc0', '#5d4037'], prop: 'machete', gait: 'sneak', quirk: 'look' },
    crew: [
      { mustache: '#8b4513' },
      { prop: 'net', hair: '#f1c40f', hat: ['fedora', '#8b5a2b', '#3b2a1a'], top: '#ecf0f1', vest: '#8b7355' },
      { body: 'snake', skin: '#2e9e6b', accent: '#f1c40f' },
    ],
    leader: { head: 'yeti', fur: '#3b3b3b', face: '#7a6a5a', top: '#3b3b3b', bottom: '#3b3b3b', shoes: '#3b3b3b', wide: 1.6, armW: 1.6, furry: true, hat: ['pith', '#e8dcc0', '#c0392b'], prop: 'banana', gait: 'stomp', quirk: 'flex', belt: null },
  },
  disco: {
    base: { skin: '#8d5524', top: '#e84393', pattern: ['sequins', '#ffd1f0'], bottom: '#ffffff', flares: true, shoes: '#f1c40f', hat: ['afro', '#1b1b1b'], shades: true, chain: true, gait: 'strut', quirk: 'dance' },
    crew: [
      {},
      { skin: '#f0c8a8', top: '#00cec9', pattern: ['sequins', '#c7fff8'], hat: ['afro', '#e67e22'], prop: 'mic', bottom: '#2d3436' },
      { skin: '#c68e6e', top: '#f1c40f', pattern: ['sequins', '#fff3b0'], hat: ['afro', '#8e44ad'], wide: 1.3, bottom: '#8e44ad' },
    ],
    leader: { top: '#ecf0f1', pattern: ['sequins', '#ffffff'], cape: '#e1b12c', prop: 'discoball', wide: 1.25, quirk: 'raise' },
  },
};
