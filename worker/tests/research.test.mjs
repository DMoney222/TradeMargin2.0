import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
const CAD=(name,price)=>'<html><script type="application/ld+json">'+JSON.stringify({
  "@context":"https://schema.org","@type":"Product",name,offers:{"@type":"Offer",price,priceCurrency:"CAD"}
})+'</script></html>';
const products={
 "5-4-x-6-x-8-brown-pressure-treated-decking":CAD("5/4 x 6 x 8' Brown Pressure Treated Decking",7.99),
 "pressure-treated-5-4-x-6-x-8-premium-wood-decking":CAD("Pressure Treated 5/4 x 6 x 8' Premium Wood Decking (Above Ground Use Only)",5.29),
 "pressure-treated-d4s-wood-deck-board-5-4-in-x-6-in-x-8-ft":CAD("Pressure Treated D4S Wood Deck Board 5/4-in x 6-in x 8-ft - Brown",8.80),
 "54-x-6-x-8-pressure-treated-wood-decking":"<html><h1>5/4 x 6 x 8' Pressure Treated Decking</h1><p>Price in store</p></html>",
 "8-x-3-deck-screw-brown-500-pack":CAD('#8 x 3" Deck Screw Brown 500 Pack',23.99),
 "8-x-3-deck-screw-brown-100-pack":CAD('#8 x 3" Deck Screw Brown 100 Pack',9.99),
 "8-x-2-deck-screw-brown-500-pack":CAD('#8 x 2" Deck Screw Brown 500 Pack',19.99),
 "5-4x6x8-brown-pressure-treated-decking":'<html><h1>5/4"x6"x8&#39; Brown Pressure Treated Decking</h1><em class="price">$8.25</em><span class="per">Each</span></html>'
};
function makeMock(){
 const cache=new Map(),calls=[];
 globalThis.caches={default:{
  match:async req=>cache.get(req.url)||null,
  put:async(req,r)=>{cache.set(req.url,r)}
 }};
 globalThis.fetch=async(input)=>{
  const url=String(input);
  calls.push(url);
  if(url.includes("catalogsearch/result"))
   return new Response('<html><div id="product-list">'+
    '<a class="product-item-link" href="https://kent.ca/en/8-x-3-deck-screw-brown-500-pack-1853850-brn">#8 x 3&quot; Deck Screw Brown 500 Pack</a>'+
    '<a class="product-item-link" href="https://kent.ca/en/8-x-3-deck-screw-brown-100-pack-1853850-brn">#8 x 3&quot; Deck Screw Brown 100 Pack</a>'+
    '<a class="product-item-link" href="https://kent.ca/en/8-x-2-deck-screw-brown-500-pack-1853850-brn">#8 x 2&quot; Deck Screw Brown 500 Pack</a></div></html>',{status:200});
  if(url.includes("bing.com"))return new Response('<?xml version="1.0"?><rss><channel></channel></rss>',{status:200});
  for(const [key,body] of Object.entries(products)){
   if(url.includes(key))return new Response(body,{status:200,headers:{"Content-Type":"text/html"}});
  }
  return new Response("<html><body>No usable price listings</body></html>",{status:200});
 };
 return calls;
}
const ctx={waitUntil:p=>p};
test("service responds with version and correct API mode",async()=>{
 makeMock();
 const r=await worker.fetch(new Request("https://trademargin.test/health"),{},ctx);
 const value=await r.json();
 assert.equal(value.ok,true);
 assert.equal(value.version,"3.6.2");
 assert.equal(value.paid_api,false);
});
test("finds only correct 5/4x6x8 pressure-treated prices and ignores stores without prices",async()=>{
 const calls=makeMock();
 const req=new Request("https://trademargin.test/search?query="+encodeURIComponent("Deck boards pressure treated 5/4 x 6 x 8 ft"));
 const r=await worker.fetch(req,{},ctx);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.offers.length,4,JSON.stringify(data.suppliers));
 const byStore=Object.fromEntries(data.offers.map(o=>[o.store,o]));
 assert.equal(byStore["Lyons Timber Mart (Ontario)"]?.price,8.25);
 assert.equal(byStore.Kent.price,7.99);
 assert.equal(byStore["Home Depot Canada"].price,5.29);
 assert.equal(byStore.RONA.price,8.8);
 assert.equal(byStore["Home Hardware"],undefined);
 for(const offer of data.offers){
  assert.equal(offer.currency,"CAD");
  assert.match(offer.name,/pressure.?treated/i);
  assert.match(offer.name,/(deck(?:ing)?|deck board)/i);
  assert.match(offer.name,/5\/4/);
  assert.equal(offer.store_verified,false);
 }
 const initial=calls.length;
 const cached=await (await worker.fetch(req,{},ctx)).json();
 assert.equal(cached.cached,true);
 assert.equal(calls.length,initial);
});
test("unrelated query never receives seeded deck-board products or invented prices",async()=>{
 makeMock();
 const req=new Request("https://trademargin.test/search?query="+encodeURIComponent("drywall screws 1 1/4"));
 const r=await worker.fetch(req,{},ctx);
 const data=await r.json();
 assert.deepEqual(data.offers,[]);
 assert.ok(data.note.includes("No store-specific Moncton"));
});
test("invalid queries are rejected",async()=>{
 makeMock();
 const r=await worker.fetch(new Request("https://trademargin.test/search?query=a"),{},ctx);
 assert.equal(r.status,400);
});

