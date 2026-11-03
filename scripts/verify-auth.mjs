// Synthetic accounts in the new Dockside development instance. No email is sent.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import catalog from "../src/data/stations.json" with {type:"json"};

const exec=promisify(execFile),project="qhoubpcpelxruxnbgead",url=`https://${project}.supabase.co`;
const sensitive=[];
async function cli(args){try{return(await exec("npx",["-y","clerk@latest",...args],{maxBuffer:1024*1024})).stdout;}catch(e){let message=e.stderr||"Clerk command failed";for(const value of sensitive)message=message.replaceAll(value,"[redacted]");throw new Error(message);}}
const {stdout}=await exec("npx",["-y","supabase@latest","projects","api-keys",`--remote=${project}`,"--output","json"]);
const keys=JSON.parse(stdout),key=keys.find(k=>k.type==="publishable")?.api_key??keys.find(k=>k.name==="anon")?.api_key;
await mkdir(".local-secrets",{recursive:true,mode:0o700});
let accounts;try{accounts=JSON.parse(await readFile(".local-secrets/qa-users.json","utf8"));}catch{accounts=[];}
for(let i=accounts.length;i<2;i++){
 const label=i===0?"A":"B",password=randomBytes(18).toString("base64url");sensitive.push(password);
 const email=`dockside.qa.${label.toLowerCase()}+clerk_test@example.com`;
 const file=`.local-secrets/qa-create-${label}.json`;
 await writeFile(file,JSON.stringify({email_address:[email],password,first_name:`Dockside QA ${label}`}),{mode:0o600});
 try{await cli(["users","create","--file",file,"--dry-run"]);const user=JSON.parse(await cli(["users","create","--file",file,"--yes","--json"]));accounts.push({label,id:user.id,email,password});await writeFile(".local-secrets/qa-users.json",JSON.stringify(accounts),{mode:0o600});console.log(`Created synthetic QA account ${label} in Dockside.`);}finally{await unlink(file);}
}
const sessions=[];
try{
 const tokens=[];
 for(const account of accounts){
  const body=JSON.stringify({user_id:account.id});
  await cli(["api","/sessions","-X","POST","-d",body,"--dry-run"]);
  const session=JSON.parse(await cli(["api","/sessions","-X","POST","-d",body]));sessions.push(session.id);
  const path=`/sessions/${session.id}/tokens`;
  await cli(["api",path,"-X","POST","-d","{}","--dry-run"]);
  const token=JSON.parse(await cli(["api",path,"-X","POST","-d","{}"]));
  const jwt=token.jwt??token.token;if(!jwt)throw new Error("Session token missing; values omitted.");sensitive.push(jwt);
  const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
  if(claims.sub!==account.id||claims.role!=="authenticated")throw new Error("Clerk token did not contain the expected subject and database role.");
  tokens.push(jwt);
 }
 const [a,b]=tokens.map(jwt=>createClient(url,key,{accessToken:async()=>jwt,auth:{persistSession:false}}));
 const station_id=catalog[0].station_id;
 // Clear only these synthetic users' own previous verification rows.
 for(const client of [a,b]){const result=await client.from("dockside_follows").delete().eq("station_id",station_id);if(result.error)throw new Error(`Clerk/Supabase trust check failed: ${result.error.message}`);}
 const insert=await a.from("dockside_follows").insert({station_id}).select("station_id,user_id").single();
 if(insert.error||insert.data.user_id!==accounts[0].id)throw new Error(`Owner insert failed: ${insert.error?.message??"wrong owner"}`);
 const other=await b.from("dockside_follows").select("station_id");
 if(other.error||other.data.length!==0)throw new Error("User B could read user A's station.");
 const spoof=await b.from("dockside_follows").insert({station_id,user_id:accounts[0].id});
 if(!spoof.error)throw new Error("User B could spoof user A's ownership.");
 await b.from("dockside_follows").delete().eq("station_id",station_id);
 const own=await a.from("dockside_follows").select("station_id");
 if(own.error||own.data.length!==1)throw new Error("User B could delete user A's station.");
 const cleanup=await a.from("dockside_follows").delete().eq("station_id",station_id);if(cleanup.error)throw new Error("Test follow cleanup failed.");
 const proof={verified_at:new Date().toISOString(),authentication:"Two real Clerk-signed session JWTs",checks:["authenticated role claim","owner-only insert and read","cross-user read isolation","spoofed ownership rejected","cross-user delete isolation","test follow removed"]};
 await writeFile("docs/auth-verification.json",JSON.stringify(proof,null,2)+"\n");console.log(JSON.stringify(proof,null,2));
}finally{
 for(const id of sessions){try{const path=`/sessions/${id}/revoke`;await cli(["api",path,"-X","POST","--dry-run"]);await cli(["api",path,"-X","POST"]);}catch{console.log("A synthetic verification session could not be revoked; inspect it with the Clerk CLI.");}}
}
