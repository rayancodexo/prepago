"""Local QA harness for the Prepago static site.

Serves dist/ on localhost, swaps the Supabase SDK for tests/qa/supabase-stub.js,
blocks every other network request, and reports missing files and script errors.

    python3 tests/qa/qa.py check            # load every screen, fail on any error
    python3 tests/qa/qa.py shots OUT_DIR    # same, and save screenshots

Needs Python Playwright with a Chromium build.
"""
import datetime as dt
import functools
import http.server
import json
import os
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DIST = os.environ.get('PREPAGO_DIST') or os.path.join(ROOT, 'dist')
STUB = open(os.path.join(HERE, 'supabase-stub.js'), encoding='utf-8').read()

VIEWPORTS = {
    'phone': {'width': 390, 'height': 844},
    'tablet': {'width': 820, 'height': 1180},
    'desktop': {'width': 1366, 'height': 900},
}
PAGES = ['overview', 'subjects', 'cnc', 'tasks', 'calendar', 'focus', 'progress', 'projects', 'account']


def sample_workspace():
    """A believable student workspace, dated relative to today."""
    today = dt.date.today()
    day = lambda n: (today + dt.timedelta(days=n)).isoformat()
    tasks = [
        {'id': 't1', 'title': 'Revoir les intégrales généralisées', 'date': day(0), 'time': '08:30', 'subject': 'Mathématiques', 'priority': 'high', 'minutes': 60, 'done': True, 'completedAt': day(0)},
        {'id': 't2', 'title': 'Exercices de mécanique du point', 'date': day(0), 'time': '14:00', 'subject': 'Physique', 'priority': 'medium', 'minutes': 45, 'done': False},
        {'id': 't3', 'title': 'Fiche de synthèse : thermodynamique', 'date': day(0), 'time': '', 'subject': 'Physique', 'priority': 'low', 'minutes': 30, 'done': False},
        {'id': 't4', 'title': 'Préparer la colle de maths', 'date': day(1), 'time': '18:00', 'subject': 'Mathématiques', 'priority': 'high', 'minutes': 90, 'done': False},
        {'id': 't5', 'title': 'Relire le cours de chimie organique', 'date': day(-1), 'time': '', 'subject': 'Chimie', 'priority': 'medium', 'minutes': 40, 'done': False},
    ]
    events = [
        {'id': 'e1', 'title': 'Colle de physique', 'date': day(0), 'time': '16:00', 'end': '17:00', 'color': '#0A5CFF', 'location': 'Salle B12'},
        {'id': 'e2', 'title': 'DS de mathématiques', 'date': day(3), 'time': '08:00', 'end': '12:00', 'color': '#0A5CFF'},
    ]
    return {'tasks': tasks, 'events': events, 'focusSessions': [], 'xp': 515, 'profileName': 'Yasmine El Idrissi'}


