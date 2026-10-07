import type { Env } from "./types";
type Options={bookId?:string;force?:boolean;limit?:number};
type Row={bookId:string;variationId:string;desiredStock:number};
const MAX=100;
function clean(value:unknown){return String(value||"Square inventory sync failed").replace(/[\r\n\t]+/g," ").slice(0,400)}
export async function syncSquareInventory(env:Env,options:Options={}){
 const token=String(env.SQUARE_ACCESS_TOKEN||"").trim(), location=String(env.SQUARE_LOCATION_ID||"").trim();
 if(!token||token.startsWith("replace-")||!location||location.startsWith("replace-"))return{configured:false,requested:0,synced:0,failed:0,unlinked:0,message:"Square inventory sync needs SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID."};
 const force=Boolean(options.force),limit=Math.max(1,Math.min(MAX,Math.floor(options.limit||MAX)));
 const stmt=options.bookId?env.DB.prepare("SELECT book_id AS bookId,variation_id AS variationId,desired_stock AS desiredStock FROM square_inventory_sync WHERE book_id=?1 AND (?2=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))))").bind(options.bookId,force?1:0):env.DB.prepare("SELECT book_id AS bookId,variation_id AS variationId,desired_stock AS desiredStock FROM square_inventory_sync WHERE (?1=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))) OR (sync_status='syncing' AND datetime(last_attempt_at)<=datetime('now','-2 minutes'))) ORDER BY updated_at LIMIT ?2").bind(force?1:0,limit);
 const result=await stmt.all<Row>(), rows=result.results||[];let synced=0,failed=0,unlinked=0;const batchRows:Row[]=[];
 for(const row of rows){
  if(!row.variationId){await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='unlinked',last_error='Add the Square Catalog Variation ID to this book.',updated_at=datetime('now') WHERE book_id=?1").bind(row.bookId).run();unlinked++;continue}
  const claimed=await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='syncing',last_attempt_at=datetime('now'),updated_at=datetime('now') WHERE book_id=?1 AND (?2=1 OR (sync_status='pending' OR (sync_status='error' AND datetime(last_attempt_at)<=datetime('now','-5 minutes'))) OR (sync_status='syncing' AND datetime(updated_at)<=datetime('now','-2 minutes'))) RETURNING book_id").bind(row.bookId,force?1:0).first();
  if(claimed)batchRows.push(row)
 }
 for(let offset=0;offset<batchRows.length;offset+=MAX){
  const batch=batchRows.slice(offset,offset+MAX);
  try{
   const host=env.SQUARE_ENVIRONMENT==="production"?"https://connect.squareup.com":"https://connect.squareupsandbox.com";
   const response=await fetch(host+"/v2/inventory/changes/batch-create",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","Square-Version":env.SQUARE_API_VERSION||"2024-10-17"},body:JSON.stringify({idempotency_key:crypto.randomUUID(),changes:batch.map(row=>({type:"PHYSICAL_COUNT",physical_count:{catalog_object_id:row.variationId,location_id:location,quantity:String(Math.max(0,Math.floor(row.desiredStock))),state:"IN_STOCK",occurred_at:new Date().toISOString()}}))}),signal:AbortSignal.timeout(12000)});
   const payload=await response.json().catch(()=>({})) as {errors?:Array<{detail?:string;code?:string}>};
   if(!response.ok||payload.errors?.length)throw new Error(clean(payload.errors?.map(e=>e.detail||e.code).join("; ")||"Square returned HTTP "+response.status));
   for(const row of batch){const saved=await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='synced',synced_stock=?2,last_synced_at=datetime('now'),last_error='',updated_at=datetime('now') WHERE book_id=?1 AND sync_status='syncing' AND desired_stock=?2 AND variation_id=?3").bind(row.bookId,row.desiredStock,row.variationId).run();if(Number(saved.meta?.changes||0)===1)synced++}
  }catch(error){failed+=batch.length;for(const row of batch)await env.DB.prepare("UPDATE square_inventory_sync SET sync_status='error',last_error=?2,updated_at=datetime('now') WHERE book_id=?1 AND sync_status='syncing' AND desired_stock=?3 AND variation_id=?4").bind(row.bookId,clean(error instanceof Error?error.message:error),row.desiredStock,row.variationId).run()}
 }
 return{configured:true,requested:rows.length,synced,failed,unlinked,message:failed?"Some Square inventory counts need retry.":unlinked?"Link unlinked books to Square catalog variations.":"Square inventory counts match the bookstore."}
}
