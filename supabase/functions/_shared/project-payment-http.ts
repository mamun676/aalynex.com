import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
export function env(name: string): string {const value=Deno.env.get(name); if(!value) throw new Error('Missing server configuration'); return value;}
export function cors(req: Request): Headers {
 const origin=req.headers.get('Origin');
 const allow=env('PROJECT_PAYMENT_ALLOWED_ORIGINS').split(',').map(s=>s.trim()).filter(Boolean);
 if (origin && !allow.includes(origin)) throw new Error('Origin denied');
 const h=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'});
 if(origin) h.set('Access-Control-Allow-Origin',origin);
 return h;
}
export const reply=(h:Headers,body:unknown,status=200)=>new Response(JSON.stringify(body),{headers:h,status});
export async function context(req: Request) {
 const auth=req.headers.get('Authorization') || '';
 if(!/^Bearer\s+\S+$/i.test(auth)) throw new Error('Unauthorized');
 const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await userClient.auth.getUser();
 if(error||!data.user) throw new Error('Unauthorized');
 const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 return {user:data.user,admin};
}
export function providerKeys() {
 const id=env('PROJECT_RAZORPAY_KEY_ID'), secret=env('PROJECT_RAZORPAY_KEY_SECRET');
 const mode=Deno.env.get('PROJECT_PAYMENT_MODE') || 'test';
 if(!['test','live'].includes(mode) || !id.startsWith(`rzp_${mode}_`)) throw new Error('Provider mode mismatch');
 return {id,secret};
}
export async function razorpay(path:string, method='GET', body?:unknown) {
 const {id,secret}=providerKeys();
 const res=await fetch('https://api.razorpay.com/v1/'+path,{method,headers:{Authorization:'Basic '+btoa(id+':'+secret),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!res.ok) throw new Error('Provider request failed');
 return await res.json();
}
export function failure(h:Headers|undefined,e:unknown) {
 const unauthorized=e instanceof Error && e.message==='Unauthorized';
 // Never return DB errors, provider payloads or credentials to the browser.
 return reply(h || new Headers({'Content-Type':'application/json','Cache-Control':'no-store'}),{error:unauthorized?'Sign in required':'Payment could not be processed. Do not pay again; contact support if charged.'},unauthorized?401:409);
}

export async function requestJson(req:Request) {
 const reader=req.body?.getReader();let size=0;const parts:Uint8Array[]=[];
 if(reader) for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('Request too large');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)||'{}');
 if(!body||Array.isArray(body)||typeof body!=='object')throw new Error('Invalid request');return body;
}
