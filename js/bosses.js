// Boss setup. Edit names here.
// image: square face picture drawn on the boss's body ('' = drawn face).
// color: suit colour of the boss. style: cigar, shield, scepter, martini, staff or muscle (signature look and prop).
// intro / defeat: voice clip played when the boss arrives / is beaten (files in assets/sfx/).
// Which level each boss appears on is set in PTD.LEVELS (js/data.js) by index into this list.
window.PTD = window.PTD || {};

PTD.BOSSES = [
  { name: 'Adam', style: 'cigar', title: 'Level 6 Boss', image: 'assets/bosses/adam.jpg', color: '#b03a2e', intro: 'mic0038', defeat: 'back-shots' },
  { name: 'Fuller', style: 'shield', title: 'Level 12 Boss', image: 'assets/bosses/fuller.jpg', color: '#1f618d', intro: 'mic0035', defeat: 'back-shots' },
  { name: 'Marvin', style: 'scepter', title: 'Level 18 Boss', image: 'assets/bosses/marvin.jpg', color: '#7d3c98', intro: 'marvo.m4a', defeat: 'back-shots' },
  { name: 'Smooth', style: 'martini', title: 'Level 24 Boss', image: 'assets/bosses/smooth.jpg', color: '#1b1b1b', intro: 'smooth.m4a', defeat: 'back-shots' },
  { name: 'Tree', style: 'staff', title: 'Final Boss Tag Team', image: 'assets/bosses/tree.jpg', color: '#196f3d', intro: 'treeple.m4a', defeat: 'back-shots' },
  { name: 'Giga Chad', style: 'muscle', title: 'Final Boss Tag Team', image: 'assets/bosses/gigachad.jpg', color: '#b8860b', intro: 'treeple.m4a', defeat: 'back-shots' },
];

// Played whenever the final boss shells one of your towers.
PTD.BOSS_ATTACK_SFX = 'stab-from-behind';
