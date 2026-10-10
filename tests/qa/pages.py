"""Checks for Concentration, Calendrier, Matières and Annales CNC: they share the Accueil look
(22px title, 16px white cards, one accent) and still work. Run: python3 tests/qa/pages.py"""
import datetime as dt
import sys

import qa
from qa import Site, goto_page

results = []
BRAND = 'rgb(10, 92, 255)'
qa.VIEWPORTS['laptop'] = {'width': 1536, 'height': 730}
qa.VIEWPORTS['wide'] = {'width': 1440, 'height': 900}


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def click(page, selector, wait=600):
    page.locator(selector).locator('visible=true').first.click()
    page.wait_for_timeout(wait)


def live_session(kind='work', minutes=10):
    start = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(minutes=minutes)
    stamp = start.isoformat(timespec='seconds') + 'Z'
    return {
        'id': '00000000-0000-4000-8000-0000000000aa', 'user_id': '11111111-1111-4111-8111-111111111111',
        'kind': kind, 'status': 'active', 'started_at': stamp, 'ended_at': None, 'resumed_at': stamp,
        'duration_seconds': 0, 'focus_duration': 3000, 'break_duration': 600, 'cycles': 2, 'cycle_index': 1,
        'segments': [], 'subject_id': None, 'chapter_id': None, 'subject_name': 'Mathématiques', 'chapter_name': 'Espaces vectoriels',
        'session_goal': 'Exercices 4 à 7', 'notes': '', 'revision': 1, 'legacy_key': None, 'legacy_date': None, 'deleted_at': None,
        'created_at': stamp, 'project_id': None, 'task_id': None, 'event_id': None,
    }


LOOK = '''() => {
  const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const h1 = document.querySelector('#page h1');
  const cards = [...document.querySelectorAll('#page :is(.fc-card, .cal-surface, .cal-agenda, .subject-hub-card, .programme-banner, .matieres-stats, .choice-card, .learning-choice-card, .chapter-mastery-card, .paper-row, .exam-side > .card, .paper-viewer)')].filter(shown);
  return {
    title: h1 ? getComputedStyle(h1).fontSize : null,
    subtitle: [...document.querySelectorAll('#page :is(.fc-heading, .cal-header, .section-head, .work-heading) > div > p, #page .matieres-hero-copy > p')].filter(shown).length,
    cards: cards.length,
    odd: cards.filter(c => { const cs = getComputedStyle(c); return cs.borderTopLeftRadius !== '16px' || cs.boxShadow !== 'none'; }).map(c => c.className).slice(0, 3),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}'''


def look(page, label, problems, cards=True):
    info = page.evaluate(LOOK)
    check(f'{label}: 22px title, nothing under it', info['title'] == '22px' and not info['subtitle'], info)
    if cards:
        check(f'{label}: cards are 16px, flat', info['cards'] > 0 and not info['odd'], info)
    check(f'{label}: no sideways scrolling', info['overflow'] <= 0, info['overflow'])
    check(f'{label}: no errors', not problems, '; '.join(problems[:3]))


