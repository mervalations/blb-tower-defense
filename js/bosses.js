// Boss setup. Edit names here.
// image: square face picture drawn on the boss's body ('' = drawn face).
// hair: [short | slick | bun | long | none, colour] for the 3D bobblehead (the photo covers the face).
// color: suit colour of the boss. style: cigar, shield, scepter, martini, staff or muscle (signature look and prop).
// introMove: 'armwrestle' swaps the entrance flex for an arm-wrestling match at a pop-up table.
// feet: 'club' (trips every 8 s), bag: 'tote', slime: 'hands' (slime blast every 8 s) are extra gags.
// intro / defeat: voice clip played when the boss arrives / is beaten (files in assets/sfx/).
// Which level each boss appears on is set in PTD.LEVELS (js/data.js) by index into this list.
window.PTD = window.PTD || {};

PTD.BOSSES = [
  { name: 'Adam', style: 'cigar', title: 'Level 6 Boss', image: 'assets/bosses/adam.jpg', hair: ['short', '#8a6a48'], color: '#b03a2e', intro: 'mic0038', defeat: 'back-shots', attack: 'smoke' },
  { name: 'Fuller', style: 'shield', title: 'Level 12 Boss', image: 'assets/bosses/fuller.jpg', hair: ['short', '#7a6550'], color: '#1f618d', intro: 'mic0035', defeat: 'back-shots', introMove: 'armwrestle', attack: 'slam' },
  { name: 'Marvin', style: 'scepter', title: 'Level 18 Boss', image: 'assets/bosses/marvin.jpg', hair: ['long', '#7a5a3e'], color: '#7d3c98', intro: 'marvo.m4a', defeat: 'back-shots', attack: 'hex' },
  { name: 'Smooth', style: 'martini', title: 'Level 24 Boss', image: 'assets/bosses/smooth.jpg', hair: ['short', '#26201c'], color: '#1b1b1b', intro: 'smooth.m4a', defeat: 'back-shots', feet: 'club' },
  { name: 'Tree', style: 'staff', title: 'Final Boss Tag Team', image: 'assets/bosses/tree.jpg', hair: ['long', '#6e3a22'], color: '#196f3d', intro: 'treenchad.m4a', defeat: 'back-shots', attack: 'roots' },
  { name: 'Giga Chad', style: 'muscle', title: 'Final Boss Tag Team', image: 'assets/bosses/gigachad.jpg', hair: ['slick', '#1e1a18'], color: '#b8860b', intro: 'treenchad.m4a', defeat: 'back-shots', bag: 'tote', slime: 'hands', attack: 'mortar' },
];

// Played whenever the final boss shells one of your towers.
// Boss attacks: radius of the warning circle / area hit, how long towers are disabled, and look.
// smoke = towers miss about half their shots; slam/roots = stun an area; hex = one tower, long.
PTD.BOSS_WIND = 1.2;   // seconds of telegraph before each strike
PTD.BOSS_ATTACKS = {
  smoke: { r: 360, time: 5, color: '#c9d1c8', label: 'SMOKED!', warn: 'blew cigar smoke on your towers. They will miss shots!' },
  slam: { r: 480, time: 2.8, color: '#ffbd71', label: 'SLAM!', warn: 'slammed his shield. Nearby towers are stunned!' },
  hex: { r: 150, time: 5.5, color: '#d998ff', label: 'HEXED!', warn: 'hexed one of your towers!' },
  roots: { r: 320, time: 4.2, color: '#79dc80', label: 'ROOTED!', warn: 'grew roots around your towers!' },
  mortar: { r: 150, time: 0, color: '#ff8a3d', label: '', warn: 'is shelling your towers!' },
};

PTD.BOSS_ATTACK_SFX = 'stab-from-behind';
