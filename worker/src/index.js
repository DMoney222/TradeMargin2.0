/**
 * TradeMargin independent product research API.
 * Public web index (Bing RSS) -> allowlisted retailer pages -> JSON-LD prices.
 * Does NOT control the user's Safari or use paid APIs. Not a guaranteed finder.
 * Deploy on Cloudflare Workers. No secrets required for basic operation.
 */
const SHOPS = {
  "Kent": "kent.ca",
  "Home Depot Canada": "homedepot.ca",
  "RONA": "rona.ca",
  "Home Hardware": "homehardware.ca",
  "Canadian Tire": "canadiantire.ca"
};
const ORIGIN = "https://dmoney222.github.io";
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff"
};
function reply(body, status=200, more={}) {
  return new Response(JSON.stringify(body), { status, headers: {...HEADERS,...more} });
}
function hostAllowed(url, domain) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === domain || u.hostname.endsWith("." + domain));
  } catch { return false }
}
function decodeXml(t) {
  return String(t).replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
async function fetchText(url, maxBytes=400000) {
  const r = await fetch(url, {
    headers: {"Accept":"text/html,application/rss+xml,application/xml;q=0.8,*/*;q=0.5",
      "User-Agent":"Mozilla/5.0 (compatible; TradeMarginPriceResearch/1.0)"},
    redirect:"follow", signal:AbortSignal.timeout(7500)
  });
  if(!r.ok)throw new Error("HTTP "+r.status);
  const size=Number(r.headers.get("content-length")||0);
  if(size>maxBytes)throw new Error("Page too large");
  const text=await r.text();
  return text.slice(0,maxBytes);
}

function discoveryQueries(query){
  const clean=String(query).replace(/\b(price|cad|canada|inches|inch|feet|foot|ft)\b/gi," ").replace(/\s+/g," ").trim();
  const isBoard=/deck\s*boards?|decking/i.test(clean);
  const treated=/pressure[\s-]*treated/i.test(clean);
  const size=clean.match(/(?:5\/4|\d+(?:\.\d+)?)\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+/i);
  const broad=isBoard?
    (treated?"pressure treated decking":"deck boards")+(size?" "+size[0]:""):
    clean.split(/\s+/).slice(0,5).join(" ");
  return [...new Set([query,broad].filter(q=>q.length>=3))];
}
async function indexSearch(site, query) {
  const urls=[];
  let lastError="";
  for(const phrase of discoveryQueries(query)){
    const request="https://www.bing.com/search?format=rss&q="+encodeURIComponent("site:"+site+" "+phrase);
    let xml="";
    try{xml=await fetchText(request,200000)}catch(e){lastError=String(e.message);continue}
    for(const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
      const link=item[1].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
      if(!link)continue;
      const candidate=decodeXml(link[1].trim());
      if(hostAllowed(candidate,site)&&!urls.includes(candidate))urls.push(candidate);
      if(urls.length>=3)break;
    }
    if(urls.length>=3)break;
  }
  if(!urls.length&&lastError)throw new Error("Search index unavailable: "+lastError);
  return urls;
}
function products(node, out=[]) {
  if(Array.isArray(node)) { for(const child of node) products(child,out);return out }
  if(!node||typeof node!=="object")return out;
  const type=node["@type"];
  if((Array.isArray(type)?type:[type]).some(t=>String(t).toLowerCase()==="product"))out.push(node);
  for(const key of ["@graph","mainEntity","itemListElement"])if(node[key])products(node[key],out);
  return out;
}
function structuredOffers(page, url, store) {
  const result=[];
  for(const script of page.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let obj;
    try {obj=JSON.parse(script[1].trim())} catch {continue}
    for(const product of products(obj)){
      const name=typeof product.name==="string"?product.name.trim():"";
      if(!name||name.length>350)continue;
      let offers=product.offers||[];
      if(!Array.isArray(offers))offers=[offers];
      for(const offer of offers){
        if(!offer||typeof offer!=="object")continue;
        // Only explicit CAD prices; never guess currency.
        if(String(offer.priceCurrency||"").toUpperCase()!=="CAD")continue;
        const price=Number(String(offer.price??offer.lowPrice??"").replace(/,/g,""));
        if(!Number.isFinite(price)||price<=0||price>100000)continue;
        const source=typeof offer.url==="string"&&hostAllowed(offer.url,SHOPS[store])?offer.url:url;
        result.push({store,name,price,currency:"CAD",currency_verified:true,
          url:source,checked_at:new Date().toISOString(),source:"Retailer structured Product/Offer",
          store_verified:false,stock_verified:false});
      }
    }
  }
  return result.slice(0,8);
}
async function retailerSearch(store, site, query) {
  const status={store,checked:0,status:"no_prices"};
  const offers=[];
  let pages;
  try {pages=await indexSearch(site,query)} catch(e){
    status.status="search_unavailable";
    status.note=String(e.message).slice(0,90);return {offers,status};
  }
  if(!pages.length){status.note="No indexed product pages found";return {offers,status}}
  await Promise.all(pages.map(async url=>{
    try {
      const page=await fetchText(url,600000);
      const offersOnPage=structuredOffers(page,url,store);
      offers.push(...offersOnPage);
      status.checked++;
    }catch(e){status.note="Some pages inaccessible";}
  }));
  status.status=offers.length?"results":"no_prices";
  status.count=offers.length;
  return {offers,status};
}
export default {
  async fetch(request, env, ctx){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
    if(request.method!=="GET")return reply({error:"GET only"},405);
    const url=new URL(request.url);
    if(url.pathname==="/health")return reply({ok:true,service:"TradeMargin Independent Research",mode:"public product-page research",paid_api:false});
    if(url.pathname!=="/search")return reply({error:"Use /search?query=... "},404);
    const query=(url.searchParams.get("query")||"").trim();
    if(query.length<3||query.length>160||/[\u0000-\u001f]/.test(query))return reply({error:"Search query must be 3–160 characters"},400);
    const key=new Request("https://cache.trademargin.invalid/v2/"+encodeURIComponent(query.toLowerCase()));
    const cache=caches.default;
    const cached=await cache.match(key);
    if(cached){const obj=await cached.json();return reply({...obj,cached:true})}
    const shops=Object.entries(SHOPS);
    // Run one retailer at a time to avoid bursts / resource exhaustion.
    const results=[];
    for(const [name,domain] of shops){
      results.push(await retailerSearch(name,domain,query));
    }
    const unique=new Map();
    for(const x of results)for(const o of x.offers){
      const id=o.store+"|"+o.url+"|"+o.name+"|"+o.price;
      if(!unique.has(id))unique.set(id,o);
    }
    const payload={query,updated_at:new Date().toISOString(),cached:false,
      offers:[...unique.values()],suppliers:Object.fromEntries(results.map(x=>[x.status.store,x.status])),
      note:"Experimental public-web data. Not guaranteed live, exhaustive, Moncton-local, or stock-verified. Product dimensions, package size, checkout price and availability require confirmation."};
    const cacheResponse=new Response(JSON.stringify(payload),{
      headers:{"Cache-Control":"public, max-age=900","Content-Type":"application/json"}});
    ctx.waitUntil(cache.put(key,cacheResponse));
    return reply(payload);
  }
};
