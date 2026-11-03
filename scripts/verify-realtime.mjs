import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const exec=promisify(execFile),project="qhoubpcpelxruxnbgead",url=`https://${project}.supabase.co`;
const {stdout}=await exec("npx",["-y","supabase@latest","projects","api-keys",`--remote=${project}`,"--output","json"]);
const keys=JSON.parse(stdout),key=keys.find(k=>k.type==="publishable")?.api_key??keys.find(k=>k.name==="anon")?.api_key;
if(!key)throw new Error("Public database configuration missing.");
const client=createClient(url,key,{auth:{persistSession:false}});
const initial=await client.rpc("dockside_snapshot");if(initial.error)throw new Error(initial.error.message);
if(initial.data.stations.length!==40||initial.data.statuses.length!==40)throw new Error("Expected 40 initialized stations.");
let resolveEvent,rejectEvent;const event=new Promise((resolve,reject)=>{resolveEvent=resolve;rejectEvent=reject;});
const timer=setTimeout(()=>rejectEvent(new Error("No Realtime heartbeat within 15 seconds.")),15000);
let subscribed;
const ready=new Promise((resolve,reject)=>{subscribed={resolve,reject};});
const channel=client.channel("dockside-verification")
 .on("postgres_changes",{event:"*",schema:"public",table:"dockside_source_health",filter:"source=eq.divvy"},payload=>resolveEvent({event:payload.eventType,version:payload.new.version,changed_count:payload.new.changed_count,source_updated_at:payload.new.source_updated_at}))
 .subscribe(status=>{if(status==="SUBSCRIBED")subscribed.resolve();else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){subscribed.reject(new Error(status));rejectEvent(new Error(status));}});
try {
 await ready;
 const token=(await readFile(".local-secrets/worker-token","utf8")).trim();
 const response=await fetch(`${url}/functions/v1/dockside-poll`,{method:"POST",headers:{"x-dockside-token":token},body:"{}",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Worker returned ${response.status}`);
 const payload=await event;
 const proof={verified_at:new Date().toISOString(),snapshot_stations:40,snapshot_statuses:40,transport:"Supabase Postgres Changes",received:payload};
 await writeFile("docs/realtime-verification.json",JSON.stringify(proof,null,2)+"\n");
 console.log(JSON.stringify(proof,null,2));
} finally {clearTimeout(timer);await client.removeChannel(channel);}
