// RUN WITH THE CLIENT TSCONFIG — visioSelect imports "@/lib/visioSchedule",
// and that alias only resolves against artifacts/mymonastery/tsconfig.json:
//   DATABASE_URL="postgres://x:x@localhost:5/x" \
//     ../../mymonastery/node_modules/.bin/tsx \
//     --tsconfig ../../mymonastery/tsconfig.json <this file>
// (The DATABASE_URL is a dummy — the ordo builder is pure, it just wants the
// env var present at import time.)
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { matchScore, chooseArtwork, parseRef } from "../../mymonastery/src/lib/visioSelect.ts";
const start = new Date(Date.UTC(2026, 0, 1));
const norm = (r) => r.replace(/[\[\]]/g, "").replace(/\(([^)]*)\)/g, ", $1").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
const isPs = b => b==="psalm"||b==="psalms", isGos = b => /^(matt|mark|luke|john)/.test(b);
const tierOf = (refs) => { const g=[],m=[],p=[]; for(const l of refs){const q=parseRef(l); if(!q)continue; (isGos(q.book)?g:isPs(q.book)?p:m).push(l);} return [g,m,p]; };
let prev=null, repeats=0, singles=0, multi=[];
for (let i=0;i<730;i++){
  const d=new Date(start.getTime()+i*86400000), ymd=d.toISOString().slice(0,10);
  let day; try{day=buildOfficeOrdoDay(d);}catch{continue;}
  const refs=[...new Set([...day.morning.lessons.map(l=>l.ref),...day.evening.lessons.map(l=>l.ref),
    ...(day.morning.psalms??[]).map(p=>`Psalm ${p}`),...(day.evening.psalms??[]).map(p=>`Psalm ${p}`)].filter(Boolean).map(norm))];
  const c=chooseArtwork(ymd,refs);
  // size of the winning tie set
  let size=0;
  for(const t of tierOf(refs)){
    const sc=ACT_CATALOGUE.map(a=>({a,s:matchScore(a.refs,t)})).filter(x=>x.s>0);
    if(!sc.length) continue; const top=Math.max(...sc.map(x=>x.s)); if(top<2) continue;
    size=sc.filter(x=>x.s===top).length; break;
  }
  if(prev===c.art.id){ repeats++; if(size<=1) singles++; else multi.push(`${ymd} tieset=${size} "${c.art.title.slice(0,30)}"`); }
  prev=c.art.id;
}
console.log(`consecutive repeats: ${repeats} | genuine single-match: ${singles} | avoidable: ${repeats-singles}`);
multi.slice(0,10).forEach(x=>console.log("  ",x));
