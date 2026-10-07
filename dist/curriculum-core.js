// Pure account programme preparation. A track change retains the previous workspace.
(function(root){
 'use strict';
 const tracks=Object.freeze([
  Object.freeze({id:'MP',label:'MPSI / MP',sup:'MPSI',spe:'MP'}),
  Object.freeze({id:'PSI',label:'PCSI / PSI',sup:'PCSI',spe:'PSI'}),
  Object.freeze({id:'TSI',label:'TSI · Sup et Spé',sup:'TSI',spe:'TSI'}),
  Object.freeze({id:'ECS',label:'ECS · Sup et Spé',sup:'ECS',spe:'ECS'}),
  Object.freeze({id:'ECT',label:'ECT · Sup et Spé',sup:'ECT',spe:'ECT'})
 ]);
 function normalizeTrack(value){
  const code=String(value||'').toUpperCase().replace(/\s|\*/g,'');
  return ({MPSI:'MP',MP:'MP','MPSI/MP':'MP','MP/MPSI':'MP',PCSI:'PSI',PSI:'PSI','PCSI/PSI':'PSI','PSI/PCSI':'PSI',TSI:'TSI',ECS:'ECS',ECT:'ECT'})[code]||null;
 }
 function normalizeName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
 const aliases={
  math:['Mathématiques','Maths','Math'],physics:['Physique'],chemistry:['Chimie'],engineering:['Sciences industrielles','Sciences industrielles pour l’ingénieur','Sciences de l’ingénieur','SII','SI'],
  'electrical-engineering':['Génie électrique'],'mechanical-engineering':['Génie mécanique'],computing:['Informatique'],arabic:['Arabe','Culture arabe et traduction'],
  french:['Français','Français et culture générale','Français-philosophie'],english:['Anglais'],geopolitics:['Histoire, géographie et géopolitique','HGG','Géopolitique'],
  'economics-law':['Économie et droit','Économie-droit'],management:['Management et gestion','Sciences de management et gestion'],tipe:['TIPE']
 };
 function chapterFromTemplate(template){
  return {id:'c-curr-'+template.key,curriculumId:template.key,name:template.name,studyLevel:template.studyLevel,
   ...(template.physicsTheme?{physicsTheme:template.physicsTheme}:{}),syllabusUrl:template.syllabusUrl,
   ...(template.programmePage?{programmePage:template.programmePage}:{}),...(template.contentKind?{contentKind:template.contentKind}:{}),
   done:false,steps:{course:false,summary:false,easy:false,advanced:false}};
 }
 function prepare(input,selectedTrack,catalogue,{fresh=false}={}){
  const state=structuredClone(input),track=normalizeTrack(selectedTrack),programme=track&&catalogue?.tracks?.[track];
  if(!programme)return {state,changed:false,track:null};
  const before=JSON.stringify(state);
  state.curriculum||={activeTrack:null,revision:0,archives:{},dismissedSubjects:[],dismissedChapters:[]};
  const curriculum=state.curriculum;
  curriculum.archives||={};curriculum.dismissedSubjects||=[];curriculum.dismissedChapters||=[];
  if(curriculum.activeTrack&&curriculum.activeTrack!==track){
   curriculum.archives[curriculum.activeTrack]={subjects:state.subjects||[],dismissedSubjects:curriculum.dismissedSubjects,dismissedChapters:curriculum.dismissedChapters};
   const previous=curriculum.archives[track];
   state.subjects=previous?.subjects||[];
   curriculum.dismissedSubjects=previous?.dismissedSubjects||[];curriculum.dismissedChapters=previous?.dismissedChapters||[];
   delete curriculum.archives[track];
  }else if(!curriculum.activeTrack&&fresh){state.subjects=[]}
  state.subjects||=[];
  for(const specification of programme.subjects){
   if(curriculum.dismissedSubjects.includes(specification.key))continue;
   const names=(aliases[specification.key]||[specification.name]).map(normalizeName);
   let subject=state.subjects.find(item=>item.curriculumKey===specification.key)||state.subjects.find(item=>!item.curriculumKey&&names.includes(normalizeName(item.name)));
   if(!subject){subject={id:'s-curr-'+track.toLowerCase()+'-'+specification.key,name:specification.name,symbol:specification.symbol,color:specification.color,chapters:[]};state.subjects.push(subject)}
   subject.curriculumKey=specification.key;subject.organizationType=specification.organizationType;subject.chapters||=[];
   for(const template of specification.chapters){
    if(curriculum.dismissedChapters.includes(template.key)||subject.chapters.some(chapter=>chapter.curriculumId===template.key))continue;
    const previous=subject.chapters.find(chapter=>!chapter.curriculumId&&chapter.studyLevel===template.studyLevel&&normalizeName(chapter.name)===normalizeName(template.name));
    if(previous){
     previous.curriculumId=template.key;previous.syllabusUrl=template.syllabusUrl;
     if(template.programmePage)previous.programmePage=template.programmePage;
     if(template.physicsTheme&&!previous.physicsTheme)previous.physicsTheme=template.physicsTheme;
     if(template.contentKind)previous.contentKind=template.contentKind;
    }else subject.chapters.push(chapterFromTemplate(template));
   }
  }
  curriculum.activeTrack=track;curriculum.revision=catalogue.revision;
  return {state,changed:JSON.stringify(state)!==before,track};
 }
 function dismissChapter(state,chapter){
  if(chapter.curriculumId&&state.curriculum&&!state.curriculum.dismissedChapters.includes(chapter.curriculumId))state.curriculum.dismissedChapters.push(chapter.curriculumId);
 }
 function dismissSubject(state,subject){
  if(subject?.curriculumKey&&state.curriculum&&!state.curriculum.dismissedSubjects.includes(subject.curriculumKey))state.curriculum.dismissedSubjects.push(subject.curriculumKey);
 }
 const api=Object.freeze({tracks,normalizeTrack,prepare,dismissChapter,dismissSubject});
 root.PrepagoCurriculum=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
