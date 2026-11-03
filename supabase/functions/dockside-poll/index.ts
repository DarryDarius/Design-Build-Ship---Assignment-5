import { createClient } from "npm:@supabase/supabase-js@2";
import catalog from "../../../src/data/stations.json" with { type: "json" };
import { parseFeed } from "../_shared/normalize.ts";

const base = "https://gbfs.lyft.com/gbfs/2.3/chi/en/";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
async function sameSecret(a: string, b: string) {
  const digest = async (s:string) => new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
  const [x,y]=await Promise.all([digest(a),digest(b)]); let diff=0;
  for(let i=0;i<x.length;i++) diff |= x[i]^y[i];
  return diff===0;
}
Deno.serve(async request => {
  if(request.method!=="POST") return new Response("Method not allowed",{status:405});
  // verify_jwt=false is paired with this mandatory server-secret verification.
  const token=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(!secret || !await sameSecret(token,secret)) return new Response("Unauthorized",{status:401});
  const id=crypto.randomUUID(), started=Date.now(); let httpStatus:number|null=null;
  const begin=await db.rpc("dockside_begin_run",{p_id:id});
  if(begin.error) { console.error(JSON.stringify({run_id:id,result:"failed",error_code:"begin_run_failed"})); return Response.json({error:"begin_run_failed"},{status:500}); }
  if(!begin.data) return Response.json({run_id:id,result:"skipped"});
  try {
    const get=async(file:string)=>{
      const response=await fetch(base+file,{signal:AbortSignal.timeout(12000),headers:{"User-Agent":"Dockside-Assignment5/1.0"}});
      httpStatus=response.status;
      if(!response.ok) throw new Error(`source_http_${response.status}`);
      return response.json();
    };
    const [raw,types]=await Promise.all([get("station_status.json"),get("vehicle_types.json")]);
    const parsed=parseFeed(raw,types,catalog.map(s=>s.station_id));
    const result=await db.rpc("dockside_commit_run",{p_id:id,p_rows:parsed.statuses,p_reports:parsed.stationReports,p_missing:parsed.missingIds,p_source_time:parsed.sourceUpdatedAt,p_duration:Date.now()-started,p_http_status:httpStatus});
    if(result.error) throw new Error(result.error.message.includes("source_time_regressed")?"source_time_regressed":"commit_run_failed");
    const log={run_id:id,result:"success",read_count:parsed.statuses.length,changed_count:result.data,missing_count:parsed.missingIds.length,source_updated_at:parsed.sourceUpdatedAt,duration_ms:Date.now()-started};
    console.log(JSON.stringify(log)); return Response.json(log);
  } catch(error) {
    const raw=error instanceof Error?error.message:"unknown_error";
    const code=/^[a-z_]+(?:\d+)?$/.test(raw)?raw:error instanceof DOMException?"source_timeout":"invalid_source_response";
    const failed=await db.rpc("dockside_fail_run",{p_id:id,p_error:code,p_duration:Date.now()-started,p_http_status:httpStatus});
    console.error(JSON.stringify({run_id:id,result:"failed",error_code:code,log_saved:!failed.error,duration_ms:Date.now()-started}));
    return Response.json({run_id:id,result:"failed",error_code:code},{status:502});
  }
});
