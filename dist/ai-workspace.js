/* Exercise workspace: local document preview and an explicitly labelled discovery lesson.
 * Provider integration belongs on the server; this file contains no API credentials.
 */
(function () {
  'use strict';

  const core = window.PrepagoAICore;
  const renderPlanner = renderAI;
  let generation = 0;
  let workspace = initialState();

  function canUseWorkspace() {
    return core.hasWorkspaceAccess(window.PrepagoAccount);
  }

  function initialState() {
    return {
      view: 'start', stage: 'demo', mode: 'hint', step: 0,
      file: null, fileKind: null, objectUrl: null, zoom: 100,
      pane: 'document', draft: '', messages: [], notice: '', loading: false,
      context: {subjectId: '', chapterId: '', level: 'spe'},
      // Start screen (design A): a chat-first page. Questions are text, sent only on submit.
      thread: [], ask: '', askMode: 'hint', asking: false, askNotice: ''
    };
  }

  const CONSENT_KEY = 'prepago.ai.consent.v1';
  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'yes'; } catch { return false; }
  }
  function saveConsent() {
    try { localStorage.setItem(CONSENT_KEY, 'yes'); } catch { /* Asked again next time. */ }
  }

  // Only subjects and chapters that map to the official programme can be sent to the tutor.
  function liveSubjects() {
    return (state.subjects || []).filter(subject => subject.curriculumKey && subject.chapters.some(chapter => chapter.curriculumId));
  }
  function liveChapters() {
    const subject = liveSubjects().find(item => item.id === workspace.context.subjectId);
    return (subject?.chapters || []).filter(chapter => chapter.curriculumId && chapter.studyLevel === workspace.context.level);
  }

  const SUGGESTIONS = {
    photo: null,
    chapter: {mode: 'explanation', text: 'Résume-moi les méthodes à connaître sur ce chapitre, avec un exemple court pour chacune.'},
    redaction: {mode: 'correction', text: 'Voici ma rédaction. Dis-moi ce qui me ferait perdre des points au concours :\n\n'},
    cours: {mode: 'explanation', text: 'Pose-moi 3 questions de cours sur ce chapitre, comme en colle, une à la fois.'}
  };

  function startMessage(message) {
    if (message.role === 'me') return `<div class="ai-chat-me"><p>${esc(message.text)}</p></div>`;
    if (message.role === 'error') return `<div class="ai-chat-error" role="alert">${esc(message.text)}</div>`;
    return `<article class="ai-chat-ai"><span class="ai-kicker">PREPAGO AI</span><div class="ai-chat-text">${esc(message.text)}</div>
      ${message.incomplete ? '<p class="ai-chat-meta">La réponse a atteint sa limite de longueur.</p>' : ''}
      ${message.reference ? `<p class="ai-chat-meta">Programme associé : <a href="${esc(message.reference.url)}" target="_blank" rel="noopener noreferrer">${esc(message.reference.label)} ↗</a></p>` : ''}</article>`;
  }

  function renderStart() {
    const live = window.PrepagoAILive?.info?.() || {enabled: false};
    const subjects = liveSubjects();
    const chapters = liveChapters();
    const modes = [['hint', 'Indice'], ['explanation', 'Explication'], ['correction', 'Correction']];
    const empty = !workspace.thread.length;
    const recent = workspace.thread.filter(message => message.role === 'me').slice(-6).reverse();
    const liveNote = live.enabled ? '' : `<p class="ai-start-note">${live.checking ? 'Vérification du tuteur…' : live.unavailable ? 'Connexion au tuteur indisponible pour le moment.' : 'Le tuteur est en cours d’activation. Tu peux déjà essayer l’exemple guidé.'}</p>`;
    document.querySelector('#page').innerHTML = `<section class="ai-workspace ai-start" aria-label="Prepago AI">
      <div class="ai-start-layout">
        <aside class="ai-start-side" aria-label="Tes questions">
          <button type="button" class="ai-start-new" data-ai-ask-reset>${icon('plus')}Nouvelle question</button>
          <div class="ai-start-recent"><span class="ai-start-label">RÉCENTS</span>
            ${recent.length ? recent.map(message => `<p class="ai-start-recent-item">${esc(message.text.slice(0, 60))}</p>`).join('') : '<p class="ai-start-recent-empty">Tes questions de cette séance apparaîtront ici.</p>'}
          </div>
          ${live.enabled ? `<div class="ai-start-usage"><div><strong>Questions du jour</strong><span>${live.limit - live.remaining} / ${live.limit}</span></div>
            <div class="ai-start-bar" role="progressbar" aria-label="Questions utilisées aujourd’hui" aria-valuemin="0" aria-valuemax="${live.limit}" aria-valuenow="${live.limit - live.remaining}"><span style="width:${Math.round(100 * (live.limit - live.remaining) / Math.max(1, live.limit))}%"></span></div>
            <p>Remis à zéro à minuit (UTC).</p></div>` : ''}
          <div class="ai-start-links"><button type="button" class="link-btn" data-ai-demo>Voir l’exemple guidé</button><button type="button" class="link-btn" data-ai-planner>Plan de révision</button></div>
        </aside>
        <div class="ai-start-main">
          ${empty ? `<div class="ai-start-hero"><span class="ai-start-pill">Tuteur prépa · ${esc(trackLabel())}</span>
            <h1>Sur quoi tu bloques&#160;?</h1>
            <p>Envoie ton exercice. Je te guide un indice à la fois, sans te donner la réponse trop tôt.</p></div>`
            : `<div class="ai-chat" aria-live="polite">${workspace.thread.map(startMessage).join('')}${workspace.asking ? '<p class="ai-chat-wait">Prepago AI réfléchit…</p>' : ''}</div>`}
          <form id="aiAskForm" class="ai-ask" aria-busy="${workspace.asking}">
            <label class="sr-only" for="aiAskText">Ta question</label>
            <textarea id="aiAskText" rows="${empty ? 3 : 2}" maxlength="5000" placeholder="${empty ? 'Colle ton énoncé, ou décris où tu bloques…' : 'Ta réponse ou ta prochaine question…'}" ${workspace.asking ? 'disabled' : ''}>${esc(workspace.ask)}</textarea>
            <div class="ai-ask-tools">
              <button type="button" class="ai-ask-chip" data-ai-ask-file>${icon('paperclip')}Photo ou PDF</button>
              <div class="ai-ask-modes" role="group" aria-label="Niveau d’aide">${modes.map(([mode, label]) => `<button type="button" data-ai-ask-mode="${mode}" aria-pressed="${workspace.askMode === mode}">${label}</button>`).join('')}</div>
              <button type="submit" class="ai-ask-send" aria-label="Envoyer" ${workspace.asking ? 'disabled' : ''}>${icon('send')}</button>
            </div>
            <div class="ai-ask-context">
              <label>Année<select id="aiAskLevel"><option value="sup" ${workspace.context.level === 'sup' ? 'selected' : ''}>Sup</option><option value="spe" ${workspace.context.level === 'spe' ? 'selected' : ''}>Spé</option></select></label>
              <label>Matière<select id="aiAskSubject"><option value="">Choisir</option>${subjects.map(subject => `<option value="${esc(subject.id)}" ${subject.id === workspace.context.subjectId ? 'selected' : ''}>${esc(subject.name)}</option>`).join('')}</select></label>
              <label>Chapitre<select id="aiAskChapter" ${chapters.length ? '' : 'disabled'}><option value="">${chapters.length ? 'Choisir' : 'Choisis une matière'}</option>${chapters.map(chapter => `<option value="${esc(chapter.id)}" ${chapter.id === workspace.context.chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`).join('')}</select></label>
            </div>
            ${hasConsent() ? '' : '<label class="ai-ask-consent"><input type="checkbox" id="aiAskConsent"> Mon texte est envoyé à OpenAI pour obtenir une réponse. Mes notes et mes fichiers restent dans mon espace.</label>'}
          </form>
          <p class="ai-start-status" id="aiAskStatus" role="status">${esc(workspace.askNotice)}</p>
          ${liveNote}
          ${empty ? `<div class="ai-start-suggestions">
            <button type="button" data-ai-suggest="photo"><strong>Photographier un exercice</strong><span>Ouvre ton énoncé à côté du tuteur.</span></button>
            <button type="button" data-ai-suggest="chapter"><strong>Revoir un chapitre</strong><span>Les méthodes à connaître, en 5 minutes.</span></button>
            <button type="button" data-ai-suggest="redaction"><strong>Vérifier ma rédaction</strong><span>Ce qui coûte des points au concours.</span></button>
            <button type="button" data-ai-suggest="cours"><strong>Questions de cours</strong><span>Interroge-moi comme en colle.</span></button>
          </div>` : ''}
          <p class="ai-start-foot">Prepago AI peut se tromper. Vérifie avec ton cours.</p>
        </div>
      </div>
      <input type="file" id="aiFileInput" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Importer un exercice" hidden>
    </section>`;
  }

  async function submitAsk() {
    const text = workspace.ask.trim();
    const live = window.PrepagoAILive?.info?.() || {enabled: false};
    const notice = message => { workspace.askNotice = message; const node = document.querySelector('#aiAskStatus'); if (node) node.textContent = message; };
    if (workspace.asking) return;
    if (text.length < 10) return notice('Écris au moins une phrase (10 caractères).');
    const subject = liveSubjects().find(item => item.id === workspace.context.subjectId);
    const chapter = liveChapters().find(item => item.id === workspace.context.chapterId);
    if (!subject || !chapter) { notice('Choisis la matière et le chapitre de ta question.'); document.querySelector(subject ? '#aiAskChapter' : '#aiAskSubject')?.focus(); return; }
    if (!hasConsent()) {
      if (!document.querySelector('#aiAskConsent')?.checked) { notice('Coche la case pour accepter l’envoi de ton texte.'); document.querySelector('#aiAskConsent')?.focus(); return; }
      saveConsent();
    }
    if (!live.enabled) return notice(live.unavailable ? 'Connexion au tuteur indisponible pour le moment.' : 'Le tuteur est en cours d’activation. Ta question n’a pas été envoyée.');
    const request = generation;
    workspace.thread.push({role: 'me', text});
    workspace.ask = '';
    workspace.askNotice = '';
    workspace.asking = true;
    repaint();
    try {
      const result = await window.PrepagoAILive.ask({question: text, mode: workspace.askMode, level: workspace.context.level, subject: subject.curriculumKey, chapter: chapter.curriculumId});
      if (request !== generation) return;
      workspace.thread.push({role: 'ai', text: result.answer, incomplete: result.incomplete, reference: result.reference});
    } catch (error) {
      if (request !== generation) return;
      workspace.thread.push({role: 'error', text: error.message || 'Connexion au tuteur impossible.'});
    } finally {
      if (request === generation) {
        workspace.asking = false;
        workspace.thread = workspace.thread.slice(-30);
        repaint('#aiAskText');
      }
    }
  }

  function releaseDocument() {
    if (workspace.objectUrl) URL.revokeObjectURL(workspace.objectUrl);
    workspace.objectUrl = null;
    workspace.file = null;
  }

  function clear() {
    generation++;
    releaseDocument();
    document.querySelector('#aiDocumentDialog')?.close();
    workspace = initialState();
  }

  function trackLabel() {
    const track = window.PrepagoCurriculum.normalizeTrack(window.PrepagoAccount?.profile?.filiere);
    return window.PrepagoCurriculum.tracks.find(item => item.id === track)?.label || 'Ton programme';
  }

  function contextLabel() {
    if (workspace.stage === 'demo') return 'Exemple guidé / Physique / Mécanique';
    const subject = state.subjects.find(item => item.id === workspace.context.subjectId);
    const chapter = subject?.chapters.find(item => item.id === workspace.context.chapterId);
    return [trackLabel(), workspace.context.level === 'sup' ? 'Sup' : 'Spé', subject?.name, chapter?.name]
      .filter(Boolean).join(' / ');
  }

  function icon(name) {
    return `<img src="icons/${name}.svg" class="ai-icon" alt="" aria-hidden="true">`;
  }

  function demoDocument() {
    return `<article class="ai-example-sheet" aria-label="Énoncé de l’exercice d’exemple">
      <p class="ai-document-label">Exercice d’exemple</p>
      <h3>Oscillateur harmonique</h3>
      <p>Un solide de masse <i>m</i> = 0,20 kg est relié à un ressort de raideur <i>k</i> = 20 N/m. Il glisse sans frottement sur un axe horizontal. On l’écarte de <i>A</i> = 2 cm de sa position d’équilibre, puis on le lâche sans vitesse initiale.</p>
      <img class="ai-oscillator" src="ai-assets/oscillator.png" width="2148" height="732" alt="Un ressort de raideur k relie une paroi au solide de masse m. L’origine O est la position d’équilibre, l’axe x est orienté vers la droite.">
      <ol><li><mark>Établir l’équation différentielle du mouvement.</mark></li><li>Déterminer la pulsation propre et l’expression de <i>x(t)</i>.</li></ol>
    </article>`;
  }

  function documentContent() {
    if (workspace.stage === 'demo') return demoDocument();
    if (workspace.stage === 'file' && workspace.objectUrl) {
      if (workspace.fileKind === 'pdf') {
        return `<iframe class="ai-pdf" src="${esc(workspace.objectUrl)}" title="Aperçu de ${esc(workspace.file.name)}" referrerpolicy="no-referrer"></iframe>`;
      }
      return `<img class="ai-uploaded-image" src="${esc(workspace.objectUrl)}" alt="Exercice importé : ${esc(workspace.file.name)}">`;
    }
    return `<div class="ai-import-empty">
      ${icon('files')}<h3>Ton prochain exercice</h3>
      <p>Dépose un document ici ou choisis un fichier.</p>
      <button type="button" class="primary-btn" data-ai-import>Choisir une photo ou un PDF</button>
      <span>PDF, JPG, PNG ou WebP · 12 Mo maximum</span>
      <button type="button" class="link-btn" data-ai-demo>Essayer l’exercice d’exemple</button>
    </div>`;
  }

  function contextControls() {
    const subjects = state.subjects || [];
    const chapters = core.chaptersFor(subjects, workspace.context.subjectId, workspace.context.level);
    return `<details class="ai-context-settings"><summary>Associer à mon programme</summary>
      <div class="ai-context-fields">
        <label for="aiLevel">Année<select id="aiLevel"><option value="sup" ${workspace.context.level === 'sup' ? 'selected' : ''}>Sup · première année</option><option value="spe" ${workspace.context.level === 'spe' ? 'selected' : ''}>Spé · deuxième année</option></select></label>
        <label for="aiSubject">Matière<select id="aiSubject"><option value="">Choisir une matière</option>${subjects.map(subject => `<option value="${esc(subject.id)}" ${subject.id === workspace.context.subjectId ? 'selected' : ''}>${esc(subject.name)}</option>`).join('')}</select></label>
        <label for="aiChapter">Chapitre<select id="aiChapter" ${!chapters.length ? 'disabled' : ''}><option value="">${chapters.length ? 'Choisir un chapitre' : 'Choisis une matière'}</option>${chapters.map(chapter => `<option value="${esc(chapter.id)}" ${chapter.id === workspace.context.chapterId ? 'selected' : ''}>${esc(chapter.name)}</option>`).join('')}</select></label>
      </div><p>Filière : ${esc(trackLabel())}. Les matières viennent de ton compte.</p>
    </details>`;
  }

  function tutorContent() {
    if (workspace.stage !== 'demo') return `<div class="ai-tutor-empty">
      <span class="ai-kicker">TON TUTEUR</span>
      <h3>${workspace.stage === 'file' ? 'Ton document est prêt.' : 'Commençons par un exercice.'}</h3>
      <p>${workspace.stage === 'file' ? 'Tu peux le consulter et l’associer à une matière. Les réponses personnalisées seront disponibles à l’activation du tuteur IA.' : 'Ajoute ton énoncé pour préparer la séance, ou découvre le parcours guidé avec notre exercice de mécanique.'}</p>
      <button type="button" class="secondary-btn" data-ai-demo>Découvrir le parcours guidé</button>
    </div>`;

    const lesson = core.lesson(workspace.mode, workspace.step);
    const modes = [['hint', 'Indice'], ['explanation', 'Explication'], ['correction', 'Correction']];
    return `<div class="ai-modes" role="group" aria-label="Type d’aide">${modes.map(([mode, label]) => `<button type="button" data-ai-mode="${mode}" aria-pressed="${workspace.mode === mode}">${label}</button>`).join('')}</div>
      <div class="ai-student-message"><span>Vous · exemple</span><p>Je ne sais pas comment commencer.</p></div>
      <div id="aiLesson" class="ai-lesson" aria-live="polite" aria-atomic="true">
        <span class="ai-kicker">PARCOURS D’EXEMPLE${workspace.mode === 'hint' ? ` · INDICE ${workspace.step + 1}/${core.hints.length}` : ''}</span>
        <h3>${esc(lesson.title)}</h3><p>${esc(lesson.text)}</p>
        <div class="ai-equation">${esc(lesson.equation)}</div>
        <div class="ai-guiding-question">${esc(lesson.question)}</div>
        <div class="ai-lesson-actions">${workspace.mode === 'hint' ? `<button type="button" class="primary-btn" data-ai-next>${workspace.step < core.hints.length - 1 ? 'Afficher le prochain indice' : 'Voir la correction'}</button><button type="button" class="link-btn" data-ai-reasoning>J’ai une réponse</button>` : '<button type="button" class="secondary-btn" data-ai-mode="hint">Reprendre les indices</button>'}</div>
      </div>
      <button type="button" class="ai-source" data-ai-source>${icon('book-open')}<span>Exemple pédagogique · oscillateur harmonique</span>${icon('arrow-right')}</button>`;
  }

  function renderMessages() {
    const target = document.querySelector('#aiReasoning');
    if (target) target.innerHTML = workspace.messages.map(message => `<div class="ai-reasoning-entry"><span>Votre raisonnement</span><p>${esc(message)}</p></div>`).join('');
  }

  function renderLocked() {
    document.querySelector('#page').innerHTML = `<section class="ai-workspace ai-access-gate" aria-label="Prepago AI">
      <header class="ai-workspace-bar"><div><h1>Prepago AI</h1><span class="ai-discovery-label">Prepago AI+</span></div></header>
      <div class="ai-access-content">
        <span class="ai-kicker">ABONNEMENT AI+</span>
        <h2>Réservé à Prepago AI+</h2>
        <p>Cette fonctionnalité nécessite un abonnement Prepago AI+. Elle n’est pas incluse dans l’abonnement Prepago standard.</p>
        <p class="ai-access-availability">Prepago AI+ est en préparation. Les réponses du tuteur IA seront disponibles à son lancement.</p>
        <div class="ai-access-actions"><a class="primary-btn" href="/tarifs/">Voir les offres</a><button type="button" class="secondary-btn" data-ai-planner>Ouvrir mon plan de révision</button></div>
        <p class="ai-access-planner-note">Ton plan de révision reste disponible avec Prepago.</p>
      </div>
    </section>`;
  }

  function renderWorkspace() {
    const isDemo = workspace.stage === 'demo';
    const fileName = workspace.file?.name || (isDemo ? 'Oscillateur harmonique · exemple' : 'Photo ou PDF');
    document.querySelector('#page').innerHTML = `<section class="ai-workspace" data-pane="${workspace.pane}" aria-label="Prepago AI">
      <header class="ai-workspace-bar"><div><h1>Prepago AI</h1><span class="ai-discovery-label">Mode découverte</span></div><div class="ai-workspace-actions"><button type="button" class="link-btn" data-ai-ask-reset>Poser une question</button><button type="button" class="link-btn" data-ai-planner>Plan de révision</button><button type="button" class="primary-btn" data-ai-new>${icon('plus')}Nouvel exercice</button></div></header>
      ${window.PrepagoAILive?.markup() || ''}
      <div class="ai-heading"><p class="ai-breadcrumb">${esc(contextLabel())}</p><h2>Travaillons cet exercice ensemble</h2>${!isDemo ? contextControls() : ''}</div>
      <div class="ai-mobile-switch" role="group" aria-label="Afficher une partie de l’espace"><button type="button" data-ai-pane="document" aria-pressed="${workspace.pane === 'document'}">L’exercice</button><button type="button" data-ai-pane="tutor" aria-pressed="${workspace.pane === 'tutor'}">Le tuteur</button></div>
      <div class="ai-split-layout">
        <section class="ai-document-pane" aria-label="Document de l’exercice">
          <div class="ai-document-head"><div><h2>Ton exercice</h2><p>${icon('files')}<span title="${esc(fileName)}">${esc(fileName)}</span></p></div>
            <div class="ai-document-tools">${workspace.stage !== 'empty' && workspace.fileKind !== 'pdf' ? `<div class="ai-zoom-controls"><button type="button" data-ai-zoom="-10" aria-label="Réduire le document" ${workspace.zoom <= 60 ? 'disabled' : ''}>${icon('minus')}</button><button type="button" data-ai-zoom="reset" aria-label="Réinitialiser le zoom">${workspace.zoom} %</button><button type="button" data-ai-zoom="10" aria-label="Agrandir le document" ${workspace.zoom >= 180 ? 'disabled' : ''}>${icon('plus')}</button></div>` : ''}${workspace.stage !== 'empty' ? `<button type="button" class="ai-open-document" data-ai-open aria-label="Ouvrir le document en grand">${icon('expand')}</button>` : ''}</div>
          </div>
          <div class="ai-document-viewer ${workspace.stage === 'empty' ? 'is-empty' : ''}" id="aiDocumentViewer" aria-busy="${workspace.loading}"><div class="ai-document-scale" style="--ai-document-zoom:${workspace.zoom / 100}">${documentContent()}</div></div>
          <div class="ai-document-footer"><button type="button" class="link-btn" data-ai-import>${icon('paperclip')}${workspace.stage === 'empty' ? 'Choisir un document' : 'Remplacer le fichier'}</button><span>Le fichier reste dans cet onglet.</span></div>
          <input type="file" id="aiFileInput" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Importer un exercice" hidden>
        </section>
        <section class="ai-tutor-pane" aria-label="Aide à la résolution"><header><h2>Un indice à la fois</h2><p>Tu gardes la main sur la résolution.</p></header>
          <div class="ai-tutor-content">${tutorContent()}<div id="aiReasoning" class="ai-reasoning-list"></div></div>
          <form id="aiComposer" class="ai-composer"><label class="sr-only" for="aiMessage">Ton raisonnement sur l’exercice d’exemple</label><textarea id="aiMessage" rows="2" maxlength="2000" placeholder="${isDemo ? 'Écris ton raisonnement…' : 'Les réponses personnalisées arrivent bientôt…'}" ${isDemo ? '' : 'disabled'}>${esc(workspace.draft)}</textarea><div class="ai-composer-bottom"><span>${isDemo ? 'Notes pour cet exemple' : 'Tuteur IA bientôt disponible'}</span><button type="submit" class="primary-btn ai-send" aria-label="Ajouter mon raisonnement" ${isDemo && workspace.draft.trim() ? '' : 'disabled'}>${icon('send')}</button></div></form>
          <p class="ai-discovery-note">${isDemo ? 'Les explications de cet exemple sont préparées à l’avance. Le tuteur IA arrive bientôt.' : 'Aucun document n’est envoyé à un service d’IA.'}</p>
        </section>
      </div><p class="ai-status" id="aiStatus" role="status">${esc(workspace.notice)}</p>
      <dialog id="aiDocumentDialog" class="ai-document-dialog" aria-labelledby="aiDialogTitle"><header><h2 id="aiDialogTitle">${esc(fileName)}</h2><button type="button" data-ai-close-preview aria-label="Fermer le document">${icon('x')}</button></header><div class="ai-dialog-content">${workspace.stage !== 'empty' ? documentContent() : ''}</div></dialog>
    </section>`;
    renderMessages();
  }

  function repaint(focusSelector) {
    if (currentPage !== 'ai' || document.body.classList.contains('auth-pending')) return;
    render();
    if (focusSelector) document.querySelector(focusSelector)?.focus();
  }

  async function acceptFile(file) {
    if (!canUseWorkspace()) return;
    const request = ++generation;
    workspace.loading = true;
    workspace.notice = 'Vérification du document…';
    repaint();
    try {
      const kind = await core.validateFile(file);
      if (request !== generation || !canUseWorkspace()) return;
      const objectUrl = URL.createObjectURL(file);
      releaseDocument();
      workspace.file = file;
      workspace.fileKind = kind;
      workspace.objectUrl = objectUrl;
      workspace.stage = 'file';
      workspace.view = 'workspace';
      workspace.mode = 'hint';
      workspace.step = 0;
      workspace.zoom = 100;
      workspace.draft = '';
      workspace.messages = [];
      workspace.notice = 'Document prêt. Il reste dans cet onglet et n’est pas envoyé à un service d’IA.';
      workspace.pane = 'document';
    } catch (error) {
      if (request === generation) workspace.notice = error.message || 'Impossible de lire ce document.';
    } finally {
      if (request === generation) {
        workspace.loading = false;
        repaint('[data-ai-import]');
      }
    }
  }

  function setMode(mode) {
    if (!['hint', 'explanation', 'correction'].includes(mode)) return;
    workspace.mode = mode;
    repaint(`[data-ai-mode="${mode}"]`);
  }

  renderAI = function () {
    if (workspace.view === 'planner') {
      renderPlanner();
      document.querySelector('#page .section-head').insertAdjacentHTML('afterend', '<button type="button" class="ai-back link-btn" data-ai-workspace>Retour à Prepago AI</button>');
    } else if (canUseWorkspace()) {
      if (workspace.view === 'start') renderStart();
      else renderWorkspace();
    }
    else {
      clear();
      renderLocked();
    }
  };

  pageNames.ai = 'Prepago AI';
  // Prepago AI sits right under Accueil in the sidebar and first in the phone "Plus" menu.
  const aiNav = document.querySelector('[data-page="ai"]');
  aiNav.innerHTML = '<span class="icon"></span>Prepago AI';
  document.querySelector('#mainNav [data-page="overview"]')?.after(aiNav);
  const mobileLink = document.querySelector('.studio-more [data-go="ai"]');
  if (mobileLink) {mobileLink.innerHTML = uiIcon('ai') + 'Prepago AI'; mobileLink.parentElement.prepend(mobileLink);}
  refreshIcons();

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-ai-new],[data-ai-demo],[data-ai-import],[data-ai-mode],[data-ai-next],[data-ai-reasoning],[data-ai-zoom],[data-ai-open],[data-ai-close-preview],[data-ai-pane],[data-ai-planner],[data-ai-workspace],[data-ai-source]');
    if (!target || currentPage !== 'ai' || target.disabled || document.body.classList.contains('auth-pending')) return;
    if (!canUseWorkspace() && !target.hasAttribute('data-ai-planner') && !target.hasAttribute('data-ai-workspace')) return;
    if (target.hasAttribute('data-ai-new')) {
      clear();
      workspace.view = 'workspace';
      workspace.stage = 'empty';
      repaint('[data-ai-import]');
    } else if (target.hasAttribute('data-ai-demo')) {
      clear();
      workspace.view = 'workspace';
      repaint('[data-ai-mode="hint"]');
    } else if (target.hasAttribute('data-ai-import')) {
      document.querySelector('#aiFileInput')?.click();
    } else if (target.hasAttribute('data-ai-mode')) {
      setMode(target.dataset.aiMode);
    } else if (target.hasAttribute('data-ai-next')) {
      if (workspace.step < core.hints.length - 1) workspace.step++;
      else workspace.mode = 'correction';
      repaint(workspace.mode === 'hint' ? '[data-ai-next]' : '[data-ai-mode="correction"]');
    } else if (target.hasAttribute('data-ai-reasoning')) {
      document.querySelector('#aiMessage')?.focus();
    } else if (target.hasAttribute('data-ai-zoom')) {
      workspace.zoom = target.dataset.aiZoom === 'reset' ? 100 : Math.min(180, Math.max(60, workspace.zoom + Number(target.dataset.aiZoom)));
      repaint(`[data-ai-zoom="${target.dataset.aiZoom}"]`);
    } else if (target.hasAttribute('data-ai-open')) {
      document.querySelector('#aiDocumentDialog')?.showModal();
    } else if (target.hasAttribute('data-ai-close-preview')) {
      document.querySelector('#aiDocumentDialog')?.close();
    } else if (target.hasAttribute('data-ai-pane')) {
      workspace.pane = target.dataset.aiPane;
      repaint(`[data-ai-pane="${workspace.pane}"]`);
    } else if (target.hasAttribute('data-ai-planner')) {
      workspace.view = 'planner';
      repaint('#revisionForm input');
    } else if (target.hasAttribute('data-ai-workspace')) {
      workspace.view = 'start';
      repaint('#aiAskText');
    } else if (target.hasAttribute('data-ai-source')) {
      document.querySelector('#aiDocumentDialog')?.showModal();
    }
  });

  // Start screen controls.
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-ai-ask-reset],[data-ai-ask-mode],[data-ai-ask-file],[data-ai-suggest]');
    if (!target || currentPage !== 'ai' || target.disabled || !canUseWorkspace() || document.body.classList.contains('auth-pending')) return;
    if (target.hasAttribute('data-ai-ask-reset')) {
      const context = workspace.context;
      clear();
      workspace.context = context;
      repaint('#aiAskText');
    } else if (target.hasAttribute('data-ai-ask-mode')) {
      workspace.askMode = target.dataset.aiAskMode;
      repaint(`[data-ai-ask-mode="${workspace.askMode}"]`);
    } else if (target.hasAttribute('data-ai-ask-file') || target.dataset.aiSuggest === 'photo') {
      document.querySelector('#aiFileInput')?.click();
    } else {
      const suggestion = SUGGESTIONS[target.dataset.aiSuggest];
      if (!suggestion) return;
      workspace.ask = suggestion.text;
      workspace.askMode = suggestion.mode;
      repaint();
      const field = document.querySelector('#aiAskText');
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'aiAskText' && currentPage === 'ai') { workspace.ask = event.target.value.slice(0, 5000); return; }
    if (event.target.id !== 'aiMessage' || currentPage !== 'ai' || !canUseWorkspace()) return;
    workspace.draft = event.target.value.slice(0, 2000);
    document.querySelector('.ai-send').disabled = !workspace.draft.trim();
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'aiAskForm') {
      event.preventDefault();
      if (currentPage === 'ai' && canUseWorkspace() && !document.body.classList.contains('auth-pending')) void submitAsk();
      return;
    }
    if (event.target.id !== 'aiComposer') return;
    event.preventDefault();
    if (currentPage !== 'ai' || workspace.stage !== 'demo' || !canUseWorkspace() || document.body.classList.contains('auth-pending')) return;
    const message = workspace.draft.trim();
    if (!message) return;
    workspace.messages.push(message);
    workspace.messages = workspace.messages.slice(-10);
    workspace.draft = '';
    workspace.notice = 'Raisonnement ajouté dans cet onglet. Compare-le aux indices ou à la correction de l’exemple.';
    repaint('#aiMessage');
  });

  document.addEventListener('change', event => {
    if (currentPage !== 'ai' || !canUseWorkspace() || document.body.classList.contains('auth-pending')) return;
    if (event.target.id === 'aiFileInput' && event.target.files?.[0]) {
      acceptFile(event.target.files[0]);
    } else if (['aiAskLevel', 'aiAskSubject', 'aiAskChapter'].includes(event.target.id)) {
      if (event.target.id === 'aiAskLevel') { workspace.context.level = event.target.value; workspace.context.chapterId = ''; }
      else if (event.target.id === 'aiAskSubject') { workspace.context.subjectId = event.target.value; workspace.context.chapterId = ''; }
      else workspace.context.chapterId = event.target.value;
      repaint('#' + event.target.id);
    } else if (['aiLevel', 'aiSubject', 'aiChapter'].includes(event.target.id)) {
      if (event.target.id === 'aiLevel') {
        workspace.context.level = event.target.value;
        workspace.context.chapterId = '';
      } else if (event.target.id === 'aiSubject') {
        workspace.context.subjectId = event.target.value;
        workspace.context.chapterId = '';
      } else workspace.context.chapterId = event.target.value;
      repaint();
      document.querySelector('.ai-context-settings').open = true;
      document.querySelector('#' + event.target.id)?.focus();
    }
  });

  document.addEventListener('dragover', event => {
    if (currentPage !== 'ai' || !canUseWorkspace() || !event.target.closest('#aiDocumentViewer') || document.body.classList.contains('auth-pending')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    document.querySelector('#aiDocumentViewer').classList.add('is-dragging');
  });
  document.addEventListener('dragleave', event => {
    const viewer = event.target.closest('#aiDocumentViewer');
    if (viewer && !viewer.contains(event.relatedTarget)) viewer.classList.remove('is-dragging');
  });
  document.addEventListener('drop', event => {
    if (currentPage !== 'ai' || !canUseWorkspace() || !event.target.closest('#aiDocumentViewer') || document.body.classList.contains('auth-pending')) return;
    event.preventDefault();
    document.querySelector('#aiDocumentViewer').classList.remove('is-dragging');
    if (event.dataTransfer.files?.[0]) acceptFile(event.dataTransfer.files[0]);
  });

  document.addEventListener('keydown', event => {
    if (event.target.id !== 'aiAskText' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    document.querySelector('#aiAskForm')?.requestSubmit();
  });

  window.addEventListener('prepago:state-replaced', clear);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', event => { if (event.persisted) repaint(); });
  window.PrepagoAI = Object.freeze({clear});
})();
