import { writeFileSync } from 'node:fs';
const shade = (hex, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');

function character(L, pose = 'wave') {
  const sk = L.skin, hair = L.hair, top = L.top, bot = L.bottom, acc = L.accent, boot = shade(L.accent, 0.9);
  const o = [];
  const line = (x1, y1, x2, y2, w, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  // hair behind the head
  if (L.style === 'long') o.push(`<path d="M48 80 Q30 150 44 205 Q58 222 70 200 Q62 150 70 110 L130 110 Q138 150 130 200 Q142 222 156 205 Q170 150 152 80 Z" fill="${hair}"/>`);
  if (L.style === 'bob') o.push(`<path d="M46 84 Q40 130 58 142 L142 142 Q160 130 154 84 Z" fill="${hair}"/>`);
  if (L.style === 'ponytail') o.push(`<path d="M128 44 Q176 40 178 96 Q180 140 160 168 Q164 120 150 92 Q140 70 124 62 Z" fill="${hair}"/><circle cx="134" cy="50" r="8" fill="${acc}"/>`);
  if (L.style === 'braids') for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) o.push(`<ellipse cx="${100 + s * (50 + (i % 2) * 3)}" cy="${112 + i * 15}" rx="9.5" ry="10" fill="${hair}"/>`);
    o.push(`<circle cx="${100 + s * 51}" cy="204" r="7" fill="${acc}"/>`);
  }
  if (L.style === 'puffs') for (const s of [-1, 1]) o.push(`<circle cx="${100 + s * 46}" cy="44" r="26" fill="${hair}"/><ellipse cx="${100 + s * 33}" cy="56" rx="9" ry="6" fill="${acc}" transform="rotate(${s * 40} ${100 + s * 33} 56)"/>`);
  // legs and boots
  for (const s of [-1, 1]) {
    const hx = 100 + s * 13, ax = 100 + s * 16;
    o.push(line(hx, 208, ax, 268, 17, sk));
    o.push(`<rect x="${ax - 10}" y="246" width="20" height="30" rx="6" fill="${boot}"/><ellipse cx="${ax + s * 4}" cy="280" rx="16" ry="9" fill="${boot}"/>`);
  }
  // bottoms
  if (L.outfit === 'dress') o.push(`<path d="M76 190 L124 190 L150 246 Q100 258 50 246 Z" fill="${bot}"/><path d="M50 246 Q100 258 150 246" fill="none" stroke="${acc}" stroke-width="5" stroke-linecap="round"/>`);
  else o.push(`<path d="M74 192 L126 192 L130 232 L104 232 L100 216 L96 232 L70 232 Z" fill="${bot}" stroke="${bot}" stroke-width="6" stroke-linejoin="round"/>`);
  // arms
  const arm = (s, up) => {
    const sx = 100 + s * 30, sy = 148;
    const [ex, ey, wx, wy] = up ? [sx + s * 26, sy - 16, sx + s * 34, sy - 56] : [sx + s * 14, sy + 30, sx + s * 12, sy + 60];
    o.push(line(sx, sy, ex, ey, 13, sk), line(ex, ey, wx, wy, 11, sk));
    o.push(line(sx, sy, sx + (ex - sx) * 0.5, sy + (ey - sy) * 0.5, 18, top));
    o.push(line(wx + (ex - wx) * 0.12, wy + (ey - wy) * 0.12, wx + (ex - wx) * 0.02, wy + (ey - wy) * 0.02, 13, acc));
    o.push(`<circle cx="${wx + (wx - ex) * 0.12}" cy="${wy + (wy - ey) * 0.12}" r="9" fill="${sk}"/>`);
  };
  arm(-1, pose === 'up'); arm(1, pose !== 'down');
  // torso, belt, neck
  o.push(`<path d="M70 146 Q70 136 84 134 L116 134 Q130 136 130 146 L125 198 Q100 206 75 198 Z" fill="${top}"/>`);
  o.push(`<path d="M75 188 Q100 196 125 188" fill="none" stroke="${acc}" stroke-width="7" stroke-linecap="round"/>`);
  o.push(`<rect x="92" y="122" width="16" height="18" rx="6" fill="${shade(sk, 0.93)}"/>`);
  o.push(`<path d="M86 136 Q100 160 114 136" fill="none" stroke="#7a5230" stroke-width="2.2"/><ellipse cx="100" cy="151" rx="6" ry="7" fill="#fff3e2" stroke="#e6cfae" stroke-width="1"/>`);
  // head
  o.push(`<ellipse cx="51" cy="92" rx="6" ry="10" fill="${sk}"/><ellipse cx="149" cy="92" rx="6" ry="10" fill="${sk}"/>`);
  o.push(`<circle cx="100" cy="86" r="48" fill="${sk}"/>`);
  o.push(`<path d="M52 82 Q50 36 100 36 Q150 36 148 82 Q140 62 118 58 Q96 70 70 60 Q58 66 52 82 Z" fill="${hair}"/>`);
  o.push(`<ellipse cx="72" cy="108" rx="9" ry="6" fill="#ff6f7d" opacity="0.32"/><ellipse cx="128" cy="108" rx="9" ry="6" fill="#ff6f7d" opacity="0.32"/>`);
  for (const s of [-1, 1]) {
    const x = 100 + s * 19;
    o.push(`<ellipse cx="${x}" cy="92" rx="11" ry="13" fill="#fff"/><circle cx="${x + 1}" cy="93" r="8" fill="${L.eyes}"/><circle cx="${x + 1}" cy="93" r="4.4" fill="#17110f"/><circle cx="${x - 2}" cy="89" r="2.4" fill="#fff"/>`);
    o.push(`<path d="M${x - 12} 88 Q${x} 74 ${x + 12} 88" fill="none" stroke="#1c1210" stroke-width="2.6" stroke-linecap="round"/>`);
    o.push(`<path d="M${x - 10} 70 Q${x} 65 ${x + 10} 70" fill="none" stroke="${shade(hair, 0.8)}" stroke-width="3.4" stroke-linecap="round"/>`);
  }
  o.push(`<ellipse cx="100" cy="104" rx="3" ry="2.2" fill="${shade(sk, 0.88)}"/>`);
  o.push(`<path d="M84 113 Q100 118 116 113 Q112 131 100 131 Q88 131 84 113 Z" fill="#6b1f33"/><path d="M87 115 Q100 119 113 115 L112 119 Q100 122 88 119 Z" fill="#fff"/><ellipse cx="100" cy="127" rx="7" ry="3.4" fill="#f0788c"/>`);
  // accessory
  const ax = 136, ay = 52;
  if (L.accessory === 'starfish') {
    const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 13, a = i / 10 * Math.PI * 2 - Math.PI / 2; pts.push(`${(ax + Math.cos(a) * r).toFixed(1)},${(ay + Math.sin(a) * r).toFixed(1)}`); }
    o.push(`<polygon points="${pts.join(' ')}" fill="${acc}" stroke="${acc}" stroke-width="3" stroke-linejoin="round"/>`);
  } else if (L.accessory === 'flower') {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; o.push(`<circle cx="${ax + Math.cos(a) * 8}" cy="${ay + Math.sin(a) * 8}" r="6.5" fill="${acc}"/>`); }
    o.push(`<circle cx="${ax}" cy="${ay}" r="4.6" fill="#ffe27a"/>`);
  } else if (L.accessory === 'bow') {
    o.push(`<path d="M${ax} ${ay} L${ax - 15} ${ay - 9} L${ax - 15} ${ay + 9} Z M${ax} ${ay} L${ax + 15} ${ay - 9} L${ax + 15} ${ay + 9} Z" fill="${acc}"/><circle cx="${ax}" cy="${ay}" r="4.5" fill="${shade(acc, 0.85)}"/>`);
  }
  return o.join('\n');
}

