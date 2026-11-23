const websites=[
 ["BMR product","https://www.bmr.ca/en/atika-treated-wood-brown-5-4-x-6-x-8-041-3903.html"],
 ["BMR category","https://www.bmr.ca/en/building-materials/decks-and-patios/treated-wood.html"],
 ["Gerber Timber Mart","https://www.gerbertimbermart.ca/5-4x6x8-deck-board-brown-treated"],
 ["Lyons Timber Mart","https://lyonstimbermart.ca/shop/151908/5-4x6x8-brown-pressure-treated-decking/"],
 ["Graybar Canada","https://www.graybarcanada.com/electrical-distribution"],
 ["WESCO Canada","https://buy.wesco.ca/"],
 ["Eddy Group","https://www.eddygroup.com/248598/category/electrical"],
 ["Home Hardware","https://www.homehardware.ca/en/"],
 ["Home Depot Canada electrical","https://www.homedepot.ca/product/southwire-14-2-nmd90-75m-romex-simpull-electrical-wire-white/1000108206"]
];
for(const [name,url] of websites){
 try{
  const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(12000),headers:{"Accept":"text/html","User-Agent":"Mozilla/5.0"}});
  const html=(await r.text()).slice(0,3000000);
  const ld=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].length;
  const meta=[...html.matchAll(/<meta\b[^>]*(?:price:amount|price:currency)[^>]*>/gi)].slice(0,5).map(x=>x[0]);
  const priceSnips=[...html.matchAll(/\$\s?7[.,]38|\$\s?\d+[.]\d\d/g)].slice(0,5).map(x=>html.slice(Math.max(0,x.index-100),x.index+100).replace(/\s+/g," "));
  const jsonProduct=[...html.matchAll(/"@type"\s*:\s*"Product"/gi)].length;
  console.log("SITE",name,"HTTP",r.status,"FINAL",r.url,"SIZE",html.length,"LD",ld,"PRODUCT",jsonProduct,"META",JSON.stringify(meta),"SNIPS",JSON.stringify(priceSnips));
 }catch(e){console.log("SITE",name,"ERROR",String(e))}
}
