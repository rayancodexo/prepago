"""Behaviour checks for the Accueil dashboard. Run: python3 tests/qa/home.py"""
import datetime as dt
import sys

import qa
from qa import Site

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def rpc_calls(page, name):
    return page.evaluate('n => (window.__QA_CALLS || []).filter(c => c.rpc === n)', name)


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def expected_cnc_days():
    today = dt.date.today()
    exam = dt.date(today.year, 5, 14)
    if (exam - today).days < -7:
        exam = dt.date(today.year + 1, 5, 14)
    return (exam - today).days


def live_session():
    start = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(minutes=10)
    stamp = start.isoformat(timespec='seconds') + 'Z'
    return {
        'id': '00000000-0000-4000-8000-0000000000aa', 'user_id': '11111111-1111-4111-8111-111111111111',
        'kind': 'work', 'status': 'active', 'started_at': stamp, 'ended_at': None, 'resumed_at': stamp,
        'duration_seconds': 0, 'focus_duration': 3000, 'break_duration': 300, 'cycles': 1, 'cycle_index': 1,
        'segments': [], 'subject_id': None, 'chapter_id': None, 'subject_name': 'Mathématiques', 'chapter_name': 'Espaces vectoriels',
        'session_goal': 'Exercices 4 à 7', 'notes': '', 'revision': 1, 'legacy_key': None, 'legacy_date': None, 'deleted_at': None,
        'created_at': stamp, 'project_id': None, 'task_id': None, 'event_id': None,
    }