with Site() as site:
    # ---- Concentration --------------------------------------------------------------------
    page, problems = site.workspace('wide')
    goto_page(page, 'focus')
    page.wait_for_timeout(500)
    look(page, 'Concentration', problems)
    ring = page.evaluate('''() => { const dial = document.querySelector('.fc-dial'), clock = document.querySelector('#fcClock'), d = dial?.getBoundingClientRect(), c = clock?.getBoundingClientRect();
      return { inside: !!d && !!c && c.left >= d.left && c.right <= d.right && c.top >= d.top && c.bottom <= d.bottom, round: !!d && Math.abs(d.width - d.height) < 1 && d.width >= 160,
        offset: document.querySelector('#fcDial')?.getAttribute('stroke-dashoffset'), stroke: getComputedStyle(document.querySelector('#fcDial')).stroke }; }''')
    check('timer sits inside a full ring before starting', ring['inside'] and ring['round'] and float(ring['offset']) == 0 and ring['stroke'] == BRAND, ring)
    start = page.evaluate("(() => { const b = document.querySelector('[data-fc-action=start]'); const cs = getComputedStyle(b); return [cs.backgroundColor, b.getBoundingClientRect().height]; })()")
    check('start button is the blue main action', start[0] == BRAND and start[1] >= 48, start)
    check('streak chip has no emoji', (text(page, '.fc-streak') or '').startswith('Série :'), text(page, '.fc-streak'))
    bars = page.evaluate("(() => { const all = [...document.querySelectorAll('.fc-bar-track > span')]; return [all.length, all.filter(b => b.classList.contains('today')).map(b => getComputedStyle(b).backgroundColor)]; })()")
    check('week chart: seven bars, today in blue', bars[0] == 7 and bars[1] == [BRAND], bars)
    page.context.close()

    page, problems = site.workspace('laptop', sessions=qa.sample_sessions() + [live_session()])
    goto_page(page, 'focus')
    page.wait_for_timeout(1200)
    first = page.evaluate("[document.querySelector('#fcClock').innerText, +document.querySelector('#fcDial').getAttribute('stroke-dashoffset')]")
    page.wait_for_timeout(2200)
    second = page.evaluate("[document.querySelector('#fcClock').innerText, +document.querySelector('#fcDial').getAttribute('stroke-dashoffset')]")
    check('running session: the time counts down', first[0].startswith(('39:', '40:')) and first[0] != second[0], f'{first} -> {second}')
    check('running session: the ring empties with the time', 100 < first[1] < second[1] < 729, f'{first[1]} -> {second[1]}')
    check('running session: pause and finish are offered', page.is_visible('[data-fc-action=pause]') and page.is_visible('[data-fc-action=finish]'))
    fit = page.evaluate("[Math.round(document.querySelector('.fc-timer').getBoundingClientRect().bottom), innerHeight]")
    check('laptop: the whole timer card is on screen', fit[0] <= fit[1], fit)
    check('running session: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    page, problems = site.workspace('wide', sessions=qa.sample_sessions() + [live_session('break', 3)])
    goto_page(page, 'focus')
    page.wait_for_timeout(1000)
    stroke = page.evaluate("getComputedStyle(document.querySelector('#fcDial')).stroke")
    check('break: labelled, with its own ring colour', text(page, '.fc-mode') == 'TEMPS DE PAUSE' and stroke != BRAND, f"{text(page, '.fc-mode')} / {stroke}")
    click(page, '[data-fc-action=immersive]')
    check('full-screen timer keeps the ring', page.evaluate("document.body.classList.contains('focus-cockpit-immersive') && document.querySelector('.fc-dial').getBoundingClientRect().width >= 220"))
    check('break: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Calendrier ------------------------------------------------------------------------
    page, problems = site.workspace('wide')
    goto_page(page, 'calendar')
    page.wait_for_timeout(500)
    look(page, 'Calendrier', problems)
    check('week view: seven days, today marked', page.evaluate("document.querySelectorAll('.cal-day-head').length === 7 && document.querySelectorAll('.cal-day-head.is-today').length === 1"))
    hour = page.evaluate('''() => { const box = document.querySelector('.cal-timeline-scroll').getBoundingClientRect();
      const first = [...document.querySelectorAll('.cal-time-axis > span')].map(s => s.getBoundingClientRect()).find(r => r.bottom > box.top + 1);
      return [Math.round(first.top - box.top), Math.round(box.bottom), innerHeight]; }''')
    check('week view: the first hour label is not cut off', hour[0] >= 0, hour)
    first_label = page.evaluate("(() => { const box = document.querySelector('.cal-timeline-scroll').getBoundingClientRect(); return [...document.querySelectorAll('.cal-time-axis > span')].find(s => s.getBoundingClientRect().bottom > box.top + 1).innerText; })()")
    check('week view: the agenda opens at 06:00 and scrolls with the page', first_label == '06:00', first_label)
    agenda = page.evaluate("(() => { const cs = getComputedStyle(document.querySelector('.cal-agenda')); return [cs.backgroundColor, cs.borderTopLeftRadius, document.querySelectorAll('.cal-agenda-item').length]; })()")
    check('day programme is a card listing the day', agenda[0] == 'rgb(255, 255, 255)' and agenda[1] == '16px' and agenda[2] >= 3, agenda)
    period = text(page, '.cal-range h2') or ''
    check('date range is not capitalised word by word', ' – ' in period and period[1:] == period[1:].lower(), period)
    click(page, '.cal-view-switch button:nth-child(3)')
    month = page.evaluate("[document.querySelectorAll('.cal-month-day').length, Math.round(document.querySelector('.cal-surface').getBoundingClientRect().bottom), innerHeight]")
    check('month view: every day, on one screen', month[0] >= 28 and month[1] <= month[2], month)
    click(page, '.cal-view-switch button:nth-child(1)')
    check('day view: one column', page.evaluate("document.querySelectorAll('.cal-day-head').length") == 1)
    click(page, '.cal-mode-switch button:nth-child(2)')
    check('"Réel" shows the recorded work', 'enregistré' in (text(page, '.cal-agenda > header > span') or '').lower(), text(page, '.cal-agenda > header > span'))
    click(page, '.cal-header .primary-btn')
    check('"Planifier" opens the event form', page.evaluate("!document.querySelector('#modalBackdrop').hidden"))
    check('Calendrier views: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Matières --------------------------------------------------------------------------
    page, problems = site.workspace('wide')
    goto_page(page, 'subjects')
    page.wait_for_timeout(500)
    look(page, 'Matières', problems)
    grid = page.evaluate('''() => { const cards = [...document.querySelectorAll('.subject-hub-card')].map(c => c.getBoundingClientRect());
      const card = document.querySelector('.subject-hub-card'), sym = card.querySelector('.subject-symbol').getBoundingClientRect(), name = card.querySelector('h2').getBoundingClientRect();
      const banner = document.querySelector('.programme-banner').getBoundingClientRect(), stats = document.querySelector('.matieres-stats').getBoundingClientRect(), h1 = document.querySelector('#page h1').getBoundingClientRect();
      return { count: cards.length, perRow: cards.filter(r => Math.abs(r.top - cards[0].top) < 2).length, tallest: Math.round(Math.max(...cards.map(r => r.height))),
        sameLine: sym.right <= name.left && sym.top < name.bottom && name.top < sym.bottom, titleFirst: h1.bottom <= banner.top, sideBySide: Math.abs(banner.top - stats.top) < 2 && banner.right <= stats.left }; }''')
    check('eight subjects (TIPE has its own page), three per row, compact', grid['count'] == 8 and grid['perRow'] == 3 and grid['tallest'] <= 220, grid)
    check('subject symbol and name share a line', grid['sameLine'], grid)
    check('title first, then programme and figures side by side', grid['titleFirst'] and grid['sideBySide'], grid)
    tint = page.evaluate("[...new Set([...document.querySelectorAll('.subject-hub-card')].map(c => getComputedStyle(c).borderLeftColor + ' ' + getComputedStyle(c).borderLeftWidth))]")
    check('no coloured side stripes on subject cards', tint == ['rgb(227, 233, 242) 1px'], tint)
    click(page, '.matieres-view button:nth-child(2)')
    rows = page.evaluate("[...document.querySelectorAll('.subject-hub-card')].map(c => c.getBoundingClientRect()).filter((r, i, all) => r.width > 900 && r.height <= 80 && (i === 0 || r.top > all[i - 1].top)).length")
    check('list view: one subject per line', rows == 8, rows)
    click(page, '.matieres-view button:nth-child(1)')
    click(page, '.subject-hub-card:nth-child(6) .subject-hub-open')
    check('opening a subject offers Sup and Spé', page.evaluate("document.querySelectorAll('.subject-level-card').length") == 2 and text(page, '#page h1') == 'Mathématiques', text(page, '#page h1'))
    look(page, 'Matière (choix de l’année)', problems)
    click(page, '[data-learning-level=sup]')
    chapters = page.evaluate("[document.querySelectorAll('.chapter-mastery-card').length, !!document.querySelector('#chapterQuery'), document.querySelectorAll('.chapter-mastery-card:first-child .stage-btn').length]")
    check('year opens its chapters with search and steps', chapters[0] >= 5 and chapters[1] and chapters[2] == 5, chapters)
    look(page, 'Matière (chapitres)', problems)
    page.fill('#chapterQuery', 'logique')
    page.wait_for_timeout(300)
    shown = page.evaluate("[...document.querySelectorAll('.chapter-mastery-card')].filter(c => c.getClientRects().length).length")
    check('chapter search narrows the list', 1 <= shown < chapters[0], shown)
    click(page, '[data-back-to-subjects]')
    check('breadcrumb goes back to the subjects', page.evaluate("document.querySelectorAll('.subject-hub-card').length") == 8)
    check('Matières flow: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Annales CNC -----------------------------------------------------------------------
    page, problems = site.workspace('wide')
    goto_page(page, 'cnc')
    page.wait_for_timeout(500)
    look(page, 'Annales CNC', problems)
    home = page.evaluate('''() => { const note = document.querySelector('.cnc-library-note'), h1 = document.querySelector('#page h1').getBoundingClientRect(), grid = document.querySelector('.filiere-grid').getBoundingClientRect();
      const n = note?.getBoundingClientRect(); return { note: note?.innerText.replace(/\\s+/g, ' ').trim(), order: !!n && h1.bottom <= n.top && n.bottom <= grid.top, cards: document.querySelectorAll('.filiere-grid .choice-card').length,
        tallest: Math.round(Math.max(...[...document.querySelectorAll('.filiere-grid .choice-card')].map(c => c.getBoundingClientRect().height))) }; }''')
    check('first screen: title, privacy line, then the filières', 'restent privés' in (home['note'] or '') and 'Actualiser' in home['note'] and home['order'] and home['cards'] == 6, home)
    check('filière cards are compact', home['tallest'] <= 140, home['tallest'])
    click(page, '.choice-card')
    check('a filière lists its subjects, without the privacy line', page.evaluate("document.querySelectorAll('.cnc-subject-grid .choice-card').length >= 7 && !document.querySelector('.cnc-library-note')") and text(page, '#page h1') == 'Filière MP', text(page, '#page h1'))
    look(page, 'CNC (matières)', problems)
    click(page, '.choice-card')
    check('a subject lists its years', page.evaluate("document.querySelectorAll('.paper-row').length") >= 5)
    look(page, 'CNC (années)', problems)
    click(page, '.paper-row')
    paper = page.evaluate("[!!document.querySelector('.paper-viewer'), document.querySelector('#cncClock')?.innerText, getComputedStyle(document.querySelector('#cncClock')).color]")
    check('a paper opens with its timer', paper[0] and paper[1] == '04:00:00' and paper[2] == 'rgb(20, 33, 58)', paper)
    click(page, '[data-cnc-duration="10800"]')
    t = page.evaluate("[document.querySelector('#cncClock').innerText, document.querySelector('#cncDurH').value, document.querySelector('[data-cnc-duration=\"10800\"]').getAttribute('aria-pressed')]")
    check('the exam timer can be set to 3 h', t == ['03:00:00', '3', 'true'], t)
    page.fill('#cncDurH', '1'); page.fill('#cncDurM', '30'); page.press('#cncDurM', 'Enter'); page.locator('#cncDurM').blur(); page.wait_for_timeout(300)
    check('a custom duration is applied and remembered', page.evaluate("document.querySelector('#cncClock').innerText") == '01:30:00' and page.evaluate("Object.values(state.cnc.papers).some(p => p.timerDuration === 5400)"))
    click(page, '[data-cnc-home]')
    accents = page.evaluate("[...document.querySelectorAll('.filiere-grid .choice-code')].map(n => getComputedStyle(n).color)")
    check('each filière has its own colour', len(set(accents)) == len(accents) == 6, accents)
    check('breadcrumb goes back to the first screen', page.evaluate("document.querySelectorAll('.filiere-grid .choice-card').length") == 6 and page.is_visible('.cnc-library-note'))
    check('CNC flow: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Matières hides TIPE; calendar scrolls with the page; TIPE shows one step at a time ----
    page, problems = site.workspace('wide')
    goto_page(page, 'subjects')
    names = page.evaluate("[...document.querySelectorAll('.subject-hub-card h2')].map(n => n.innerText)")
    check('Matières does not list TIPE', names and not any(n.strip().upper().startswith('TIPE') for n in names), names)
    goto_page(page, 'calendar')
    cal = page.evaluate("(() => { const s = document.querySelector('.cal-timeline-scroll'); return {inner: s.scrollHeight - s.clientHeight, allDay: !!document.querySelector('.cal-unscheduled'), label: document.querySelector('.cal-gutter-head').innerText.trim(), first: document.querySelector('.cal-time-axis span:nth-child(7)').getBoundingClientRect().top >= document.querySelector('.cal-days').getBoundingClientRect().bottom - 12}; })()")
    check('calendar: no inner scroll, no all-day row, no 24 h label', cal['inner'] <= 12 and not cal['allDay'] and cal['label'] == '' and cal['first'], cal)
    goto_page(page, 'projects')
    tipe = page.evaluate("[document.querySelectorAll('.tipe-steps > button').length, document.querySelectorAll('.tipe-main > .tipe-section').length, document.querySelector('.tipe-steps .is-active')?.dataset.tipeJump]")
    check('TIPE: 5 steps, one section shown', tipe[0] == 5 and tipe[1] == 1, tipe)
    click(page, '.tipe-steps [data-tipe-jump=mcot]')
    check('TIPE: a step opens its section', page.is_visible('#tipeMCOTForm') and page.evaluate("document.querySelectorAll('.tipe-main > .tipe-section').length") == 1)
    check('TIPE/calendar: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Other pages share the title size; phone and tablet do not scroll sideways --------
    page, problems = site.workspace('wide')
    for name in ('tasks', 'progress', 'projects', 'account'):
        goto_page(page, name)
        info = page.evaluate(LOOK)
        check(f'{name}: 22px title, no sideways scrolling', info['title'] == '22px' and info['overflow'] <= 0, info)
    check('other pages: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    for viewport in ('phone', 'tablet'):
        page, problems = site.workspace(viewport)
        for name in ('focus', 'calendar', 'subjects', 'cnc'):
            goto_page(page, name)
            look(page, f'{viewport} {name}', [], cards=False)
        goto_page(page, 'focus')
        size = page.evaluate("(() => { const d = document.querySelector('.fc-dial').getBoundingClientRect(), c = document.querySelector('.fc-timer').getBoundingClientRect(); return [Math.round(d.width), Math.round(c.width), innerWidth]; })()")
        check(f'{viewport}: timer card spans the page, ring fits', size[0] <= size[1] - 40 and size[1] >= size[2] * .7, size)
        check(f'{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
