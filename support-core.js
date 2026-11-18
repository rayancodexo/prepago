// Validation shared by the student form and its regression checks.
(function(root){
  'use strict';
  const pages=['overview','dashboard','subjects','cnc','tasks','projects','calendar','focus','progress','ai','account','access','connexion'];
  function page(value){return pages.includes(value)?value:'overview';}
  function report(values){
    const kind=['problem','content','idea','privacy'].includes(values.kind)?values.kind:'problem';
    const title=String(values.title||'').trim(),details=String(values.details||'').trim();
    if(title.length<3||title.length>100||details.length<10||details.length>2000)throw Error('invalid_report');
    return {input_kind:kind,input_page:page(values.page),input_title:title,input_details:details,input_context:context(values.context)};
  }
  function context(value={}){
    const out={};
    if(['MP','PSI','TSI','ECS','ECT'].includes(value.filiere))out.filiere=value.filiere;
    if(Number.isInteger(Number(value.year))&&Number(value.year)>=1990&&Number(value.year)<=2100)out.year=Number(value.year);
    if(typeof value.subject==='string')out.subject=value.subject.slice(0,100);
    return out;
  }
  function parse(value){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}}
  function validWorkspace(data){
    const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
    const named=value=>record(value)&&typeof value.id==='string'&&typeof value.name==='string';
    return record(data)&&['subjects','tasks','events','focusSessions'].every(key=>Array.isArray(data[key]))
      &&data.subjects.every(subject=>named(subject)&&Array.isArray(subject.chapters)&&subject.chapters.every(named))
      &&data.tasks.every(task=>record(task)&&typeof task.id==='string'&&typeof task.title==='string')
      &&data.events.every(event=>record(event)&&typeof event.id==='string'&&typeof event.title==='string')
      &&data.focusSessions.every(record);
  }
  function draft(value){const parsed=parse(value);return validWorkspace(parsed)?parsed:null;}
  function backup(userId,data){if(!userId||!validWorkspace(data))throw Error('invalid_backup');return {format:'prepago-workspace',version:1,exported_at:new Date().toISOString(),account_id:userId,workspace:data};}
  function restore(value,userId){const parsed=parse(value);if(parsed?.format!=='prepago-workspace'||parsed.version!==1||parsed.account_id!==userId||!validWorkspace(parsed.workspace))throw Error('invalid_backup');return parsed.workspace;}
  const api={page,report,context,draft,backup,restore};root.PrepagoSupportCore=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
