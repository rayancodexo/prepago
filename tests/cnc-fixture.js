// Development-only UI fixture: fake catalogue/storage; no real Supabase calls.
(() => {
 // The supervised preview is HTTP; production runs HTTPS with native randomUUID.
 if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
 const id=crypto.randomUUID();
 const exams=[{id,filiere:'PSI',subject:'Mathématiques I',year:2025,subject_path:`${id}/${crypto.randomUUID()}.pdf`,correction_path:`${id}/${crypto.randomUUID()}.pdf`,published:false,archived:false,updated_at:crypto.randomUUID()}];
 const result=data=>Promise.resolve({data,error:null});
 const client={rpc:()=>result(true),storage:{from:()=>({upload:()=>result({}),createSignedUrl:()=>result({signedUrl:'about:blank'})})},from:()=>({
  select:()=>({order:()=>({limit:()=>result(structuredClone(exams))})}),
  insert:row=>{exams.push({...row,archived:false,updated_at:crypto.randomUUID()});return result(null)},
  update:values=>{const filters={};const chain={eq:(key,value)=>{filters[key]=value;return chain},select:()=>{const row=exams.find(r=>r.id===filters.id&&r.updated_at===filters.updated_at);if(row)Object.assign(row,values,{updated_at:crypto.randomUUID()});return result(row?[{id:row.id}]:[])}};return chain}
 })};
 window.PrepagoCncLibrary.connect(client,'qa-admin');navigate('cnc');
})();
