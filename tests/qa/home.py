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
    # 1. The page is made of the hero, three cards, progress and the CNC countdown.
    page, problems = site.workspace('desktop')
    page.wait_for_timeout(500)
    parts = page.evaluate("['.home-head', '.home-hero', '.home-today', '.home-next', '.home-hours', '.home-progress', '.home-cnc'].filter(s => !document.querySelector(s))")
    check('every block of the dashboard is present', not parts, parts)
    check('greeting uses the first name', text(page, '.home-title') == 'Bonjour, Yasmine', text(page, '.home-title'))
    check('date line shows today', text(page, '.home-date') == page.evaluate('formatDate()'), text(page, '.home-date'))
    check('summary counts the open tasks', (text(page, '.home-summary') or '').startswith('2 tâches restantes'), text(page, '.home-summary'))
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
    check('ticking a task updates the summary', (text(page, '.home-summary') or '').startswith('1 tâche restante'), text(page, '.home-summary'))

    # 3. Next event and study hours come from the workspace.
    check('next event is one of the planned ones', text(page, '.home-event strong') in ('Colle de physique', 'DS de mathématiques'), text(page, '.home-event strong'))
    week = page.evaluate("studyHours(dashboardPeriodDates('week').reduce((sum, d) => sum + focusMinutesOn(d), 0) * 60)")
    check('study hours match the recorded sessions', (text(page, '.home-hours-total strong') or '').replace(' ', ' ') == week and week != '0 h 00', f"{text(page, '.home-hours-total strong')} vs {week}")
    check('seven day bars, today highlighted', page.evaluate("document.querySelectorAll('.home-day').length === 7 && document.querySelectorAll('.home-day.is-today').length === 1"))
    check('progress lists at most four subjects', 1 <= page.evaluate("document.querySelectorAll('.home-progress-row').length") <= 4)

    # 4. CNC countdown: estimated date by default, then the date the student sets.
    days = expected_cnc_days()
    check('countdown uses the mid-May estimate by default', text(page, '.home-cnc-count') == f'J-{days}' and 'Date estimée' in (text(page, '.home-cnc-note') or ''), f"{text(page, '.home-cnc-count')} / J-{days}")
    page.click('[data-home-cnc-date]')
    page.wait_for_timeout(200)
    chosen = (dt.date.today() + dt.timedelta(days=100)).isoformat()
    page.fill('#modalForm input[name="cncExamDate"]', chosen)
    page.click('#modalForm button[type="submit"]')
    page.wait_for_timeout(2500)
    check('countdown follows the chosen date', text(page, '.home-cnc-count') == 'J-100' and 'Date estimée' not in (text(page, '.home-cnc-note') or ''), text(page, '.home-cnc-count'))
    check('chosen date is kept in the workspace', page.evaluate('PrepagoState.snapshot().cncExamDate') == chosen)
    saved = rpc_calls(page, 'save_student_state')
    check('chosen date is saved to the account', any(c['args'].get('next_data', {}).get('cncExamDate') == chosen for c in saved), f'{len(saved)} save(s)')
    page.click('.home-cnc-link')
    page.wait_for_timeout(300)
    check('"Ouvrir les annales" opens the CNC page', page.evaluate('currentPage') == 'cnc', page.evaluate('currentPage'))
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

    # 7. First visit: nothing planned yet, the dashboard still guides.
    page, problems = site.workspace('desktop', state={'tasks': [], 'events': [], 'focusSessions': [], 'xp': 0, 'profileName': 'Yasmine'}, sessions=[])
    page.wait_for_timeout(500)
    check('first visit shows the first-steps list', page.is_visible('.home-onboarding'))
    check('first visit offers to add a task and an event', page.is_visible('.home-today [data-task-new]') and page.is_visible('.home-next [data-dashboard-new-event]'))
    check('first visit summary is calm', text(page, '.home-summary') == 'Aucune tâche prévue aujourd’hui', text(page, '.home-summary'))
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
        check(f'{viewport}: hero and CNC countdown are shown', page.is_visible('.home-hero-button') and page.evaluate("!!document.querySelector('.home-cnc-count')?.offsetParent"))
        check(f'{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