with Site() as site:
    # 1. The page is made of the greeting, the hero, three cards, progress and the CNC countdown.
    page, problems = site.workspace('desktop')
    page.wait_for_timeout(500)
    parts = page.evaluate("['.home-title', '.home-hero', '.home-today', '.home-next', '.home-hours', '.home-progress', '.home-cnc'].filter(s => !document.querySelector(s))")
    check('every block of the dashboard is present', not parts, parts)
    check('greeting uses the first name', text(page, '.home-title') == 'Bonjour, Yasmine', text(page, '.home-title'))
    check('the header is the greeting alone, in a small size', page.evaluate("!document.querySelector('.home-date, .home-summary, .home-onboarding, .studio-onboarding') && getComputedStyle(document.querySelector('.home-title')).fontSize === '22px'"))
    check('hero proposes the next chapter', text(page, '.home-hero-label') == 'À FAIRE MAINTENANT' and ' · ' in (text(page, '#homeHeroTitle') or ''), text(page, '#homeHeroTitle'))
    check('ring shows the planned duration', text(page, '.home-ring strong') == '25:00', text(page, '.home-ring strong'))
    check('old dashboard blocks are gone', page.evaluate("!document.querySelector('.dashboard-metrics, .dashboard-date-pager, .next-action, .dashboard-study-chart')"))
    check('weekly ranking sits under the dashboard', page.evaluate("!!document.querySelector('.home-extra > .weekly-xp-card')"))
    check('no errors on the dashboard', not problems, '; '.join(problems[:3]))

    # 2. Ticking a task updates the card and the summary.
    check('today card counts done tasks', text(page, '.home-count') == '1 / 3', text(page, '.home-count'))
    page.click('.home-task:not(.is-done) .home-check')
    page.wait_for_timeout(400)
    check('ticking a task updates the count', text(page, '.home-count') == '2 / 3', text(page, '.home-count'))

    # 3. Next event and study hours come from the workspace.
    check('next event is one of the planned ones', text(page, '.home-event strong') in ('Colle de physique', 'DS de mathématiques'), text(page, '.home-event strong'))
    week = page.evaluate("studyHours(dashboardPeriodDates('week').reduce((sum, d) => sum + focusMinutesOn(d), 0) * 60)")
    check('study hours match the recorded sessions', (text(page, '.home-hours-total strong') or '').replace(' ', ' ') == week and week != '0 h 00', f"{text(page, '.home-hours-total strong')} vs {week}")
    check('seven day bars, today highlighted', page.evaluate("document.querySelectorAll('.home-day').length === 7 && document.querySelectorAll('.home-day.is-today').length === 1"))
    check('progress lists at most four subjects', 1 <= page.evaluate("document.querySelectorAll('.home-progress-row').length") <= 4)

    # 4. Concours countdown: CNC by default, up to four concours, names and days left only.
    days = expected_cnc_days()
    card_text = lambda: ' '.join((text(page, '.home-cnc') or '').split())
    check('countdown uses the mid-May estimate by default', card_text() == f'CNC J-{days}', card_text())
    size = page.evaluate("(() => { const r = document.querySelector('.home-cnc').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
    page.click('.home-exam-settings')
    page.wait_for_timeout(200)
    check('settings list the seven concours', page.evaluate("document.querySelectorAll('#modalForm .home-exam-row').length") == 7)
    chosen = (dt.date.today() + dt.timedelta(days=100)).isoformat()
    page.fill('#modalForm input[name="date_CNC"]', chosen)
    for exam in ('CNAEM', 'X', 'MINES'):
        page.check(f'#modalForm input[name="follow_{exam}"]')
    check('a fifth concours cannot be ticked', page.evaluate("document.querySelector('#modalForm input[name=\\'follow_CCINP\\']').disabled"))
    page.click('#modalForm button[type="submit"]')
    page.wait_for_timeout(2500)
    names = page.evaluate("[...document.querySelectorAll('.home-exam-name')].map(n => n.textContent)")
    counts = page.evaluate("[...document.querySelectorAll('.home-exam-count')].map(n => n.textContent)")
    check('four concours shown, soonest first', names == ['CNC', 'X-ENS', 'Mines-Ponts', 'CNAEM'], names)
    check('the chosen CNC date is used', counts[:1] == ['J-100'], counts)
    check('only names and days left', card_text() == ' '.join(f'{n} {c}' for n, c in zip(names, counts)), card_text())
    check('chosen date is kept in the workspace', page.evaluate('PrepagoState.snapshot().cncExamDate') == chosen)
    saved = rpc_calls(page, 'save_student_state')
    check('chosen concours are saved to the account', any(c['args'].get('next_data', {}).get('examCountdown', {}).get('follow') == ['CNC', 'CNAEM', 'X', 'MINES'] for c in saved), f'{len(saved)} save(s)')
    after = page.evaluate("(() => { const r = document.querySelector('.home-cnc').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
    check('card keeps the same size', after == size, f'{size} -> {after}')
    check('countdown: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 5. "Démarrer la session" opens Concentration on that chapter and starts the timer.
    page, problems = site.workspace('desktop')
    page.wait_for_timeout(500)
    title = text(page, '#homeHeroTitle') or ''
    page.click('.home-hero-button')
    page.wait_for_timeout(1200)
    starts = [c for c in rpc_calls(page, 'study_action') if c['args'].get('p_action') == 'start']
    check('start button opens Concentration', page.evaluate('currentPage') == 'focus')
    check('start button starts one session', len(starts) == 1, f'{len(starts)} start(s)')
    payload = starts[0]['args'].get('p_payload', {}) if starts else {}
    subject = page.evaluate('id => state.subjects.find(s => s.id === id)?.name', payload.get('subjectId'))
    check('the session is on the proposed chapter', bool(subject) and title.startswith(subject) and bool(payload.get('chapterId')), f'{subject} / {title}')
    check('no errors when starting', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 6. A running session shows its remaining time and a way back to it.
    page, problems = site.workspace('desktop', sessions=qa.sample_sessions() + [live_session()])
    page.wait_for_timeout(600)
    check('running session is announced', text(page, '.home-hero-label') == 'SESSION EN COURS', text(page, '.home-hero-label'))
    check('running session shows subject and chapter', text(page, '#homeHeroTitle') == 'Mathématiques · Espaces vectoriels', text(page, '#homeHeroTitle'))
    first = text(page, '.home-ring strong')
    page.wait_for_timeout(2200)
    second = text(page, '.home-ring strong')
    check('remaining time counts down', bool(first) and first.startswith('39:') or first.startswith('40:'), first)
    check('remaining time keeps moving', first != second, f'{first} -> {second}')
    page.click('.home-hero-button')
    page.wait_for_timeout(400)
    check('"Reprendre la session" opens Concentration', page.evaluate('currentPage') == 'focus' and not [c for c in rpc_calls(page, 'study_action') if c['args'].get('p_action') == 'start'])
    check('no errors with a running session', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 7. First visit: nothing planned yet, the cards say what to add.
    page, problems = site.workspace('desktop', state={'tasks': [], 'events': [], 'focusSessions': [], 'xp': 0, 'profileName': 'Yasmine'}, sessions=[])
    page.wait_for_timeout(500)
    check('first visit offers to add a task and an event', page.is_visible('.home-today [data-task-new]') and page.is_visible('.home-next [data-dashboard-new-event]'))
    check('first visit still proposes something to study', text(page, '.home-hero-label') == 'À FAIRE MAINTENANT' and page.is_visible('.home-hero-button'))
    page.click('.home-next [data-dashboard-new-event]')
    page.wait_for_timeout(300)
    check('"Planifier un rendez-vous" opens the event form', page.evaluate("!document.querySelector('#modalBackdrop').hidden"))
    check('no errors on a first visit', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 8. Phone and tablet: same blocks, no sideways scrolling.
    for viewport in ('phone', 'tablet'):
        page, problems = site.workspace(viewport)
        page.wait_for_timeout(500)
        overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(f'{viewport}: no sideways scrolling', overflow <= 0, overflow)
        check(f'{viewport}: hero and CNC countdown are shown', page.is_visible('.home-hero-button') and page.evaluate("!!document.querySelector('.home-exam-count')?.offsetParent"))
        check(f'{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

    # 9. On a laptop window the whole dashboard fits one screen; the ranking starts below it.
    for name, size in (('1536x730', (1536, 730)), ('1366x650', (1366, 650)), ('1440x900', (1440, 900))):
        qa.VIEWPORTS[name] = {'width': size[0], 'height': size[1]}
        for label, extra in (('', {}), (' (first visit)', {'state': {'tasks': [], 'events': [], 'focusSessions': [], 'xp': 0, 'profileName': 'Yasmine'}, 'sessions': []})):
            page, problems = site.workspace(name, **extra)
            page.wait_for_timeout(600)
            fit = page.evaluate('''() => { const box = s => document.querySelector(s)?.getBoundingClientRect();
              return { bottom: Math.round(box('.home-screen').bottom), height: innerHeight, ranking: Math.round(box('.home-extra')?.top ?? 1e6),
                clipped: [...document.querySelectorAll('.home-card')].filter(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length }; }''')
            check(f'{name}{label}: dashboard fits one screen', fit['bottom'] <= fit['height'] and not fit['clipped'], fit)
            check(f'{name}{label}: ranking starts below the screen', fit['ranking'] >= fit['height'], fit)
            page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
