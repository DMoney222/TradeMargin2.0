/**
 * One-time Home Depot Canada public-API connectivity diagnostic.
 * No credentials, no bypass, one request to documented browser-facing endpoint.
 */
import {execFileSync} from "node:child_process";
const url="https://www.homedepot.ca/api/search/v1/search?q="+encodeURIComponent("14/2 NMD90 75M")+"&storeId=9999&lang=en&page=0&pageSize=2";
for(const client of ["fetch","curl"]){
 try{
  let status="",body="";
  if(client==="fetch"){
   const r=await fetch(url,{signal:AbortSignal.timeout(9000),headers:{"Accept":"application/json"}});
   status=r.status;body=(await r.text()).slice(0,150000);
  }else{
   const data=execFileSync("curl",["--http2","--compressed","--silent","--show-error","--max-time","12","--write-out","\\n%{http_code}",url],{timeout:16000,encoding:"utf8",maxBuffer:2000000});
   const i=data.lastIndexOf("\n");status=data.slice(i+1).trim();body=data.slice(0,i);
  }
  let parsed=null;try{parsed=JSON.parse(body)}catch{}
  console.log("HOME DEPOT",client,"HTTP",status,"BODY",body.length,"PARSED",!!parsed,
   "ITEMS",parsed?.products?.slice(0,2).map(p=>({code:p.code,name:p.name,price:p.pricing?.displayPrice}))||[],
   "ERROR",parsed?null:body.slice(0,90).replace(/\s+/g," "));
 }catch(err){console.log("HOME DEPOT",client,"ERROR",String(err).slice(0,150))}
}
