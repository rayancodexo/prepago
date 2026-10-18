// Subject -> school year -> physics theme -> chapter workspace.
function resetLearningSelection(subjectId=null){
 learningSubjectId=subjectId;learningSubjectLevel=null;learningPhysicsTheme=null;
}
function openLearningChapter(subjectId,chapterId){
 resetLearningSelection(subjectId);
 const subject=state.subjects.find(item=>item.id===subjectId),chapter=subject?.chapters.find(item=>item.id===chapterId);
 if(chapter){const route=subjectOrganization.routeFor(subject,chapter);learningSubjectLevel=route.level;learningPhysicsTheme=route.theme}
}
function learningBreadcrumb(subject){
 const level=subjectOrganization.levels.find(item=>item.id===learningSubjectLevel);
 const theme=subjectOrganization.themes.find(item=>item.id===learningPhysicsTheme);
 const items=[`<button type="button" data-back-to-subjects>Matières</button>`,`<button type="button" data-back-learning-levels>${esc(subject.name)}</button>`];
 if(learningSubjectLevel)items.push(`<button type="button" data-learning-level="${esc(learningSubjectLevel)}">${level?.name||'À classer'}</button>`);
 if(learningPhysicsTheme)items.push(`<span aria-current="page">${esc(theme?.name||'À classer')}</span>`);
 else items[items.length-1]=items[items.length-1].replace('<button ','<button aria-current="page" ');
 return `<nav class="learning-breadcrumb" aria-label="Navigation dans la matière">${items.join('<span class="breadcrumb-divider" aria-hidden="true">/</span>')}</nav>`;
}
function learningSummary(subject,chapters,label){
 const mastery=subjectMastery({chapters}),xp=chapters.reduce((sum,chapter)=>sum+chapterEarnedXp(chapter),0);
 return `<section class="card subject-detail-summary"><span class="subject-symbol" style="background:${esc(subject.color)}18;color:${esc(subject.color)}">${esc(subject.symbol)}</span><div><h2>${esc(label)}</h2><p>${chapters.filter(chapter=>chapter.done).length}/${chapters.length} chapitres maîtrisés · ${xp} XP gagnés</p><div class="progress-bar"><div class="progress-fill" style="width:${mastery}%"></div></div></div><div class="detail-percent"><strong>${mastery}%</strong><small>maîtrisé</small></div></section>`;
}
function learningChoiceStats(chapters){
 return `<div class="learning-choice-stats"><span><strong>${chapters.length}</strong> chapitre${chapters.length!==1?'s':''}</span><span>${chapters.filter(chapter=>chapter.done).length} maîtrisés</span></div><div class="learning-choice-progress"><div class="progress-bar"><div class="progress-fill" style="width:${subjectMastery({chapters})}%"></div></div><strong>${subjectMastery({chapters})}%</strong></div>`;
}
function unclassifiedLearningNotice(count,action,description){
 if(!count)return '';
 return `<aside class="learning-classify-notice"><span class="learning-notice-icon" aria-hidden="true">${uiIcon('note')}</span><div><strong>${count} chapitre${count!==1?'s':''} à classer</strong><p>${description}</p></div><button type="button" class="secondary-btn" ${action}>Classer mes chapitres ${uiIcon('right')}</button></aside>`;
}
function renderLearningChapter(subject,chapter){
 const level=subjectOrganization.levels.find(item=>item.id===chapter.studyLevel),theme=subjectOrganization.themes.find(item=>item.id===chapter.physicsTheme);
 const needsClassification=!level||(subjectOrganization.isPhysics(subject)&&!theme);
 const badges=level?`<span>${level.name}</span>${subjectOrganization.isPhysics(subject)&&theme?`<span>${esc(theme.name)}</span>`:''}`:'';
 return `<article class="card chapter-mastery-card" data-chapter-card="${esc(chapter.id)}"><div class="chapter-card-head"><div><h3>${esc(chapter.name)}</h3><p>${chapterUnits(chapter)}/5 étapes · ${chapterEarnedXp(chapter)} XP gagnés</p></div><button class="icon-btn chapter-delete" data-remove-learning-chapter="${esc(chapter.id)}" data-subject-id="${esc(subject.id)}" aria-label="Supprimer ${esc(chapter.name)}" title="Supprimer le chapitre">${uiIcon('close')}</button></div><div class="chapter-classification">${badges}${programmeChapterReference(chapter)}${needsClassification?`<button type="button" class="link-btn" data-organize-chapter="${esc(chapter.id)}" data-subject-id="${esc(subject.id)}">${level?'Choisir un grand chapitre':'Choisir Sup ou Spé'} ${uiIcon('right')}</button>`:''}</div>${window.PrepagoLearningContent?.markup(subject,chapter)||''}<div class="chapter-steps">${chapterStepButtons(subject,chapter)}</div></article>`;
}
function renderSubjectOrganization(subject){
 const physics=subjectOrganization.isPhysics(subject),level=subjectOrganization.levels.find(item=>item.id===learningSubjectLevel),theme=subjectOrganization.themes.find(item=>item.id===learningPhysicsTheme);
 const addButton=`<button class="primary-btn" data-add-chapter="${esc(subject.id)}">+ Ajouter un chapitre</button>`;
 let content='';
 if(!learningSubjectLevel){
  const unclassified=subjectOrganization.chaptersIn(subject,'unclassified');
  content=header(esc(subject.name),'Choisis ton année pour retrouver tes cours et tes exercices.',addButton)+`<div class="learning-section-label"><h2>Choisis Sup ou Spé</h2><p>Un programme et une progression pour chaque année.</p></div><div class="subject-level-grid">${subjectOrganization.levels.map((item,index)=>{const chapters=subjectOrganization.chaptersIn(subject,item.id);return `<button type="button" class="learning-choice-card subject-level-card" data-learning-level="${item.id}"><span class="learning-choice-top"><span class="learning-year-badge">${item.year}${programmeYearName(item.id)?' · '+esc(programmeYearName(item.id)):''}</span><span class="learning-choice-number" aria-hidden="true">0${index+1}</span></span><h2>${item.name}</h2><p>${item.description}</p>${learningChoiceStats(chapters)}<span class="learning-choice-footer">${physics?'Voir les grands chapitres':'Voir les chapitres'} ${uiIcon('right')}</span></button>`}).join('')}</div>${unclassifiedLearningNotice(unclassified.length,'data-learning-level="unclassified"','Choisis une année pour tes chapitres existants. Tes notes et ta progression sont conservées.')}<div class="learning-total"><span>Ensemble de la matière</span><strong>${subject.chapters.length} chapitres · ${subjectMastery(subject)}% de maîtrise</strong></div>`;
 }else if(physics&&level&&!learningPhysicsTheme){
  const chapters=subjectOrganization.chaptersIn(subject,level.id),unclassified=subjectOrganization.chaptersIn(subject,level.id,'unclassified');
  content=header(`${esc(subject.name)} · ${level.name}`,'Choisis un grand chapitre pour retrouver ses leçons.',addButton)+learningSummary(subject,chapters,`Progression en ${level.name}`)+`<div class="learning-section-label"><h2>Les grands chapitres</h2><p>Tes leçons de ${level.name}, regroupées par thème.</p></div><div class="physics-theme-grid">${subjectOrganization.themes.filter(item=>!subject.curriculumKey||subjectOrganization.chaptersIn(subject,level.id,item.id).length>0).map(item=>{const items=subjectOrganization.chaptersIn(subject,level.id,item.id);return `<button type="button" class="learning-choice-card physics-theme-card" data-learning-theme="${item.id}"><span class="physics-theme-symbol" aria-hidden="true">${item.symbol}</span><h2>${item.name}</h2><p>${item.description}</p>${learningChoiceStats(items)}<span class="learning-choice-footer">Voir les leçons ${uiIcon('right')}</span></button>`}).join('')}</div>${unclassifiedLearningNotice(unclassified.length,'data-learning-theme="unclassified"','Attribue un thème à ces chapitres de '+level.name+'.')}`;
 }else{
  const chapters=subjectOrganization.chaptersIn(subject,learningSubjectLevel,learningPhysicsTheme);
  const unclassified=learningSubjectLevel==='unclassified'||learningPhysicsTheme==='unclassified';
  const title=unclassified?'Chapitres à classer':theme?theme.name:`${subject.name} · ${level.name}`;
  const description=unclassified?'Classe tes chapitres pour les retrouver dans la bonne année et le bon thème.':`${subject.name} · ${level.name}${theme?' · '+theme.name:''} — cours, exercices et maîtrise.`;
  content=header(esc(title),esc(description),addButton)+learningSummary(subject,chapters,unclassified?'Progression des chapitres à classer':`Progression ${theme?'en '+theme.name:'en '+level.name}`)+`<div class="chapter-stack">${chapters.map(chapter=>renderLearningChapter(subject,chapter)).join('')||emptyState('subjects','Aucun chapitre pour le moment',`Ajoute ton premier chapitre${theme?' en '+esc(theme.name):' de '+level.name} pour commencer.`,addButton)}</div>`;
 }
 return `<div class="subject-learning-workspace">${learningBreadcrumb(subject)}${programmeBanner()}${programmeSubjectNote(subject)}${content}</div>`;
}
function learningClassificationFields(subject,level,theme){
 const select=(label,name,placeholder,items,value)=>`<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}" required><option value="" disabled ${!items.some(item=>item.id===value)?'selected':''}>${placeholder}</option>${items.map(item=>`<option value="${item.id}" ${item.id===value?'selected':''}>${item.name}${name==='studyLevel'&&programmeYearName(item.id)?' · '+esc(programmeYearName(item.id)):''}${item.year?' · '+item.year:''}</option>`).join('')}</select></div>`;
 return select('Année','studyLevel','Choisir Sup ou Spé',subjectOrganization.levels,level)+(subjectOrganization.isPhysics(subject)?select('Grand chapitre de physique','physicsTheme','Choisir un thème',subjectOrganization.themes,theme):'');
}
function editLearningChapter(subjectId,chapterId=null){
 const subject=state.subjects.find(item=>item.id===subjectId),chapter=subject?.chapters.find(item=>item.id===chapterId);
 if(!subject||(chapterId&&!chapter))return;
 const level=chapter?chapter.studyLevel:learningSubjectId===subjectId?learningSubjectLevel:null;
 const theme=chapter?chapter.physicsTheme:learningSubjectId===subjectId?learningPhysicsTheme:null;
 const fields=(chapter?`<p class="helper">${esc(chapter.name)} · tes notes, tes étapes et ton XP sont conservés.</p>`:field('Nom du chapitre','name','text','maxlength="150"'))+learningClassificationFields(subject,level,theme);
 openModal(chapter?'Classer le chapitre':'Ajouter un chapitre',fields,values=>{
  const item=chapter||{id:uid('c'),name:values.name.trim(),done:false};
  subjectOrganization.classify(subject,item,values);
  if(!chapter)subject.chapters.push(item);
  openLearningChapter(subjectId,item.id);
 });
}
document.addEventListener('click',event=>{
 const back=event.target.closest('[data-back-learning-levels]');if(back){resetLearningSelection(learningSubjectId);render();return}
 const level=event.target.closest('[data-learning-level]');
 if(level&&(subjectOrganization.isLevel(level.dataset.learningLevel)||level.dataset.learningLevel==='unclassified')){learningSubjectLevel=level.dataset.learningLevel;learningPhysicsTheme=null;render();return}
 const theme=event.target.closest('[data-learning-theme]');
 if(theme&&subjectOrganization.isLevel(learningSubjectLevel)&&(subjectOrganization.isTheme(theme.dataset.learningTheme)||theme.dataset.learningTheme==='unclassified')){learningPhysicsTheme=theme.dataset.learningTheme;render();return}
 const organize=event.target.closest('[data-organize-chapter]');if(organize)editLearningChapter(organize.dataset.subjectId,organize.dataset.organizeChapter);
});
