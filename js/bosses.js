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
  { name: 'Adam', style: 'cigar', title: 'Level 6 Boss', image: 'assets/bosses/adam.jpg', hair: ['short', '#8a6a48'], color: '#b03a2e', intro: 'mic0038', defeat: 'back-shots' },
  { name: 'Fuller', style: 'shield', title: 'Level 12 Boss', image: 'assets/bosses/fuller.jpg', hair: ['short', '#7a6550'], color: '#1f618d', intro: 'mic0035', defeat: 'back-shots', introMove: 'armwrestle' },
  { name: 'Marvin', style: 'scepter', title: 'Level 18 Boss', image: 'assets/bosses/marvin.jpg', hair: ['long', '#7a5a3e'], color: '#7d3c98', intro: 'marvo.m4a', defeat: 'back-shots' },
  { name: 'Smooth', style: 'martini', title: 'Level 24 Boss', image: 'assets/bosses/smooth.jpg', hair: ['short', '#26201c'], color: '#1b1b1b', intro: 'smooth.m4a', defeat: 'back-shots', feet: 'club' },
  { name: 'Tree', style: 'staff', title: 'Final Boss Tag Team', image: 'assets/bosses/tree.jpg', hair: ['long', '#6e3a22'], color: '#196f3d', intro: 'treenchad.m4a', defeat: 'back-shots' },
  { name: 'Giga Chad', style: 'muscle', title: 'Final Boss Tag Team', image: 'assets/bosses/gigachad.jpg', hair: ['slick', '#1e1a18'], color: '#b8860b', intro: 'treenchad.m4a', defeat: 'back-shots', bag: 'tote', slime: 'hands' },
];

// Played whenever the final boss shells one of your towers.
PTD.BOSS_ATTACK_SFX = 'stab-from-behind';
