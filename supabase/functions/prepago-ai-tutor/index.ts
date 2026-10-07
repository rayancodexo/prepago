import {createHandler} from './core.mjs';
import catalogue from './curriculum.json' with {type:'json'};

const env = Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY','PREPAGO_AI_MODEL','PREPAGO_AI_LIVE'].map(key=>[key,Deno.env.get(key) || '']));

async function checkedJson(url:string,headers:Record<string,string>,body?:unknown) {
  const response=await fetch(url,{method:body === undefined ? 'GET' : 'POST',headers,
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error('service_unavailable');
  return response.json();
}
const userHeaders=(authorization:string)=>({apikey:env.SUPABASE_ANON_KEY,Authorization:authorization,'Content-Type':'application/json'});
const serverHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
const rpc=(name:string,headers:Record<string,string>,body:unknown)=>checkedJson(env.SUPABASE_URL+'/rest/v1/rpc/'+name,headers,body);

Deno.serve(createHandler({env,catalogue,
  getUser:(authorization:string)=>checkedJson(env.SUPABASE_URL+'/auth/v1/user',userHeaders(authorization)),
  status:(authorization:string)=>rpc('ai_tutor_status',userHeaders(authorization),{}),
  reserve:(userId:string,requestId:string)=>rpc('reserve_ai_request',serverHeaders,{target_user:userId,request_id:requestId}),
  finish:(requestId:string,state:string,input:number,output:number)=>rpc('finish_ai_request',serverHeaders,
    {request_id:requestId,new_state:state,used_input:input,used_output:output}),
  fetchProvider:(body:unknown)=>checkedJson('https://api.openai.com/v1/responses',
    {Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body)
}));
