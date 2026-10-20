/* Prepago AI tutor: a short conversation about one exercise.
 * Sends only the text the student submits (and the previous messages of this same conversation),
 * never the student's workspace or files. */
(function () {
  'use strict';
  let client = null, userId = null, generation = 0, status = null, busy = false;
  let thread = [];      // [{role:'student'|'tutor', text}]
  let context = null;   // locked after the first question: {level, subjectKey, chapterId, mode, label}

  const core = () => window.PrepagoAICore;
  const escape = value => core().escapeHtml(value);
  const formatted = text => core().formatAnswer(text, window.katex);

  const MAX_SENT_TURNS = 6, MAX_TURN_CHARS = 7000;
  const MODE_LABELS = {hint: 'Un premier indice', explanation: 'Expliquer la méthode', correction: 'Correction expliquée'};
  const FOLLOW_UPS = [
    {label: 'Je ne comprends pas cette étape', text: 'Je ne comprends pas cette étape. Peux-tu l’expliquer autrement, plus simplement ?', mode: null},
    {label: 'Indice suivant', text: 'J’ai compris. Donne-moi l’indice suivant.', mode: 'hint'},
    {label: 'Pourquoi cette méthode ?', text: 'Pourquoi utilise-t-on cette méthode ici ? Comment l’aurais-je deviné seul ?', mode: 'explanation'},
    {label: 'Correction complète', text: 'Montre-moi maintenant la correction complète.', mode: 'correction'}
  ];
  const messages = {
    authentication_required: 'Reconnecte-toi pour utiliser le tuteur.',
    subscription_required: 'Un accès Prepago AI+ valide est nécessaire.',
    not_configured: 'Le tuteur est en cours d’activation.',
    invalid_question: 'Saisis un énoncé de 10 à 5 000 caractères.',
    invalid_context: 'Choisis une matière et un chapitre de ton programme.',
    daily_limit: 'Tes 10 demandes du jour ont été utilisées. Reviens demain.',
    service_limit: 'La limite du service est atteinte pour aujourd’hui. Reviens demain.',
    rate_limit: 'Attends 20 secondes entre deux demandes.',
    duplicate_request: 'Cette demande a déjà été reçue. Elle ne sera pas envoyée deux fois.',
    service_unavailable: 'Le tuteur est momentanément indisponible. Cette demande ne compte pas dans ton quota, réessaie dans un instant.'
  };

  const remaining = () => Math.max(0, (status?.daily_limit || 0) - (status?.used_today || 0));
  const allowed = () => client && userId && status?.enabled && core().hasWorkspaceAccess(window.PrepagoAccount);

  function repaint() { if (currentPage === 'ai' && !document.body.classList.contains('auth-pending')) render(); }
  function clear() {
    generation++; client = null; userId = null; status = null; busy = false; thread = []; context = null;
    const dialog = document.querySelector('#aiLiveDialog'); dialog?.close(); dialog?.remove();
  }
  async function invoke(body) {
    const result = await client.functions.invoke('prepago-ai-tutor', {body});
    if (result.error) {
      let code = result.data?.code;
      try { code ||= (await result.error.context?.json())?.code; } catch { /* Do not display server internals. */ }
      throw new Error(messages[code] || 'Connexion au tuteur impossible. Vérifie ta connexion.');
    }
    return result.data;
  }
  async function connect(nextClient, nextUser) {
    clear(); client = nextClient; userId = nextUser;
    if (!core().hasWorkspaceAccess(window.PrepagoAccount)) return;
    const request = generation;
    try { const next = await invoke({action: 'status'}); if (request !== generation) return; status = next; }
    catch { if (request !== generation) return; status = {enabled: false, unavailable: true}; }
    repaint();
  }

  function markup() {
    if (!client || !core().hasWorkspaceAccess(window.PrepagoAccount)) return '';
    if (status?.enabled) return `<aside class="ai-live-banner"><div><strong>Tuteur IA · pose ta question, puis continue la discussion</strong><span>${remaining()} demandes restantes aujourd’hui · renouvellement à minuit UTC</span></div><button type="button" class="primary-btn" data-ai-live-open>${thread.length ? 'Reprendre la discussion' : 'Poser une question'}</button></aside>`;
    return `<aside class="ai-live-banner"><div><strong>${status?.unavailable ? 'Connexion au tuteur indisponible' : status ? 'Tuteur en cours d’activation' : 'Vérification du tuteur…'}</strong><span>L’exemple guidé reste disponible. Les photos et PDF restent dans ton navigateur.</span></div></aside>`;
  }

  function options(items, placeholder) { return `<option value="">${placeholder}</option>` + items.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join(''); }
  function subjects() { return (state.subjects || []).filter(subject => subject.curriculumKey && subject.chapters.some(chapter => chapter.curriculumId)); }
  function chapters(form) {
    const subject = subjects().find(item => item.id === form.elements.subject.value);
    const items = (subject?.chapters || []).filter(chapter => chapter.curriculumId && chapter.studyLevel === form.elements.level.value);
    form.elements.chapter.innerHTML = options(items, items.length ? 'Choisir un chapitre' : 'Aucun chapitre pour cette année');
    form.elements.chapter.disabled = !items.length;
  }

  function setupForm() {
    return `<form id="aiLiveForm" class="ai-tutor-setup">
      <div class="ai-live-context">
        <label>Année<select name="level" required><option value="sup">Sup</option><option value="spe">Spé</option></select></label>
        <label>Matière<select name="subject" required>${options(subjects(), 'Choisir une matière')}</select></label>
        <label class="ai-span-2">Chapitre<select name="chapter" required disabled><option value="">Choisir une matière</option></select></label>
      </div>
      <fieldset class="ai-mode-picker"><legend>Aide souhaitée</legend>
        ${Object.entries(MODE_LABELS).map(([key, label], index) => `<label><input type="radio" name="mode" value="${key}" ${index === 0 ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      </fieldset>
      <label for="aiLiveQuestion">Ton énoncé et ce qui te bloque</label>
      <textarea id="aiLiveQuestion" name="question" rows="7" minlength="10" maxlength="5000" required placeholder="Copie l’énoncé complet, puis précise où tu bloques (ou ce que tu as déjà essayé)… Tu peux écrire les formules en LaTeX : $\\int_0^1 f(t)\\,dt$"></textarea>
      <label class="support-check"><input type="checkbox" name="consent" required> Envoyer cet énoncé à OpenAI pour obtenir une réponse. Mes notes et mes fichiers restent dans mon espace.</label>
      <div class="ai-tutor-actions"><span class="support-helper">${remaining()} demandes restantes · le tuteur peut se tromper, vérifie avec ton cours.</span><button type="submit" class="primary-btn">Demander de l’aide</button></div>
    </form>`;
  }

  function threadMarkup() {
    return thread.map((turn, index) => turn.role === 'student'
      ? `<article class="ai-msg ai-msg-student"><span class="ai-msg-who">Toi</span><div class="ai-msg-body">${formatted(turn.text)}</div></article>`
      : `<article class="ai-msg ai-msg-tutor"><span class="ai-msg-who">Tuteur Prepago</span><div class="ai-msg-body ai-live-text">${formatted(turn.text)}</div>
          ${turn.incomplete ? '<p class="ai-msg-note">La réponse a atteint sa limite de longueur. Demande la suite si besoin.</p>' : ''}
          ${turn.reference ? `<p class="ai-msg-note">Programme associé : <a href="${escape(turn.reference.href)}" target="_blank" rel="noopener noreferrer">${escape(turn.reference.label)} ↗</a></p>` : ''}
          <button type="button" class="ai-copy" data-ai-copy="${index}">Copier</button></article>`).join('');
  }

  function followUpForm() {
    return `<form id="aiFollowForm" class="ai-tutor-follow">
      <div class="ai-chips">${FOLLOW_UPS.map((item, index) => `<button type="button" class="ai-chip" data-ai-follow="${index}">${item.label}</button>`).join('')}</div>
      <div class="ai-composer"><textarea name="question" rows="2" minlength="2" maxlength="5000" required placeholder="Pose une question sur cette réponse, ou montre ta démarche…"></textarea>
      <button type="submit" class="primary-btn" aria-label="Envoyer">Envoyer</button></div>
      <div class="ai-tutor-actions"><span class="support-helper">${remaining()} demandes restantes aujourd’hui</span><button type="button" class="ai-link" data-ai-reset>Nouvelle question</button></div>
    </form>`;
  }

  function paint(notice = '') {
    const dialog = document.querySelector('#aiLiveDialog'); if (!dialog) return;
    const body = dialog.querySelector('.ai-tutor-body');
    const chip = context ? `<p class="ai-tutor-context">${escape(context.label)}</p>` : '';
    body.innerHTML = thread.length
      ? `${chip}<section class="ai-thread" aria-live="polite">${threadMarkup()}${busy ? '<article class="ai-msg ai-msg-tutor ai-msg-pending"><span class="ai-msg-who">Tuteur Prepago</span><div class="ai-typing"><i></i><i></i><i></i></div></article>' : ''}</section>${followUpForm()}`
      : setupForm();
    const statusLine = dialog.querySelector('#aiLiveStatus'); statusLine.textContent = notice;
    body.querySelectorAll('input,select,textarea,button').forEach(control => { if (busy) control.disabled = true; });
    // Show the start of the newest message, inside the thread only (the page itself never jumps).
    const list = body.querySelector('.ai-thread'), last = list?.lastElementChild;
    if (list && last) list.scrollTop = Math.max(0, last.offsetTop - list.offsetTop - 8);
  }

  function open() {
    if (!allowed()) return;
    let dialog = document.querySelector('#aiLiveDialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'aiLiveDialog';
      dialog.className = 'prepago-support-dialog ai-live-dialog ai-tutor-dialog';
      dialog.setAttribute('aria-labelledby', 'aiLiveTitle');
      dialog.innerHTML = `<header class="support-heading"><div><span class="support-kicker">Prepago AI+</span><h2 id="aiLiveTitle">Ton tuteur de prépa</h2></div><button type="button" class="icon-btn" data-ai-live-close aria-label="Fermer">×</button></header>
        <div class="ai-tutor-body"></div><p id="aiLiveStatus" class="ai-tutor-status" role="status"></p>`;
      dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); return; } dialog.close(); });
      document.body.append(dialog);
    }
    paint();
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector('#aiFollowForm textarea') || dialog.querySelector('select'))?.focus();
  }

  function history() {
    const trimmed = thread.map(turn => ({role: turn.role, text: turn.text.length > MAX_TURN_CHARS ? turn.text.slice(0, MAX_TURN_CHARS) : turn.text}));
    // Always keep the original statement and its first answer, then the most recent exchanges.
    return trimmed.length <= MAX_SENT_TURNS ? trimmed : [...trimmed.slice(0, 2), ...trimmed.slice(-(MAX_SENT_TURNS - 2))];
  }

  async function ask(question, mode) {
    if (busy || !allowed() || !context) return;
    const request = generation;
    const body = {request_id: crypto.randomUUID(), question, mode, level: context.level, subject: context.subjectKey,
      chapter: context.chapterId, history: thread.length ? history() : undefined};
    thread.push({role: 'student', text: question});
    busy = true; paint();
    try {
      const result = await invoke(body); if (request !== generation) return;
      status = {...status, used_today: result.used_today, daily_limit: result.daily_limit};
      let reference = null;
      if (thread.length === 1) {
        try { const url = new URL(result.reference?.url); if (url.protocol === 'https:' && url.hostname === 'www.cpge.ac.ma') reference = {href: url.href, label: result.reference.label}; } catch { /* No arbitrary links. */ }
      }
      thread.push({role: 'tutor', text: result.answer, incomplete: result.incomplete, reference});
      busy = false; paint();
    } catch (error) {
      if (request !== generation) return;
      const failed = thread.pop(); // Give the student their text back so nothing is lost.
      busy = false; paint(error.message);
      const field = document.querySelector('#aiFollowForm textarea') || document.querySelector('#aiLiveQuestion');
      if (field && failed) field.value = failed.text;
      const setup = document.querySelector('#aiLiveForm');
      if (setup && context) {
        setup.elements.level.value = context.level; setup.elements.subject.value = context.subjectId; chapters(setup);
        setup.elements.chapter.value = context.localChapterId;
        setup.querySelector(`input[name="mode"][value="${context.mode}"]`)?.click();
        context = null;
      }
      void window.PrepagoSupport?.record('ai_request_failed', 'ai');
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-ai-live-open]')) open();
    if (event.target.closest('[data-ai-live-close]') && !busy) document.querySelector('#aiLiveDialog')?.close();
    if (event.target.closest('[data-ai-reset]') && !busy) { thread = []; context = null; paint(); }
    const follow = event.target.closest('[data-ai-follow]');
    if (follow && !busy) {
      const item = FOLLOW_UPS[Number(follow.dataset.aiFollow)];
      if (item) { if (item.mode) context.mode = item.mode; void ask(item.text, context.mode); }
    }
    const copy = event.target.closest('[data-ai-copy]');
    if (copy) {
      const turn = thread[Number(copy.dataset.aiCopy)];
      if (turn) navigator.clipboard?.writeText(turn.text).then(() => { copy.textContent = 'Copié ✓'; setTimeout(() => { copy.textContent = 'Copier'; }, 1500); }, () => {});
    }
  });
  document.addEventListener('change', event => {
    if (event.target.closest('#aiLiveForm') && ['level', 'subject'].includes(event.target.name)) chapters(event.target.form);
  });
  document.addEventListener('keydown', event => {
    // Ctrl/Cmd + Entrée envoie la question.
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && event.target.closest('#aiLiveForm, #aiFollowForm')) {
      event.preventDefault(); event.target.form?.requestSubmit();
    }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'aiFollowForm') {
      event.preventDefault();
      const text = form.elements.question.value.trim();
      if (text.length >= 2 && !busy) void ask(text, context.mode);
      return;
    }
    if (form.id !== 'aiLiveForm') return;
    event.preventDefault();
    if (busy || !allowed() || !form.reportValidity()) return;
    const subject = subjects().find(item => item.id === form.elements.subject.value);
    const chapter = subject?.chapters.find(item => item.id === form.elements.chapter.value && item.studyLevel === form.elements.level.value);
    if (!chapter?.curriculumId) return;
    const mode = form.elements.mode.value || 'hint';
    context = {level: form.elements.level.value, subjectKey: subject.curriculumKey, chapterId: chapter.curriculumId, mode,
      subjectId: subject.id, localChapterId: chapter.id,
      label: [form.elements.level.value === 'sup' ? 'Sup' : 'Spé', subject.name, chapter.name].join(' · ')};
    void ask(form.elements.question.value.trim(), mode);
  });
  window.addEventListener('pagehide', clear);
  window.PrepagoAILive = Object.freeze({connect, clear, markup});
})();
