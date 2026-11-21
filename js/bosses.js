// Boss setup. Edit names here.
// image: square face picture drawn on the boss's body ('' = drawn face).
// color: suit colour of the boss.
// Which level each boss appears on is set in PTD.LEVELS (js/data.js) by index into this list.
window.PTD = window.PTD || {};

PTD.BOSSES = [
  { name: 'Adam', title: 'Level 6 Boss', image: 'assets/bosses/adam.jpg', color: '#b03a2e' },
  { name: 'Fuller', title: 'Level 12 Boss', image: 'assets/bosses/fuller.jpg', color: '#1f618d' },
  { name: 'Marvin', title: 'Level 18 Boss', image: 'assets/bosses/marvin.jpg', color: '#7d3c98' },
  { name: 'Smooth', title: 'Level 24 Boss', image: 'assets/bosses/smooth.jpg', color: '#1b1b1b' },
  { name: 'Tree', title: 'Final Boss Tag Team', image: 'assets/bosses/tree.jpg', color: '#196f3d' },
  { name: 'Giga Chad', title: 'Final Boss Tag Team', image: 'assets/bosses/gigachad.jpg', color: '#b8860b' },
];