const looks = [
  { name: 'Default look', note: 'Puffs, shorts, starfish clip', pose: 'wave', skin: '#c98a5e', hair: '#2b1b14', eyes: '#5a3a22', style: 'puffs', outfit: 'shorts', top: '#1fa8a0', bottom: '#f2c14e', accent: '#ff7a59', accessory: 'starfish' },
  { name: 'Dress-up example 1', note: 'Long hair, dress, flower', pose: 'up', skin: '#e8b48c', hair: '#a8572a', eyes: '#2f7d4f', style: 'long', outfit: 'dress', top: '#f5f1e6', bottom: '#4f7fe0', accent: '#e0456b', accessory: 'flower' },
  { name: 'Dress-up example 2', note: 'Braids, shorts, bow', pose: 'wave', skin: '#6f4428', hair: '#2b1b14', eyes: '#5a3a22', style: 'braids', outfit: 'shorts', top: '#f2c14e', bottom: '#9a5fd6', accent: '#7ac74f', accessory: 'bow' },
  { name: 'Dress-up example 3', note: 'Ponytail, dress, fantasy hair', pose: 'down', skin: '#f6d3b8', hair: '#d94f70', eyes: '#2f6fb5', style: 'ponytail', outfit: 'dress', top: '#9a5fd6', bottom: '#1fa8a0', accent: '#f2c14e', accessory: 'starfish' },
];