test("Kent on-site material research rejects wrong screw lengths",async()=>{
 makeMock();
 const r=await worker.fetch(new Request("https://trademargin.test/search?query="+encodeURIComponent("deck screws 3 inch")),{},ctx);
 const data=await r.json();
 const kent=data.offers.filter(o=>o.store==="Kent");
 assert.equal(kent.length,2,JSON.stringify(data.suppliers));
 assert.ok(kent.every(x=>/#8 x 3"/.test(x.name)));
 assert.equal(kent.find(x=>/500 Pack/.test(x.name)).price,23.99); // mock fixture only
});

test("trade distributor prices are not fabricated without approved account access",async()=>{
 makeMock();
 const data=await (await worker.fetch(new Request("https://trademargin.test/search?query="+encodeURIComponent("14/2 NMD90 75m cable")),{},ctx)).json();
 assert.equal(data.suppliers["Graybar Canada"].status,"account_required");
 assert.equal(data.suppliers["Eddy Group"].status,"account_required");
 assert.equal(data.offers.filter(o=>o.store==="Graybar Canada"||o.store==="Eddy Group").length,0);
});

test("14/2 75m wire does not return 12/2 or 14/3 or 150m cable",async()=>{
 makeMock();
 const originalFetch=globalThis.fetch;
 const names=[
  "Southwire 14/2 NMD90 75M Romex SIMpull Electrical Wire - White",
  "Southwire 14/2 NMD90 150M Romex SIMpull Electrical Wire - White",
  "Southwire 12/2 NMD90 75M Romex SIMpull Electrical Wire - Yellow"
 ];
 const urls=names.map((_,i)=>"https://www.homedepot.ca/product/electrical-wire-"+(10000001+i));
 globalThis.fetch=async(url)=>{
  url=String(url);
  if(url.includes("bing.com")&&url.includes("homedepot.ca")){
   return new Response('<rss><channel>'+urls.map(link=>'<item><link>'+link+'</link></item>').join('')+'</channel></rss>',{status:200});
  }
  const idx=urls.indexOf(url);
  if(idx>=0)return new Response(CAD(names[idx],idx?99:79),{status:200});
  return originalFetch(url);
 };
 const result=await (await worker.fetch(new Request("https://test.local/search?query="+encodeURIComponent("14/2 NMD90 75m cable")),{},ctx)).json();
 const offers=result.offers.filter(x=>x.store==="Home Depot Canada");
 assert.equal(offers.length,1,JSON.stringify(offers));
 assert.equal(offers[0].name,names[0]);
});

test("specified screw pack count 500 excludes identical screw sold in 100 pack",async()=>{
 makeMock();
 const query="deck screws #8 x 3 inch 500 pack";
 const r=await worker.fetch(new Request("https://trademargin.test/search?query="+encodeURIComponent(query)),{},ctx);
 assert.equal(r.status,200);
 const data=await r.json();
 const kent=data.offers.filter(o=>o.store==="Kent");
 assert.equal(kent.length,1,JSON.stringify(data.suppliers));
 assert.match(kent[0].name,/500 Pack/);
 assert.equal(kent[0].price,23.99); // mock fixture, NOT a real advertised price
});

test("aggregate lowPrice is not a verified purchasable price",async()=>{
 makeMock();
 const prior=globalThis.fetch;
 const url="https://www.homedepot.ca/product/electrical-wire-10000001";
 globalThis.fetch=async input=>{
  const u=String(input);
  if(u.includes("bing.com")&&u.includes("homedepot.ca"))return new Response("<rss><channel><item><link>"+url+"</link></item></channel></rss>");
  if(u===url)return new Response('<script type="application/ld+json">'+JSON.stringify({
   "@type":"Product",name:"Southwire 14/2 NMD90 75m cable",
   offers:{"@type":"AggregateOffer",lowPrice:15,highPrice:125,priceCurrency:"CAD"}
  })+"</script>");
  return prior(input);
 };
 const q=encodeURIComponent("14/2 NMD90 75m cable");
 const data=await (await worker.fetch(new Request("https://test.local/search?query="+q),{},ctx)).json();
 assert.equal(data.offers.filter(x=>x.store==="Home Depot Canada").length,0);
});


test("unspecified fastener pack count warns against comparing unlike package prices",async()=>{
 makeMock();
 const vague=await (await worker.fetch(new Request("https://trademargin.test/search?query="+encodeURIComponent("deck screws 3 inch")),{},ctx)).json();
 assert.match(vague.comparison_warning,/package quantity not specified/i);
 const specified=await (await worker.fetch(new Request("https://trademargin.test/search?query="+encodeURIComponent("deck screws #8 x 3 inch 500 pack")),{},ctx)).json();
 assert.equal(specified.comparison_warning,null);
});


test("supplier diagnostics count access-denied failures without treating them as out of stock",async()=>{
 makeMock();
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url.includes("homedepot.ca"))return new Response("Forbidden",{status:403});
  return original(input);
 };
 const result=await (await worker.fetch(new Request("https://test.local/search?query="+encodeURIComponent("Deck boards pressure treated 5/4 x 6 x 8 ft")),{},ctx)).json();
 const supplier=result.suppliers["Home Depot Canada"];
 assert.equal(supplier.status,"limited");
 assert.ok(supplier.failures.access_denied>=1,JSON.stringify(supplier));
 assert.match(supplier.note,/does not mean products are unavailable/i);
 assert.equal(result.offers.some(x=>x.store==="Home Depot Canada"),false);
});