def sample_sessions():
    today = dt.date.today()
    monday = today - dt.timedelta(days=today.weekday())
    minutes = [95, 140, 70, 165, 110, 45, 20]
    rows = []
    for i, m in enumerate(minutes):
        d = monday + dt.timedelta(days=i)
        if d > today:
            break
        start = dt.datetime.combine(d, dt.time(9, 0))
        rows.append({
            'id': f'00000000-0000-4000-8000-0000000000{i:02d}', 'user_id': '11111111-1111-4111-8111-111111111111',
            'kind': 'work', 'status': 'completed', 'started_at': start.isoformat() + 'Z', 'ended_at': (start + dt.timedelta(minutes=m)).isoformat() + 'Z',
            'resumed_at': None, 'duration_seconds': m * 60, 'focus_duration': 10800, 'break_duration': 300, 'cycles': 1, 'cycle_index': 1,
            'segments': [{'date': d.isoformat(), 'seconds': m * 60}], 'subject_id': None, 'chapter_id': None,
            'subject_name': 'Mathématiques' if i % 2 == 0 else 'Physique', 'chapter_name': '', 'session_goal': '', 'notes': '',
            'revision': 1, 'legacy_key': None, 'legacy_date': None, 'deleted_at': None, 'created_at': start.isoformat() + 'Z',
            'project_id': None, 'task_id': None, 'event_id': None,
        })
    return rows


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class Site:
    """Context manager: local server + browser. Use .open() to get a page."""

    def __enter__(self):
        handler = functools.partial(Quiet, directory=DIST)
        socketserver.TCPServer.allow_reuse_address = True
        self.httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), handler)
        self.base = f'http://127.0.0.1:{self.httpd.server_address[1]}'
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch()
        return self

    def __exit__(self, *exc):
        self.browser.close()
        self.pw.stop()
        self.httpd.shutdown()

    def open(self, path='/', viewport='desktop', qa=None, wait=900):
        """Open `path` with the stub configured by `qa`. Returns (page, problems)."""
        ctx = self.browser.new_context(viewport=VIEWPORTS[viewport], is_mobile=(viewport == 'phone'), has_touch=(viewport == 'phone'), locale='fr-FR', reduced_motion='reduce')
        problems = []
        ctx.add_init_script('window.__QA=' + json.dumps(qa or {}) + ';')
        if (qa or {}).get('mode', 'active') not in ('signed-out',):
            # A returning student has a stored session; the loader in index.html looks for it.
            ctx.add_init_script("try{localStorage.setItem('sb-szrrrqqpmjourdbckojw-auth-token','{}')}catch(e){}")

        def route(r):
            url = r.request.url
            if not url.startswith(self.base):
                return r.abort()
            if '/vendor/supabase' in url:
                return r.fulfill(status=200, content_type='application/javascript', body=STUB)
            return r.continue_()

        ctx.route('**/*', route)
        page = ctx.new_page()
        page.on('response', lambda r: problems.append(f'{r.status} {r.url.replace(self.base, "")}') if r.url.startswith(self.base) and r.status >= 400 else None)
        page.on('pageerror', lambda e: problems.append('script error: ' + str(e)[:300]))
        page.on('console', lambda m: problems.append('console: ' + m.text[:300]) if m.type == 'error' and 'net::ERR' not in m.text else None)
        page.goto(self.base + path, wait_until='load')
        page.wait_for_timeout(wait)
        return page, problems

    def workspace(self, viewport='desktop', **qa):
        cfg = {'mode': 'active', 'state': sample_workspace(), 'sessions': sample_sessions()}
        cfg.update(qa)
        page, problems = self.open('/#dashboard', viewport, cfg, wait=1500)
        return page, problems


def goto_page(page, name):
    page.evaluate('n => navigate(n)', name)
    page.wait_for_timeout(500)


def run(out=None):
    failures = []
    with Site() as site:
        def record(label, page, problems, full=False):
            if problems:
                failures.append((label, problems[:6]))
            if out:
                # Settle fonts, images and focus so two runs of the same build give the same picture.
                page.evaluate('''async () => { await document.fonts.ready; await Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; })));
                    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }''')
                page.wait_for_timeout(250)
                page.screenshot(path=os.path.join(out, label + '.png'), full_page=full)
            page.context.close()

        for vp in ('desktop', 'phone'):
            for path, name in [('/', 'landing'), ('/tarifs/', 'tarifs'), ('/fonctionnalites/', 'fonctionnalites'), ('/methode/', 'methode'), ('/contact/', 'contact'),
                               ('/conditions/', 'conditions'), ('/confidentialite/', 'confidentialite'), ('/mentions-legales/', 'mentions')]:
                page, problems = site.open(path, vp, {'mode': 'signed-out'})
                record(f'{vp}_public_{name}', page, problems, full=True)
            for path, name in [('/#connexion', 'login'), ('/#inscription', 'signup')]:
                page, problems = site.open(path, vp, {'mode': 'signed-out'})
                record(f'{vp}_auth_{name}', page, problems)
            page, problems = site.open('/#connexion', vp, {'mode': 'inactive'}, wait=1500)
            record(f'{vp}_auth_activation', page, problems)
            for name in PAGES:
                page, problems = site.workspace(vp)
                if not page.evaluate('!document.body.classList.contains("auth-pending")'):
                    problems.append('workspace did not open')
                goto_page(page, name)
                record(f'{vp}_app_{name}', page, problems)
        for path in ['/verification/', '/nouveau-mot-de-passe/', '/mot-de-passe-oublie/', '/connexion/', '/inscription/', '/activation/']:
            page, problems = site.open(path, 'desktop', {'mode': 'signed-out'})
            if not page.url.startswith(site.base + '/?') and not page.url.startswith(site.base + '/#') and page.url != site.base + '/':
                problems.append('did not redirect into the app: ' + page.url)
            record('redirect' + path.replace('/', '_'), page, problems)
    return failures


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    out = None
    if cmd == 'shots':
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
    failures = run(out)
    for label, problems in failures:
        print('FAIL', label)
        for p in problems:
            print('   ', p)
    print(f'{len(failures)} screen(s) with problems')
    sys.exit(1 if failures else 0)