const W = 1160, H = 900;
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system, Helvetica, Arial, sans-serif">
<defs>
<linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0f5"/><stop offset="1" stop-color="#d8f3ff"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c8fc2"/><stop offset="1" stop-color="#4fd0d0"/></linearGradient>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1440"/><stop offset="1" stop-color="#3a2a78"/></linearGradient>
<linearGradient id="nsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14306a"/><stop offset="1" stop-color="#0d6a8a"/></linearGradient>
<clipPath id="c0"><rect width="350" height="200" rx="16"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#fbf6ea"/>
<text x="40" y="52" font-size="28" font-weight="700" fill="#22313f">Voyager Mirror: character and scene concepts</text>
<text x="40" y="80" font-size="15" fill="#5b6770">An original sea explorer. Your niece picks the hair, skin tone, eye color, outfit, colors and hair clip.</text>`;
looks.forEach((L, i) => {
  const x = 40 + i * 275;
  s += `<g transform="translate(${x} 104)"><rect width="255" height="400" rx="18" fill="#fff" stroke="#e7dcc4"/>
<ellipse cx="127" cy="343" rx="62" ry="9" fill="#000" opacity="0.08"/>
<g transform="translate(17 22) scale(1.1)">${character(L, L.pose)}</g>
<text x="127" y="368" text-anchor="middle" font-size="16" font-weight="700" fill="#22313f">${L.name}</text>
<text x="127" y="388" text-anchor="middle" font-size="13" fill="#5b6770">${L.note}</text></g>`;
});
s += `<text x="40" y="552" font-size="20" font-weight="700" fill="#22313f">Puppet mode scenes</text>`;
const mini = (L, sc, x, y) => `<g transform="translate(${x} ${y}) scale(${sc})">${character(L, 'wave')}</g>`;
// beach
s += `<g transform="translate(40 572)"><g clip-path="url(#c0)"><rect width="350" height="200" fill="url(#day)"/><circle cx="286" cy="46" r="24" fill="#ffe27a"/>
<ellipse cx="70" cy="40" rx="34" ry="11" fill="#fff" opacity="0.9"/><ellipse cx="96" cy="48" rx="26" ry="9" fill="#fff" opacity="0.9"/>
<rect y="104" width="350" height="46" fill="url(#sea)"/><path d="M0 146 Q60 136 120 146 T240 146 T360 146 L360 156 L0 156 Z" fill="#fff" opacity="0.8"/>
<rect y="150" width="350" height="50" fill="#f3dba0"/>
<path d="M300 160 Q292 110 306 74" fill="none" stroke="#8a5a34" stroke-width="8" stroke-linecap="round"/>
<path d="M306 74 Q270 60 252 82 M306 74 Q286 44 262 46 M306 74 Q320 44 346 52 M306 74 Q336 70 348 92" fill="none" stroke="#3f9c4f" stroke-width="9" stroke-linecap="round"/>
<ellipse cx="150" cy="184" rx="30" ry="5" fill="#000" opacity="0.12"/>${mini(looks[0], 0.5, 100, 42)}</g>
<text x="175" y="226" text-anchor="middle" font-size="15" font-weight="700" fill="#22313f">Beach</text></g>`;
// open ocean with raft
s += `<g transform="translate(405 572)"><g clip-path="url(#c0)"><rect width="350" height="200" fill="url(#day)"/><ellipse cx="270" cy="38" rx="40" ry="12" fill="#fff" opacity="0.9"/>
<rect y="96" width="350" height="104" fill="url(#sea)"/>
<path d="M0 120 Q30 114 60 120 T120 120 T180 120 T240 120 T300 120 T360 120" fill="none" stroke="#fff" stroke-width="2" opacity="0.6"/>
<rect x="238" y="60" width="6" height="112" fill="#8a5a34"/><path d="M246 64 L312 150 L246 150 Z" fill="#fff7e0" stroke="#e6cfae" stroke-width="2"/>
<path d="M246 86 L262 86 M246 108 L279 108 M246 130 L296 130" stroke="#ff7a59" stroke-width="4"/>
${mini(looks[1], 0.5, 110, 30)}
<rect x="90" y="170" width="200" height="14" rx="7" fill="#b07a48"/><rect x="98" y="180" width="184" height="10" rx="5" fill="#8a5a34"/>
<path d="M0 190 Q40 180 80 190 T160 190 T240 190 T320 190 T400 190 L400 200 L0 200 Z" fill="#fff" opacity="0.55"/></g>
<text x="175" y="226" text-anchor="middle" font-size="15" font-weight="700" fill="#22313f">Open ocean on a raft</text></g>`;
// night
let stars = ''; for (let i = 0; i < 46; i++) { const x = (i * 97) % 350, y = (i * 53) % 96, r = 0.8 + (i % 3) * 0.6; stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}"/>`; }
let glow = ''; for (let i = 0; i < 26; i++) { const x = (i * 71) % 350, y = 112 + (i * 29) % 36; glow += `<circle cx="${x}" cy="${y}" r="2" fill="#7df5e6" opacity="0.8"/>`; }
s += `<g transform="translate(770 572)"><g clip-path="url(#c0)"><rect width="350" height="200" fill="url(#night)"/>${stars}<circle cx="290" cy="44" r="20" fill="#fff6d6"/><circle cx="282" cy="40" r="18" fill="#141b4a" opacity="0.55"/>
<rect y="104" width="350" height="46" fill="url(#nsea)"/>${glow}<rect y="150" width="350" height="50" fill="#6b5a86"/>
<ellipse cx="150" cy="184" rx="30" ry="5" fill="#000" opacity="0.25"/>${mini(looks[2], 0.5, 100, 42)}</g>
<text x="175" y="226" text-anchor="middle" font-size="15" font-weight="700" fill="#22313f">Starry night with glowing water</text></g>`;
s += `<text x="40" y="852" font-size="14" fill="#5b6770">The 3D version keeps these shapes and colors, with a rounder head, moving eyes, eyelids, eyebrows and mouth, and hair that swings.</text>
<text x="40" y="874" font-size="14" fill="#5b6770">Overlay mode uses the same character, stretched to fit over her in the live camera picture.</text></svg>`;
writeFileSync('concept-sheet.svg', s);
