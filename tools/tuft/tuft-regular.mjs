/* How regular is the tuft across the blade? A perfectly even comb is a grating,
   and a grating is what prints a lattice. */
import fs from 'fs';
import { drawTuft, hairPath, nowHair } from './tuft-fill.js';
import { SPECS } from './tuft-specs.js';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const film = JSON.parse(fs.readFileSync(path.join(HERE, 'tuft-carrier.json'), 'utf8'));
const SLAB=0.55;
const cv = (v)=>{ if(v.length<2) return NaN; const m=v.reduce((a,b)=>a+b,0)/v.length; const s=Math.sqrt(v.reduce((a,b)=>a+(b-m)*(b-m),0)/v.length); return s/m; };
for(const slug of Object.keys(film)){
  const b=film[slug], J=b.def.segments+1, f=b.frames[20];
  const splay=1+b.def.splayFromPressure*(f.contact/(b.spineCount*J));
  const spec={...SPECS[slug], halfWidth:0.5*b.def.widthRatio*b.tuftLength};
  const hairs=drawTuft(spec);
  // Across-stroke position of every hair TIP (the stroke runs along +x, so the
  // comb's teeth are spaced in y — that spacing is the striation pitch).
  const nowY=[], newY=[];
  for(let i=0;i<b.def.bristles;i++){const h=nowHair(f,b.def,b.tuftLength,i,splay);
    for(let s=0;s<J;s++) if(h[s*3+2]<=SLAB) nowY.push(h[s*3+1]);}
  for(const hr of hairs){const p=hairPath(f,spec,hr,J-1);
    for(let s=0;s<J;s++) if(p[s*3+2]<=SLAB) newY.push(p[s*3+1]);}
  const gaps=(a)=>{const u=[...new Set(a.map(v=>+v.toFixed(4)))].sort((x,y)=>x-y);const g=[];for(let i=1;i<u.length;i++)g.push(u[i]-u[i-1]);return g;};
  const gn=gaps(nowY), gp=gaps(newY);
  console.log(b.def.name.padEnd(12),
    `now  ${String(gn.length+1).padStart(3)} distinct tracks, gap spread ${(cv(gn)*100).toFixed(0).padStart(3)}%`,
    ` | proposed ${String(gp.length+1).padStart(3)} tracks, gap spread ${(cv(gp)*100).toFixed(0).padStart(3)}%`);
}
