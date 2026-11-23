const root="https://trademargin2-0.damonpatrickwalsh.workers.dev";
async function check(path,timeout=60000){
 const r=await fetch(root+path,{signal:AbortSignal.timeout(timeout)});
 const j=await r.json();return {code:r.status,data:j};
}
const health=await check("/health",12000);
console.log("HEALTH",JSON.stringify(health));
if(!health.data.ok||health.data.version!=="3.3.0")throw Error("Current research version not deployed");
for(const query of ["Deck boards pressure treated 5/4 x 6 x 8 ft","deck screws 3 inch"]){
 const r=await check("/search?query="+encodeURIComponent(query));
 console.log("QUERY",query,"HTTP",r.code,"CACHED",r.data.cached,"VERSION",r.data.version);
 console.log("SUPPLIERS",JSON.stringify(r.data.suppliers));
 console.log("OFFERS",JSON.stringify((r.data.offers||[]).map(o=>({store:o.store,name:o.name,price:o.price,currency:o.currency,url:o.url,checked_at:o.checked_at}))));
 if(!r.code||r.code!==200)process.exitCode=1;
 if(query.startsWith("Deck boards")&&!r.data.offers.some(o=>o.store==="Kent"))process.exitCode=1;
 if(query.startsWith("deck screws")&&!(r.data.offers||[]).some(o=>o.store==="Kent"))process.exitCode=1;
 if(query.startsWith("Deck boards")){
  const remote=r.data.offers?.find(o=>o.store==="Lyons Timber Mart (Ontario)");
  console.log("ONTARIO TIMBER MART LIVE PRICE",remote?JSON.stringify(remote):"No accessible online price");
  if(!remote)process.exitCode=1;
 }
}
