// World -> wall material + palette. One entry per world; a new world is one new entry.
// Materials (shapes are shared, each world paints them in its own palette):
//   stone | metal | sandstone | ice | wood
// Palette keys: top, topHi, side, sideDk, ink (outline), detail, spike, slime, border, borderDk
export const WORLD_ART = {
  meadow: { material: 'stone', palette: { top: '#b7a6e8', topHi: '#d6cbff', side: '#6f5bb8', sideDk: '#4d3d8a', detail: '#8a77cc', spike: '#ffe066', slime: '#9cff6b', border: '#7a68c4', borderDk: '#4a3a86' } },
  city: { material: 'metal', palette: { top: '#4c5873', topHi: '#6b7a99', side: '#2b3346', sideDk: '#1b2130', detail: '#8fa3c7', spike: '#5ff4ff', slime: '#5ff4ff', border: '#39435a', borderDk: '#20263a', stripe: '#ffd23f' } },
  forest: { material: 'wood', palette: { top: '#9c6b3e', topHi: '#c08a52', side: '#5e3b1e', sideDk: '#3b2412', detail: '#3b2412', spike: '#e0303f', slime: '#b8e05a', border: '#4a2e16', borderDk: '#2b1a0c', moss: '#4f9a3c', roof: '#b8323a', roofDk: '#7a1f26' }, northRoof: true },
  desert: { material: 'sandstone', palette: { top: '#e3a866', topHi: '#f5c98d', side: '#a35f2c', sideDk: '#73401c', detail: '#8a4b22', spike: '#2bc4cf', slime: '#7ef9ff', border: '#b87038', borderDk: '#6e3a18' } },
  mirage: { material: 'sandstone', shimmer: true, palette: { top: '#eda661', topHi: '#f9cf92', side: '#a3542c', sideDk: '#6e3020', detail: '#7a3d1e', spike: '#3bd6e0', slime: '#9b6bff', border: '#c4733d', borderDk: '#6e3020' } },
  frozen: { material: 'ice', palette: { top: '#a9dcff', topHi: '#e6f6ff', side: '#5b9fd6', sideDk: '#356f9e', detail: '#ffffff', spike: '#f0fbff', slime: '#bdf3ff', border: '#7fb8e0', borderDk: '#3f6f99' } },
  // the Free Play safe hub: warm gold + ivory stone, never spiked
  hub: { material: 'stone', noSpikes: true, palette: { top: '#f3e3b8', topHi: '#fff6dc', side: '#c9a45a', sideDk: '#8f6f2e', detail: '#d9b867', spike: '#ffd23f', slime: '#ffd23f', border: '#e0c27a', borderDk: '#8f6f2e' } },
};
export const INK = '#1b1033';
export const artFor = (world) => WORLD_ART[world] || WORLD_ART.meadow;
