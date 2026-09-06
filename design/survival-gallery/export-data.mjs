import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base=process.env.GALLERY_API_BASE ?? "http://localhost:3000";
const data=[];
for(const year of [1992,2003,2015]) {
  const response=await fetch(`${base}/api/game/classic/${year}`);
  if(!response.ok)throw new Error(`Classic archive ${year}: ${response.status}`);
  const d=await response.json();
  if(d.season!==year||d.table.some(r=>r.pointsAdjustment!==0))throw new Error("Unsupported gallery archive");
  d.archiveKey=createHash("sha256").update(JSON.stringify(d)).digest("hex");
  data.push(d);
}
const logos={};
for(const id of new Set(data.flatMap(d=>d.clubIds))) {
  const bytes=await readFile(`public/logos/${id}.png`);
  logos[id]=`data:image/png;base64,${bytes.toString("base64")}`;
}
await mkdir("artifacts/survival-gallery",{recursive:true});
await writeFile("artifacts/survival-gallery/data.json",JSON.stringify(data));
await writeFile("artifacts/survival-gallery/logos.json",JSON.stringify(logos));
console.log("Exported real Classic archives and local crests");
