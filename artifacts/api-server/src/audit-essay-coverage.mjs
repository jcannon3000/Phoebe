// RUN WITH THE CLIENT TSCONFIG (see the other audit scripts' heads).
// How often does the day's chosen artwork actually HAVE a VCS reflection?
import { buildOfficeOrdoDay } from "./lib/officeOrdo.ts";
import { ACT_CATALOGUE } from "../../mymonastery/src/lib/visioCatalogue.ts";
import { chooseArtwork } from "../../mymonastery/src/lib/visioSelect.ts";

const norm = (r) => r.replace(/[\[\]]/g,"").replace(/\(([^)]*)\)/g,", $1").replace(/\s+,/g,",").replace(/\s+/g," ").trim();
const ok = (e) => { if (!e) return false; try { return /^https?:$/.test(new URL(e).protocol); } catch { return false; } };

console.log(`catalogue: ${ACT_CATALOGUE.length} works, ${ACT_CATALOGUE.filter(a=>ok(a.essay)).length} with a usable essay`);
const start = new Date(Date.UTC(2026,0,1));
let withEssay = 0, without = 0, total = 0;
const missing = [];
for (let i=0;i<730;i++){
  const d=new Date(start.getTime()+i*86400000), ymd=d.toISOString().slice(0,10);
  let day; try { day=buildOfficeOrdoDay(d); } catch { continue; }
  const refs=[...new Set([...day.morning.lessons.map(l=>l.ref),...day.evening.lessons.map(l=>l.ref),
    ...(day.morning.psalms??[]).map(p=>`Psalm ${p}`),...(day.evening.psalms??[]).map(p=>`Psalm ${p}`)].filter(Boolean).map(norm))];
  const c=chooseArtwork(ymd,refs); total++;
  if (ok(c.art.essay)) withEssay++; else { without++; if (missing.length<6) missing.push(`${ymd} "${c.art.title.slice(0,32)}"`); }
}
console.log(`\ndays WITH a reflection:    ${withEssay}/${total}  (${(100*withEssay/total).toFixed(1)}%)`);
console.log(`days WITHOUT:              ${without}/${total}  (${(100*without/total).toFixed(1)}%)`);
missing.forEach(m=>console.log("   no essay:", m));
