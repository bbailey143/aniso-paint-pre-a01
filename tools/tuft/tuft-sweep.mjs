import fs from 'fs';
import { drawTuft, hairPath } from './tuft-fill.js';
import { SPECS, bundleRadius } from './tuft-specs.js';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const film = JSON.parse(fs.readFileSync(path.join(HERE, 'tuft-carrier.json'), 'utf8'));
const SLAB=0.55;
function hull(pts){if(pts.length<3)return pts;const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}lo.pop();up.pop();return lo.concat(up);}
const area=h=>{let a=0;for(let i=0;i<h.length;i++){const j=(i+1)%h.length;a+=h[i][0]*h[j][1]-h[j][0]*h[i][1];}return Math.abs(a)/2;};
function cov(pts,r){if(!pts.length)return 0;const C=0.15;let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const p of pts){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}x0-=r+C;x1+=r+C;y0-=r+C;y1+=r+C;const W=Math.ceil((x1-x0)/C),H=Math.ceil((y1-y0)/C);const g=new Uint8Array(W*H);const rc=Math.ceil(r/C);for(const p of pts){const cx=Math.round((p[0]-x0)/C),cy=Math.round((p[1]-y0)/C);for(let dy=-rc;dy<=rc;dy++)for(let dx=-rc;dx<=rc;dx++){if(dx*dx+dy*dy>rc*rc)continue;const gx=cx+dx,gy=cy+dy;if(gx<0||gy<0||gx>=W||gy>=H)continue;g[gy*W+gx]=1;}}
const h2=hull(pts.map(p=>[p[0],p[1]]));const ins=(x,y)=>{let c=false;for(let i=0,j=h2.length-1;i<h2.length;j=i++){if((h2[i][1]>y)!==(h2[j][1]>y)&&x<(h2[j][0]-h2[i][0])*(y-h2[i][1])/(h2[j][1]-h2[i][1])+h2[i][0])c=!c;}return c;};
let on=0;for(let gy=0;gy<H;gy++)for(let gx=0;gx<W;gx++){if(!g[gy*W+gx])continue;if(ins(x0+gx*C,y0+gy*C))on++;}
const A=area(h2);return A>0?on*C*C/A:0;}
for(const slug of Object.keys(film)){const b=film[slug];const hw=0.5*b.def.widthRatio*b.tuftLength;const J=b.def.segments+1;
 const row=[];
 for(const n of [40,60,80,100,120,150,180]){const spec={...SPECS[slug],count:n,halfWidth:hw};const hs=drawTuft(spec);const r=bundleRadius(spec,hw);
  const out=[];for(const fi of [20,25]){const f=b.frames[fi];const pts=[];for(const h of hs){const p=hairPath(f,spec,h,J-1);for(let s=0;s<J;s++)if(p[s*3+2]<=SLAB)pts.push([p[s*3],p[s*3+1]]);}out.push(Math.round(cov(pts,r)*100));}
  row.push(`${n}:${out[0]}/${out[1]}%(r${r.toFixed(2)},${hs.length*J}seg)`);}
 console.log(b.def.name.padEnd(12), row.join('  '));}
