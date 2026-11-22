// Chapter classification is metadata: IDs, mastery, notes and XP stay unchanged.
(function(root){
 'use strict';
 const levels=Object.freeze([
  Object.freeze({id:'sup',name:'Sup',year:'1re année',description:'Construis les bases de ta préparation.'}),
  Object.freeze({id:'spe',name:'Spé',year:'2e année',description:'Approfondis ton programme et prépare les concours.'})
 ]);
 const themes=Object.freeze([
  Object.freeze({id:'mechanics',name:'Mécanique',symbol:'↗',description:'Mouvements, forces et systèmes'}),
  Object.freeze({id:'electromagnetism',name:'Électromagnétisme',symbol:'⚛',description:'Champs électriques et magnétiques'}),
  Object.freeze({id:'thermodynamics',name:'Thermodynamique',symbol:'°',description:'Énergie, chaleur et transformations'}),
  Object.freeze({id:'circuits',name:'Électricité et circuits',symbol:'↯',description:'Circuits et régimes électriques'}),
  Object.freeze({id:'optics',name:'Optique',symbol:'◈',description:'Lumière et systèmes optiques'}),
  Object.freeze({id:'waves',name:'Ondes',symbol:'∿',description:'Oscillations et propagation'}),
  Object.freeze({id:'quantum',name:'Physique quantique',symbol:'ħ',description:'États et phénomènes quantiques'}),
  Object.freeze({id:'power',name:'Conversion de puissance',symbol:'↯',description:'Conversion électrique et électromécanique'}),
  Object.freeze({id:'experimental',name:'Formation expérimentale',symbol:'±',description:'Mesures, incertitudes et travaux pratiques'}),
  Object.freeze({id:'other',name:'Autres chapitres',symbol:'＋',description:'Les autres thèmes de ton programme'})
 ]);
 const isLevel=value=>levels.some(level=>level.id===value);
 const isTheme=value=>themes.some(theme=>theme.id===value);
 function isPhysics(subject){return subject.organizationType==='physics'||/phys/i.test(subject.name||'')}
 function chapterLevel(chapter){return isLevel(chapter.studyLevel)?chapter.studyLevel:'unclassified'}
 function chapterTheme(chapter){return isTheme(chapter.physicsTheme)?chapter.physicsTheme:'unclassified'}
 function chaptersIn(subject,level,theme=null){
  return (subject.chapters||[]).filter(chapter=>chapterLevel(chapter)===level&&(!isPhysics(subject)||!isLevel(level)||theme===null||chapterTheme(chapter)===theme));
 }
 function routeFor(subject,chapter){
  const level=chapterLevel(chapter);
  return {level,theme:isPhysics(subject)&&isLevel(level)?chapterTheme(chapter):null};
 }
 function classify(subject,chapter,values){
  if(!isLevel(values.studyLevel))throw new Error('Choisis Sup ou Spé.');
  if(isPhysics(subject)&&!isTheme(values.physicsTheme))throw new Error('Choisis un grand chapitre de physique.');
  chapter.studyLevel=values.studyLevel;
  if(isPhysics(subject))chapter.physicsTheme=values.physicsTheme;
 }
 const api=Object.freeze({levels,themes,isLevel,isTheme,isPhysics,chapterLevel,chapterTheme,chaptersIn,routeFor,classify});
 root.PrepagoSubjectOrganization=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
