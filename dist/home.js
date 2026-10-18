/* Accueil — the home dashboard.
   Replaces the earlier overview layouts. It only reads the workspace data and reuses the
   existing actions (tasks, events, focus sessions, navigation); nothing here saves on its own
   except the concours the student follows and their dates. */
(() => {
  'use strict';

  const SHORT_SUBJECTS = {
    'Mathématiques': 'Maths',
    'Sciences industrielles': 'SI',
    'Sciences de l’ingénieur': 'SI',
    "Sciences de l'ingénieur": 'SI',
    'Informatique': 'Info'
  };
  const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const RING = 2 * Math.PI * 58;
  /* The written exams usually start in mid-May. Used until the student sets their own date. */
  const CNC_ESTIMATE = { month: 5, day: 14 };

  let mirroredAt = Date.now();
  window.addEventListener('prepago:study-changed', () => { mirroredAt = Date.now(); });

  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const clock = seconds => {
    const s = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const dateFromISO = iso => new Date(`${iso}T12:00:00`);

  function firstName() {
    const profile = window.PrepagoAccount?.profile;
    const raw = cleanDisplayName(profile?.first_name || profile?.full_name || state.profileName || '');
    return raw === 'Préparationnaire' ? '' : raw.split(/\s+/)[0];
  }

  function workMinutes() {
    const minutes = Number(state.focusSettings?.work) || Math.round((Number(focusRun?.duration) || 0) / 60);
    return Math.min(180, Math.max(1, minutes || 25));
  }

  /* ---- Hero: what to work on now ------------------------------------------------------ */
  function heroModel() {
    const active = window.PrepagoFocus?.snapshot?.().active;
    if (active) {
      const duration = active.kind === 'break' ? active.break_duration : active.focus_duration;
      const paused = active.status === 'paused';
      const place = [active.subject_name, active.chapter_name].filter(Boolean).join(' · ');
      return {
        label: active.kind === 'break' ? 'Pause en cours' : paused ? 'Session en pause' : 'Session en cours',
        title: place || active.session_goal || 'Étude libre',
        line: [place ? active.session_goal : '', `${Math.round(duration / 60)} min`].filter(Boolean).join(' · '),
        button: 'Reprendre la session',
        start: 'resume',
        live: true,
        duration
      };
    }
    const minutes = workMinutes();
    const next = nextStudy();
    if (next) {
      const step = next.c.nextExercise || LEARNING_STEPS.find(item => !next.c.steps?.[item.key])?.label || 'Valider le chapitre';
      return {
        label: 'À faire maintenant',
        title: `${next.s.name} · ${next.c.name}`,
        line: `${step} · ${minutes} min`,
        button: 'Démarrer la session',
        start: 'chapter',
        subject: next.s.id,
        chapter: next.c.id,
        goal: step,
        duration: minutes * 60
      };
    }
    const task = state.tasks.filter(item => !item.done && item.date <= todayISO())
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'))[0];
    if (task) {
      const length = Math.min(180, Math.max(1, Number(task.minutes) || minutes));
      return {
        label: 'À faire maintenant',
        title: [task.subject, task.title].filter(Boolean).join(' · '),
        line: `${length} min`,
        button: 'Démarrer la session',
        start: 'task',
        task: task.id,
        duration: length * 60
      };
    }
    return {
      label: 'À faire maintenant',
      title: 'Session libre',
      line: `Choisis ton objectif · ${minutes} min`,
      button: 'Préparer une session',
      start: 'free',
      duration: minutes * 60
    };
  }

  function liveSecondsLeft() {
    const left = Number(focusRun?.left) || 0;
    return focusRun?.running ? left - (Date.now() - mirroredAt) / 1000 : left;
  }

  function hero() {
    const model = heroModel();
    const left = model.live ? Math.max(0, liveSecondsLeft()) : model.duration;
    const fraction = model.duration ? Math.min(1, left / model.duration) : 1;
    const attrs = [`data-home-start="${model.start}"`];
    if (model.subject) attrs.push(`data-subject="${esc(model.subject)}"`, `data-chapter="${esc(model.chapter)}"`, `data-goal="${esc(model.goal)}"`);
    if (model.task) attrs.push(`data-task-id="${esc(model.task)}"`);
    return `<section class="home-card home-hero" aria-labelledby="homeHeroTitle">
      <div class="home-hero-copy">
        <p class="home-hero-label">${esc(model.label)}</p>
        <h2 id="homeHeroTitle">${esc(model.title)}</h2>
        <p class="home-hero-line">${esc(model.line)}</p>
      </div>
      <button type="button" class="home-hero-button" ${attrs.join(' ')}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4.8v14.4L19 12z"/></svg>
        <span>${esc(model.button)}</span>
      </button>
      <div class="home-ring" ${model.live ? `data-home-live="${model.duration}"` : ''} role="img" aria-label="${model.live ? 'Temps restant' : 'Durée prévue'} : ${clock(left)}">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="home-ring-track" cx="60" cy="60" r="58"/><circle class="home-ring-value" cx="60" cy="60" r="58" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${(RING * (1 - fraction)).toFixed(2)}"/></svg>
        <strong>${clock(left)}</strong>
      </div>
    </section>`;
  }

  /* ---- Today's tasks ------------------------------------------------------------------ */
  function todayCard() {
    const tasks = state.tasks.filter(task => task.date === todayISO()).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const done = tasks.filter(task => task.done).length;
    const rows = tasks.slice(0, 3).map(task => {
      const subject = task.subject ? `<span class="home-chip">${esc(SHORT_SUBJECTS[task.subject] || task.subject)}</span>` : '';
      return `<label class="home-task ${task.done ? 'is-done' : ''}"><input type="checkbox" class="home-check" data-task="${esc(task.id)}" ${task.done ? 'checked' : ''} aria-label="Terminer : ${esc(task.title)}"><span class="home-task-title">${esc(task.title)}</span>${subject}</label>`;
    }).join('');
    const body = tasks.length
      ? `<div class="home-tasks">${rows}</div>
         <div class="home-card-foot"><span class="home-bar" role="progressbar" aria-label="Tâches terminées aujourd’hui" aria-valuemin="0" aria-valuemax="${tasks.length}" aria-valuenow="${done}"><i style="width:${done / tasks.length * 100}%"></i></span><span class="home-count">${done} / ${tasks.length}</span></div>`
      : `<p class="home-empty">Aucune tâche prévue aujourd’hui.</p><button type="button" class="home-link" data-task-new>+ Ajouter une tâche</button>`;
    return `<section class="home-card home-today" aria-labelledby="homeTodayTitle">
      <div class="home-card-head"><h2 id="homeTodayTitle"><button type="button" class="home-card-title" data-go="tasks">Aujourd’hui</button></h2>${tasks.length > 3 ? `<button type="button" class="home-link" data-go="tasks">Voir les ${tasks.length} tâches</button>` : ''}</div>
      ${body}
    </section>`;
  }

  /* ---- Next event --------------------------------------------------------------------- */
  function nextCard() {
    const event = dashboardUpcomingEvents(todayISO())[0];
    let body = `<p class="home-empty">Aucun rendez-vous à venir.</p><button type="button" class="home-link" data-dashboard-new-event>+ Planifier un rendez-vous</button>`;
    if (event) {
      const day = event.date === todayISO() ? '' : new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(dateFromISO(event.date)).replace(/^./, letter => letter.toUpperCase());
      const hours = event.allDay ? 'Toute la journée' : event.time ? `${event.time}${event.end ? ` — ${event.end}` : ''}` : '';
      const when = [day, hours].filter(Boolean).join(' · ') || 'Aujourd’hui';
      body = `<button type="button" class="home-event" data-edit-event="${esc(event.id)}">
        <span class="home-event-bar" aria-hidden="true"></span>
        <span class="home-event-copy"><span class="home-event-time">${esc(when)}</span><strong>${esc(event.title)}</strong>${event.location ? `<span class="home-event-place">${esc(event.location)}</span>` : ''}</span>
      </button>`;
    }
    return `<section class="home-card home-next" aria-labelledby="homeNextTitle">
      <h2 id="homeNextTitle"><button type="button" class="home-card-title" data-go="calendar">Prochain rendez-vous</button></h2>
      ${body}
    </section>`;
  }

  /* ---- Study hours this week ---------------------------------------------------------- */
  function hoursCard() {
    const today = todayISO();
    const dates = dashboardPeriodDates('week');
    const values = dates.map(date => focusMinutesOn(date));
    const total = values.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(60, ...values);
    const bars = dates.map((date, index) => {
      const minutes = values[index];
      const height = minutes > 0 ? `max(6px, ${Math.round(minutes / peak * 100)}%)` : '4px';
      const state_ = date === today ? 'is-today' : date > today ? 'is-future' : '';
      return `<div class="home-day ${state_} ${minutes > 0 ? 'has-time' : 'is-zero'}" title="${esc(formatDate(dateFromISO(date)))} : ${studyHours(minutes * 60)}"><span class="home-day-track"><i style="height:${height}"></i></span><small>${DAY_LETTERS[index]}</small></div>`;
    }).join('');
    return `<section class="home-card home-hours" aria-labelledby="homeHoursTitle">
      <h2 id="homeHoursTitle"><button type="button" class="home-card-title" data-go="progress">Heures d’étude</button></h2>
      <p class="home-hours-total"><strong>${studyHours(total * 60).replace(/ /g, ' ')}</strong><span>cette semaine</span></p>
      <div class="home-week" role="img" aria-label="Temps étudié par jour cette semaine. Total : ${studyHours(total * 60)}.">${bars}</div>
    </section>`;
  }

  /* ---- Progress by subject ------------------------------------------------------------ */
  function progressCard() {
    const subjects = state.subjects;
    const rows = subjects.slice(0, 4).map(subject => {
      const value = subjectMastery(subject);
      return `<div class="home-progress-row"><span class="home-progress-name">${esc(subject.name)}</span><span class="home-bar" role="progressbar" aria-label="Progression en ${esc(subject.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></span><span class="home-progress-value">${value} %</span></div>`;
    }).join('');
    const body = subjects.length
      ? `<div class="home-progress-list">${rows}</div>`
      : `<p class="home-empty">Ajoute une matière pour suivre ta progression.</p><button type="button" class="home-link" data-go="subjects">+ Ajouter une matière</button>`;
    return `<section class="home-card home-progress" aria-labelledby="homeProgressTitle">
      <div class="home-card-head"><h2 id="homeProgressTitle"><button type="button" class="home-card-title" data-go="progress">Progression</button></h2>${subjects.length > 4 ? `<button type="button" class="home-link" data-go="progress">Voir les ${subjects.length} matières</button>` : ''}</div>
      ${body}
    </section>`;
  }

  /* ---- Days left before the concours the student follows ------------------------------ */
  /* Estimates are the first day of the 2026 written exams, reused each year until the student
     sets the official date. The card shows up to MAX_SHOWN concours: names and days left only. */
  const MAX_SHOWN = 4;
  const EXAMS = [
    { id: 'CNC', name: 'CNC', month: CNC_ESTIMATE.month, day: CNC_ESTIMATE.day },
    { id: 'CNAEM', name: 'CNAEM', month: 5, day: 11 },
    { id: 'X', name: 'X-ENS', label: 'X-ENS (Polytechnique)', month: 4, day: 13 },
    { id: 'MINES', name: 'Mines-Ponts', month: 4, day: 27 },
    { id: 'CENTRALE', name: 'Centrale-Supélec', month: 5, day: 4 },
    { id: 'CCINP', name: 'CCINP', label: 'CCINP (ex-CCP)', month: 4, day: 20 },
    { id: 'E3A', name: 'e3a-Polytech', month: 4, day: 21 }
  ];
  const examById = id => EXAMS.find(exam => exam.id === id);
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const GEAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>';

  function examSettings() {
    const saved = state.examCountdown && typeof state.examCountdown === 'object' ? state.examCountdown : {};
    let follow = Array.isArray(saved.follow) ? saved.follow.filter(examById).slice(0, MAX_SHOWN) : [];
    if (!follow.length) {
      const track = window.PrepagoCurriculum?.normalizeTrack?.(window.PrepagoAccount?.profile?.filiere);
      follow = [track === 'ECS' || track === 'ECT' ? 'CNAEM' : 'CNC'];
    }
    const dates = { ...(saved.dates && typeof saved.dates === 'object' ? saved.dates : {}) };
    if (!dates.CNC && ISO.test(String(state.cncExamDate || ''))) dates.CNC = state.cncExamDate;
    return { follow, dates };
  }

  function examDate(exam, dates) {
    const today = dateFromISO(todayISO());
    const saved = String(dates[exam.id] || '');
    if (ISO.test(saved) && (dateFromISO(saved) - today) / 86400000 >= -7) return saved;
    let year = today.getFullYear();
    const pad = value => String(value).padStart(2, '0');
    const estimate = () => `${year}-${pad(exam.month)}-${pad(exam.day)}`;
    if ((dateFromISO(estimate()) - today) / 86400000 < -7) year += 1;
    return estimate();
  }

  function cncCard() {
    const { follow, dates } = examSettings();
    const items = follow.map(id => ({ exam: examById(id), iso: examDate(examById(id), dates) }))
      .sort((x, y) => x.iso.localeCompare(y.iso));
    const tiles = items.map(({ exam, iso }) => {
      const days = Math.round((dateFromISO(iso) - dateFromISO(todayISO())) / 86400000);
      const count = days > 0 ? `J-${days}` : days === 0 ? 'Jour J' : `J+${-days}`;
      const spoken = days > 0 ? `${exam.name} : ${plural(days, 'jour')} avant les écrits` : days === 0 ? `${exam.name} : les écrits commencent aujourd’hui` : `${exam.name} : écrits commencés depuis ${plural(-days, 'jour')}`;
      return `<div class="home-exam" aria-label="${esc(spoken)}"><span class="home-exam-name" aria-hidden="true">${esc(exam.name)}</span><strong class="home-exam-count" aria-hidden="true">${count}</strong></div>`;
    }).join('');
    return `<section class="home-card home-cnc" aria-label="Compte à rebours des concours">
      <button type="button" class="home-exam-settings" data-home-cnc-date aria-label="Gérer mes concours" title="Gérer mes concours">${GEAR}</button>
      <div class="home-exams" data-count="${items.length}">${tiles}</div>
    </section>`;
  }

  function editCncDate() {
    const { follow, dates } = examSettings();
    const rows = EXAMS.map(exam => {
      const followed = follow.includes(exam.id);
      const saved = ISO.test(String(dates[exam.id] || '')) ? dates[exam.id] : '';
      return `<div class="home-exam-row">
        <label><input type="checkbox" name="follow_${exam.id}" data-home-exam-follow ${followed ? 'checked' : ''}> ${esc(exam.label || exam.name)}</label>
        <input type="date" name="date_${exam.id}" value="${esc(saved)}" aria-label="Premier jour des écrits · ${esc(exam.name)}">
      </div>`;
    }).join('');
    openModal('Mes concours',
      `<p class="helper">Choisis jusqu’à ${MAX_SHOWN} concours à afficher. Sans date, le compte à rebours vise une date estimée.</p><div class="home-exam-list">${rows}</div>`,
      data => {
        const picked = EXAMS.filter(exam => data[`follow_${exam.id}`]).map(exam => exam.id).slice(0, MAX_SHOWN);
        const next = {};
        EXAMS.forEach(exam => { const value = String(data[`date_${exam.id}`] || ''); if (ISO.test(value)) next[exam.id] = value; });
        state.examCountdown = { follow: picked.length ? picked : follow, dates: next };
        if (next.CNC) state.cncExamDate = next.CNC; else delete state.cncExamDate;
      });
    limitFollowed();
  }

  /* Once MAX_SHOWN concours are ticked, the others are disabled until one is unticked. */
  function limitFollowed() {
    const boxes = [...document.querySelectorAll('#modalForm [data-home-exam-follow]')];
    const full = boxes.filter(box => box.checked).length >= MAX_SHOWN;
    boxes.forEach(box => { box.disabled = full && !box.checked; });
  }
  document.addEventListener('change', event => { if (event.target.matches?.('[data-home-exam-follow]')) limitFollowed(); });

  /* ---- Page --------------------------------------------------------------------------- */
  renderOverview = function () {
    const name = firstName();
    document.querySelector('#page').innerHTML = `<div class="home">
      <div class="home-screen">
        <h1 class="home-title">Bonjour${name ? `, ${esc(name)}` : ''}</h1>
        ${hero()}
        <div class="home-row">${todayCard()}${nextCard()}${hoursCard()}</div>
        <div class="home-row">${progressCard()}${cncCard()}</div>
      </div>
      <div class="home-extra"></div>
    </div>`;
  };

  /* The account name can arrive after the first paint; keep the greeting and the level line in step. */
  const baseSidebar = updateSidebar;
  updateSidebar = function (...args) {
    const result = baseSidebar(...args);
    const xp = document.querySelector('#sideXp');
    if (xp) xp.textContent = `${Number(state.xp) || 0} XP`;
    const title = document.querySelector('.home-title');
    if (title) { const name = firstName(); title.textContent = name ? `Bonjour, ${name}` : 'Bonjour'; }
    return result;
  };

  document.addEventListener('click', event => {
    if (event.target.closest('[data-home-cnc-date]')) { editCncDate(); return; }
    const button = event.target.closest('[data-home-start]');
    if (!button) return;
    const kind = button.dataset.homeStart;
    if (kind === 'resume' || kind === 'free') { navigate('focus'); return; }
    if (kind === 'chapter') {
      const subject = state.subjects.find(item => item.id === button.dataset.subject);
      const chapter = subject?.chapters.find(item => item.id === button.dataset.chapter);
      if (!chapter) { navigate('focus'); return; }
      state.lastStudy = { subject: subject.id, chapter: chapter.id };
      save();
      prepareFocus({ subject: subject.name, chapterId: chapter.id, title: button.dataset.goal || chapter.name, minutes: workMinutes() });
    } else if (kind === 'task') {
      const task = state.tasks.find(item => item.id === button.dataset.taskId);
      if (!task) { navigate('focus'); return; }
      prepareFocus(task);
    }
    /* The focus page is now open with this objective filled in: start the timer. */
    if (currentPage === 'focus') document.querySelector('[data-fc-action="start"]')?.click();
  });

  /* Remaining time of a running session, once a second, without redrawing the page. */
  setInterval(() => {
    if (currentPage !== 'overview' || document.hidden) return;
    const ring = document.querySelector('.home-ring[data-home-live]');
    if (!ring) return;
    const duration = Number(ring.dataset.homeLive) || 1;
    const left = Math.max(0, liveSecondsLeft());
    ring.querySelector('strong').textContent = clock(left);
    ring.querySelector('.home-ring-value').setAttribute('stroke-dashoffset', (RING * (1 - Math.min(1, left / duration))).toFixed(2));
  }, 1000);

  if (currentPage === 'overview' && document.querySelector('#page')?.children.length) render();
})();
