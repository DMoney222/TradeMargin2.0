/**
 * TradeMargin independent public-web price research (v3)
 * Cloudflare Worker: public retailer pages, verified CAD amounts only.
 * No paid API, no fabricated "live" prices, no local-stock claims.
 */
const VERSION="3.0.0";
const SHOPS={
  "Kent":"kent.ca",
  "Home Depot Canada":"homedepot.ca",
  "RONA":"rona.ca",
  "Home Hardware":"homehardware.ca",
  "Canadian Tire":"canadiantire.ca"
};
const ORIGIN="https://dmoney222.github.io";
const CORS={
 "Content-Type":"application/json; charset=utf-8",
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Methods":"GET,OPTIONS",
 "Access-Control-Allow-Headers":"Content-Type",
 "X-Content-Type-Options":"nosniff"
};
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:CORS});
const now=()=>new Date().toISOString();
function permitted(url,host){
 try{const p=new URL(url);return p.protocol==="https:"&&(p.hostname===host||p.hostname.endsWith("."+host))}catch{return false}
}
function unescapeEntities(s){
 return String(s).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#(?:39|x27);|&apos;/gi,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)));
}
function stripHtml(s){return unescapeEntities(String(s).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim())}
async function readPage(url, allowedHost, maxBytes=720000){
 if(!permitted(url,allowedHost))throw Error("URL outside permitted host");
 let current=url;
 for(let redirects=0;redirects<3;redirects++){
  const r=await fetch(current,{
   headers:{"Accept":"text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.8,*/*;q=0.4",
     "User-Agent":"Mozilla/5.0 (compatible; TradeMarginResearch/3.0; price-research)"},
   redirect:"manual",signal:AbortSignal.timeout(7000)
  });
  if(r.status>=300&&r.status<400){
   const link=r.headers.get("location");
   if(!link)throw Error("Redirect without target");
   const target=new URL(link,current).href;
   if(!permitted(target,allowedHost))throw Error("Blocked redirect outside retailer");
   current=target;
   continue;
  }
  if(!r.ok)throw Error("HTTP "+r.status);
  const size=Number(r.headers.get("content-length")||0);
  if(size>maxBytes)throw Error("Page too large");
  const reader=r.body?.getReader();
  if(!reader)return (await r.text()).slice(0,maxBytes);
  let bytes=0,chunks=[];
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes){await reader.cancel();break}
   chunks.push(value);
  }
  return new TextDecoder().decode(Uint8Array.from(chunks.flatMap(b=>[...b]))).slice(0,maxBytes);
 }
 throw Error("Too many redirects");
}
function jsonProducts(node,out=[]){
 if(Array.isArray(node)){for(const child of node)jsonProducts(child,out);return out}
 if(!node||typeof node!=="object")return out;
 const typ=Array.isArray(node["@type"])?node["@type"]:[node["@type"]];
 if(typ.some(x=>/^(?:https?:\/\/schema\.org\/)?Product$/i.test(String(x))))out.push(node);
 for(const k of ["@graph","mainEntity","itemListElement","item","mainEntityOfPage"])
  if(node[k])jsonProducts(node[k],out);
 return out;
}
function attributes(tag){
 const out={};
 for(const m of String(tag).matchAll(/([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(["'])(.*?)\2/g))out[m[1].toLowerCase()]=unescapeEntities(m[3]);
 return out;
}
function htmlMeta(doc){
 const meta={};
 for(const tag of doc.matchAll(/<meta\b[^>]*>/gi)){
  const a=attributes(tag[0]);
  const key=(a.property||a.name||"").toLowerCase();
  if(key&&a.content!==undefined)meta[key]=a.content;
 }
 return meta;
}
function productData(doc,url,store){
 const output=[];
 // JSON-LD is retailer-published source data, not a guessed search-snippet price.
 for(const hit of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/application\/ld\+json/i.test(hit[1]))continue;
  let data;
  try{data=JSON.parse(unescapeEntities(hit[2]))}catch{continue}
  for(const p of jsonProducts(data)){
   const name=typeof p.name==="string"?stripHtml(p.name):"";
   if(!name||name.length>300)continue;
   const offers=Array.isArray(p.offers)?p.offers:[p.offers];
   for(const o of offers){
    if(!o||typeof o!=="object")continue;
    const price=Number(String(o.price??o.lowPrice??"").replace(/,/g,""));
    const currency=String(o.priceCurrency||p.priceCurrency||"").toUpperCase();
    if(currency!=="CAD"||!Number.isFinite(price)||price<=0||price>100000)continue;
    const source=typeof o.url==="string"&&permitted(o.url,SHOPS[store])?o.url:url;
    output.push({store,name,price,currency:"CAD",currency_verified:true,url:source,
     checked_at:now(),source:"Retailer product structured data",store_verified:false,stock_verified:false});
   }
  }
 }
 // Strict standalone product page metadata fallback, not unrelated prices in a category.
 if(!output.length&&/\/(?:product\/|en\/[^/?]*\d[\d\w-]*|p\/\d{5,})/i.test(new URL(url).pathname)){
  const m=htmlMeta(doc);
  const price=Number(String(m["product:price:amount"]||m["og:price:amount"]||"").replace(/,/g,""));
  const currency=String(m["product:price:currency"]||m["og:price:currency"]||"").toUpperCase();
  const name=stripHtml(m["og:title"]||m["twitter:title"]||"");
  if(name&&currency==="CAD"&&Number.isFinite(price)&&price>0&&price<100000)
   output.push({store,name,price,currency:"CAD",currency_verified:true,url,
     checked_at:now(),source:"Retailer product price metadata",store_verified:false,stock_verified:false});
 }
 return output;
}
function lumberSize(value){
 const m=String(value).replace(/×/g,"x")
  .match(/(5\/4|\d+(?:\.\d+)?)\s*(?:in\.?|inches|["”])?\s*[x]\s*(\d+(?:\.\d+)?)\s*(?:in\.?|inches|["”])?\s*[x]\s*(\d+(?:\.\d+)?)(?:\s*(?:ft\.?|feet|foot|['’]))?/i);
 return m?{t:m[1]==="5/4"?1.25:Number(m[1]),w:Number(m[2]),l:Number(m[3])}:null;
}
function category(name){
 const t=String(name||"").toLowerCase();
 if(/kayak|paddle.?board|tech deck|board display/.test(t))return "irrelevant";
 if(/screwgun|screw gun|drill|driver/.test(t))return "tool";
 if(/\bdeck/.test(t)&&/screws?/.test(t))return "deck-screw";
 if(/drywall/.test(t)&&/screws?/.test(t))return "drywall-screw";
 if(/deck(?:ing)?\s*(?:boards?|planks?)|(?:boards?|planks?)\s*(?:for\s*)?deck(?:ing)?|(?:wood|pressure treated).*decking/i.test(t)||/\bdecking\b/.test(t))return "deck-board";
 if(/pex/.test(t)&&/pipe|tubing/.test(t))return "pex-pipe";
 if(/pex/.test(t)&&/elbow|fitting|adapter|coupling|tee/.test(t))return "pex-fitting";
 if(/14\s*[\/-]\s*2/.test(t)&&/wire|cable|nmd90|romex/.test(t))return "14-2-wire";
 if(/roofing nails?/.test(t))return "roof-nail";
 if(/shingles?/.test(t))return "shingle";
 return "";
}
function exactEnough(query,productName){
 const q=String(query||"").toLowerCase(),p=String(productName||"").toLowerCase();
 const a=category(q),b=category(p);
 if(b==="irrelevant"||b==="tool"||(a&&b!==a))return false;
 if(/pressure[\s-]*treated/.test(q)&&(!/pressure[\s-]*treated/.test(p)||/composite/.test(p)))return false;
 if(/composite/.test(q)&&!/composite/.test(p))return false;
 const qs=lumberSize(q);
 if(qs){
  const ps=lumberSize(p);
  if(!ps||Math.abs(qs.t-ps.t)>0.06||Math.abs(qs.w-ps.w)>0.06||Math.abs(qs.l-ps.l)>0.06)return false;
 }
 if(a)return true;
 const words=q.replace(/[^a-z0-9]+/g," ").split(" ").filter(w=>w.length>3&&!["price","canada","treated"].includes(w));
 const matched=words.filter(w=>p.includes(w)).length;
 return matched>=2&&matched>=Math.ceil(words.length*0.5);
}
const SEED_URLS={
 "Kent":["https://kent.ca/en/5-4-x-6-x-8-brown-pressure-treated-decking-1016532-brn"],
 "Home Depot Canada":["https://www.homedepot.ca/product/pressure-treated-5-4-x-6-x-8-premium-wood-decking-above-ground-use-only/1000680745"],
 "RONA":["https://www.rona.ca/en/product/pressure-treated-d4s-wood-deck-board-5-4-in-x-6-in-x-8-ft-brown-120-101-84895016"],
 "Home Hardware":["https://www.homehardware.ca/en/54-x-6-x-8-pressure-treated-wood-decking-tanatone/p/2835240"]
};
const CATEGORIES={
 "Kent":["https://kent.ca/en/shop/decking/deck-boards/pressure-treated-deck-boards"],
 "Home Depot Canada":["https://www.homedepot.ca/en/home/categories/building-materials/f/pressure-treated/5-4-x-6/wbc-44wo-3dh1"],
 "RONA":["https://www.rona.ca/en/building-supplies-and-materials/lumber-and-composites/pressure-treated-lumber/5-4-in-x-6-in--7747f"]
};
function isDeck5Quarter6x8(query){
 const d=lumberSize(query);
 return category(query)==="deck-board"&&/pressure[\s-]*treated/i.test(query)&&d&&d.t===1.25&&d.w===6&&d.l===8;
}
function webSearchTerms(query){
 const short=String(query).replace(/\b(?:price|CAD|Canada|ft|feet|inches|inch)\b/gi," ").replace(/\s+/g," ").trim();
 const deck=category(query)==="deck-board";
 const dims=lumberSize(query);
 const broad=deck?
  "pressure treated decking "+(dims?(dims.t===1.25?"5/4":dims.t)+" x "+dims.w+" x "+dims.l:""):
  short.split(/\s+/).slice(0,6).join(" ");
 return [...new Set([query,broad].filter(t=>t.length>=3))];
}
async function indexedPages(site,query){
 const urls=[];
 let error="";
 for(const phrase of webSearchTerms(query)){
  try{
   const rss=await readPage("https://www.bing.com/search?format=rss&q="+encodeURIComponent("site:"+site+" "+phrase),"bing.com",160000);
   for(const match of rss.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
    const href=match[1].match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
    if(!href)continue;
    const link=unescapeEntities(href[1].trim());
    if(permitted(link,site)&&!urls.includes(link))urls.push(link);
    if(urls.length>=3)break;
   }
   if(urls.length>=3)break;
  }catch(e){error=String(e.message)}
 }
 return {urls,error};
}
// Targeted retailer link pages are used when public search indexes fail.
function categoryProductLinks(html,url,site){
 const results=[];
 for(const hit of html.matchAll(/<a\b([^>]*href=["'][^"']+["'][^>]*)>([\s\S]{0,500}?)<\/a>/gi)){
  const attr=attributes(hit[1]);
  if(!attr.href)continue;
  let candidate;
  try{candidate=new URL(attr.href,url).href}catch{continue}
  if(!permitted(candidate,site))continue;
  const title=stripHtml(hit[2]);
  if(!/deck|treated|wood/i.test(title))continue;
  if(!/(?:product\/|\/en\/[^\/]+-\d{4,}|\/p\/\d+)/i.test(new URL(candidate).pathname))continue;
  if(!results.includes(candidate))results.push(candidate);
  if(results.length>=6)break;
 }
 return results;
}
async function searchStore(store,site,query){
 const s={store,checked:0,count:0,status:"no_prices",source:"public web"};
 const urls=[];
 const add=url=>{if(permitted(url,site)&&!urls.includes(url)&&urls.length<9)urls.push(url)};
 if(isDeck5Quarter6x8(query)){
  for(const u of SEED_URLS[store]||[])add(u);
  // If exact known pages are blocked, category pages may provide structured offers.
  for(const u of CATEGORIES[store]||[])add(u);
 }
 // General items use public search-index discovery.
 if(!urls.length){
  const res=await indexedPages(site,query);
  for(const u of res.urls)add(u);
  if(res.error)s.discovery_error=res.error.slice(0,100);
 }
 const productPages=[];
 const offers=[];
 await Promise.all(urls.map(async link=>{
  try{
   const html=await readPage(link,site,800000);
   s.checked++;
   offers.push(...productData(html,link,store).filter(o=>exactEnough(query,o.name)));
   if(isDeck5Quarter6x8(query)&&!(/\/product\/|\/en\/[^\/]+-\d{4,}|\/p\/\d+/.test(new URL(link).pathname))){
    productPages.push(...categoryProductLinks(html,link,site));
   }
  }catch(e){s.note=String(e.message).slice(0,100)}
 }));
 if(productPages.length){
  await Promise.all(productPages.slice(0,3).map(async link=>{
   if(urls.includes(link))return;
   try{
    const html=await readPage(link,site,800000);
    s.checked++;
    offers.push(...productData(html,link,store).filter(o=>exactEnough(query,o.name)));
   }catch(e){s.note=String(e.message).slice(0,100)}
  }));
 }
 const unique=new Map();
 for(const o of offers){
  const key=o.url+"|"+o.price;
  if(!unique.has(key))unique.set(key,o);
 }
 s.count=unique.size;
 s.status=s.count?"results":(s.note||s.discovery_error?"limited":"no_prices");
 if(!urls.length)s.note="No publicly indexed matching retailer pages";
 if(!s.count&&!s.note)s.note="Pages checked but no exact CAD-priced product data found";
 return {offers:[...unique.values()].slice(0,5),status:s};
}
export default {
 async fetch(request,env,ctx){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="GET")return response({error:"GET only"},405);
  const u=new URL(request.url);
  if(u.pathname==="/health")return response({ok:true,service:"TradeMargin Independent Research",version:VERSION,paid_api:false,
   discovery:"known product pages + index fallback",last_price_test:"not verified at deployment"});
  if(u.pathname!=="/search")return response({error:"Use /search?query=..."},404);
  const query=(u.searchParams.get("query")||"").trim();
  if(query.length<3||query.length>160||/[\u0000-\u001f]/.test(query))return response({error:"Query must be 3-160 characters"},400);
  const key=new Request("https://cache.trademargin.invalid/v3/"+encodeURIComponent(query.toLowerCase()));
  const cache=caches.default;
  try{
   const hit=await cache.match(key);
   if(hit)return response({...await hit.json(),cached:true});
  }catch{}
  const results=await Promise.all(Object.entries(SHOPS).map(([name,site])=>searchStore(name,site,query)));
  const offers=results.flatMap(r=>r.offers);
  const payload={query,updated_at:now(),cached:false,version:VERSION,offers,
   suppliers:Object.fromEntries(results.map(r=>[r.status.store,r.status])),
   note:"Only observed CAD prices. No store-specific Moncton or stock verification. Retailers may block automated access; no result does not mean an item is unavailable."};
  try{ctx.waitUntil(cache.put(key,new Response(JSON.stringify(payload),
   {headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=900"}})))}catch{}
  return response(payload);
 }
};