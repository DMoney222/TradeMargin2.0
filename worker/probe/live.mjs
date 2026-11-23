/* One-time live endpoint diagnostic. No credentials, no price fabrication. */
const root="https://trademargin2-0.damonpatrickwalsh.workers.dev";
async function get(url,ms=16000){
 const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(ms),headers:{"User-Agent":"Mozilla/5.0 TradeMarginPublicResearchTest/1.0"}});
 const body=await r.text();return {http:r.status,body};
}
console.log("WORKER URL:",root);
let health=null;
for(let i=0;i<4;i++){
 try{
  const r=await get(root+"/health");
  health=JSON.parse(r.body);
  console.log("HEALTH",r.http,JSON.stringify(health));
  if(health.version==="3.0.0")break;
 }catch(e){console.log("HEALTH ERROR:",String(e).slice(0,200))}
 await new Promise(ok=>setTimeout(ok,10000));
}
if(health?.version!=="3.0.0"){
 console.error("FAIL: Deployed Worker does not advertise v3 yet.");
 process.exitCode=1;
}
const q="Deck boards pressure treated 5/4 x 6 x 8 ft";
try{
 const r=await get(root+"/search?query="+encodeURIComponent(q),57000);
 const result=JSON.parse(r.body);
 console.log("SEARCH HTTP",r.http,"VERSION",result.version,"COUNT",result.offers?.length);
 console.log("STORES",JSON.stringify(result.suppliers));
 console.log("OFFERS",JSON.stringify((result.offers||[]).map(o=>({store:o.store,name:o.name,price:o.price,currency:o.currency,source:o.source,url:o.url}))));
 if(!result.offers?.length)console.error("LIVE WORKER HAS NO EXACT PRODUCT PRICES");
}catch(e){console.log("SEARCH ERROR:",String(e));process.exitCode=1;}
const urls={
 Kent:"https://kent.ca/en/5-4-x-6-x-8-brown-pressure-treated-decking-1016532-brn",
 HomeDepot:"https://www.homedepot.ca/product/pressure-treated-5-4-x-6-x-8-premium-wood-decking-above-ground-use-only/1000680745",
 RONA:"https://www.rona.ca/en/product/pressure-treated-d4s-wood-deck-board-5-4-in-x-6-in-x-8-ft-brown-120-101-84895016"
};
for(const [store,url] of Object.entries(urls)){
 try{
  const r=await get(url,14000);
  const scripts=[...r.body.matchAll(/<script\b([^>]*)>/gi)].filter(m=>/application\/ld\+json/i.test(m[1])).length;
  const amt=(r.body.match(/<(?:meta)\b[^>]*(?:product:price:amount|og:price:amount)[^>]*>/i)||[])[0]||"none";
  console.log("RETAILER",store,"HTTP",r.http,"BYTES",r.body.length,"JSONLD",scripts,"META",amt.slice(0,300));
 }catch(e){console.log("RETAILER",store,"ERROR",String(e).slice(0,250))}
}

console.log("GENERIC KENT SEARCH DISCOVERY:");
for(const path of [
 "https://kent.ca/en/catalogsearch/result/?q=deck%20screws",
 "https://kent.ca/en/search?q=deck%20screws",
 "https://kent.ca/en/catalogsearch/result/?q=pressure%20treated%20decking",
 "https://www.homedepot.ca/search?q=pressure%20treated%20decking"
]){
 try{
  const r=await get(path,12000);
  const title=(r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"none";
  const productLinks=[...r.body.matchAll(/href=["'](https:\/\/(?:www\.)?(?:kent\.ca|homedepot\.ca)\/(?:en\/|product\/)[^"']+)["']/g)]
   .map(x=>x[1]).filter(x=>/screw|deck|wood/i.test(x)).slice(0,4);
  const at=r.body.indexOf("product-item-link");
  const at2=r.body.indexOf("product-item");
  const dom=r.body.match(/<a\\b[^>]*class=["'][^"']*product-item-link[^"']*["'][^>]*>/i);
  const domAt=dom?dom.index:-1;
  const domSnip=dom? r.body.slice(domAt,domAt+800).replace(/\\s+/g," ").slice(0,480):"";
  const listAt=r.body.indexOf('id="product-list"');
  const ldCount=[...r.body.matchAll(/<script\\b([^>]*)>/gi)].filter(m=>/application\\/ld\\+json/i.test(m[1])).length;
  const after=at>=0?r.body.slice(Math.max(0,at-200),at+900).replace(/\s+/g," ").slice(0,500):"";
  console.log("QUERY PAGE",path,"HTTP",r.http,"LEN",r.body.length,"TITLE",title.trim().slice(0,100),"LINKS",JSON.stringify(productLinks),"ITEM_OFFSET",at,"FIRST_PRODUCT_OFFSET",at2,"REAL_ITEM",domAt,"LIST",listAt,"JSONLD",ldCount,"PRODUCT_SNIPPET",after,"REAL_SNIP",domSnip);
 }catch(e){console.log("QUERY ERROR",path,String(e).slice(0,140))}
}
