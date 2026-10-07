function activeCurriculum(){
 const id=state.curriculum?.activeTrack;
 return id&&window.PrepagoCurriculumCatalog?.tracks[id]||null;
}
function programmeYearName(level){
 const programme=activeCurriculum();
 return programme?(level==='sup'?programme.supName:programme.speName):'';
}
function programmeBanner(){
 const programme=activeCurriculum();
 if(!programme)return window.PrepagoAccount?`<aside class="programme-banner"><div><strong>Choisis ta filière</strong><p>Retrouve les matières et les chapitres de tes deux années de prépa.</p></div><button class="secondary-btn" data-go="account">Mon compte</button></aside>`:'';
 const track=window.PrepagoCurriculum.tracks.find(item=>item.id===programme.id);
 return `<aside class="programme-banner"><span class="programme-icon" aria-hidden="true">${uiIcon('subjects')}</span><div class="programme-banner-copy"><strong>Parcours ${esc(track.label)}</strong><p>Sup · ${esc(programme.supName)} <span aria-hidden="true">/</span> Spé · ${esc(programme.speName)}</p></div><div class="programme-source-links"><a href="${esc(programme.sources.sup.url)}" target="_blank" rel="noopener">Programme Sup</a><a href="${esc(programme.sources.spe.url)}" target="_blank" rel="noopener">Programme Spé</a><button type="button" class="link-btn" data-go="account">Changer de filière</button></div></aside>`;
}
function programmeChapterReference(chapter){
 if(!/^https:\/\/www\.cpge\.ac\.ma\//.test(chapter.syllabusUrl||''))return '';
 const label=chapter.contentKind==='project'?'Repères TIPE':chapter.contentKind==='skill'?'Référence de compétence':'Référence du programme';
 return `<a class="chapter-programme-reference" href="${esc(chapter.syllabusUrl)}" target="_blank" rel="noopener">${uiIcon('link')} ${label}</a>`;
}
function programmeSubjectNote(subject){
 if(['french','english','arabic'].includes(subject.curriculumKey))return '<p class="programme-subject-note">Les langues sont organisées par compétences et méthodes. Précise les œuvres et thèmes annuels avec ton professeur.</p>';
 if(subject.curriculumKey==='tipe')return '<p class="programme-subject-note">Une trame pour préparer ton TIPE. Adapte les étapes à ton sujet et au thème annuel.</p>';
 return '';
}
