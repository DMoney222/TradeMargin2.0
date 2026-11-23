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
 "54-x-6-x-8-pressure-treated-wood-decking":"<html><h1>5/4 x 6 x 8' Pressure Treated Decking</h1><p>Price in store</p></html>"
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
 assert.equal(value.version,"3.0.0");
 assert.equal(value.paid_api,false);
});
test("finds only correct 5/4x6x8 pressure-treated prices and ignores stores without prices",async()=>{
 const calls=makeMock();
 const req=new Request("https://trademargin.test/search?query="+encodeURIComponent("Deck boards pressure treated 5/4 x 6 x 8 ft"));
 const r=await worker.fetch(req,{},ctx);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.offers.length,3,JSON.stringify(data.suppliers));
 const byStore=Object.fromEntries(data.offers.map(o=>[o.store,o]));
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
