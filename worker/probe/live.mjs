const root="https://trademargin2-0.damonpatrickwalsh.workers.dev";
async function check(path,timeout=60000){
 const r=await fetch(root+path,{signal:AbortSignal.timeout(timeout)});
 const j=await r.json();return {code:r.status,data:j};
}
const health=await check("/health",12000);
console.log("HEALTH",JSON.stringify(health));
if(!health.data.ok||health.data.version!=="3.6.2")throw Error("Current research version not deployed");
for(const query of ["Deck boards pressure treated 5/4 x 6 x 8 ft","deck screws 3 inch"]){
 const r=await check("/search?query="+encodeURIComponent(query));
 console.log("QUERY",query,"HTTP",r.code,"CACHED",r.data.cached,"VERSION",r.data.version);
 console.log("SUPPLIERS",JSON.stringify(r.data.suppliers));
 console.log("OFFERS",JSON.stringify((r.data.offers||[]).map(o=>({store:o.store,name:o.name,price:o.price,currency:o.currency,url:o.url,checked_at:o.checked_at}))));
 if(r.code!==200||!Array.isArray(r.data.offers)||!r.data.suppliers||r.data.version!==health.data.version)process.exitCode=1;
 for(const [name, supplier] of Object.entries(r.data.suppliers||{})){
  if(!supplier||typeof supplier.status!=="string")throw Error("Missing supplier status: "+name);
  if(supplier.failures&&Object.values(supplier.failures).some(n=>!Number.isInteger(n)||n<0))throw Error("Invalid supplier failure count: "+name);
 }
 if(query.startsWith("deck screws")&&!r.data.comparison_warning)throw Error("Missing fastener comparison warning");
 if(query.startsWith("Deck boards")){
  const remote=r.data.offers?.find(o=>o.store==="Lyons Timber Mart (Ontario)");
  console.log("ONTARIO TIMBER MART LIVE PRICE",remote?JSON.stringify(remote):"No accessible online price");
  if(!remote)console.log("Ontario retailer temporarily unavailable; this is not an assertion of zero stock.");
 }
}
