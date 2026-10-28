"""Checks for Mode Épreuve: picking a paper, full-screen exam with clock and pauses, grading
with a barème or a new one, copy photos, time running out, Mes épreuves and the free plan.
Run: python3 tests/qa/epreuve.py"""
import base64
import datetime as dt
import sys

import qa
from qa import Site, goto_page

results = []
A = '11111111-1111-4111-8111-111111111111'
P1 = {'id': 'aaaaaaaa-0000-4000-8000-000000000001', 'filiere': 'MP', 'subject': 'Mathématiques I', 'year': 2024, 'subject_path': 'aaaaaaaa-0000-4000-8000-000000000001/x.pdf', 'duration_minutes': 240, 'published': True, 'archived': False}
P2 = {'id': 'aaaaaaaa-0000-4000-8000-000000000002', 'filiere': 'MP', 'subject': 'Physique I', 'year': 2023, 'subject_path': 'aaaaaaaa-0000-4000-8000-000000000002/x.pdf', 'duration_minutes': None, 'published': True, 'archived': False}
P3 = {'id': 'aaaaaaaa-0000-4000-8000-000000000003', 'filiere': 'ECS', 'subject': 'Mathématiques', 'year': 2022, 'subject_path': 'aaaaaaaa-0000-4000-8000-000000000003/x.pdf', 'duration_minutes': None, 'published': True, 'archived': False}
BAREME = {'id': 'bbbbbbbb-0000-4000-8000-000000000001', 'paper_id': P1['id'], 'status': 'approved', 'author_user_id': None, 'created_at': '2026-10-01T10:00:00Z',
          'questions': [{'number': '1', 'label': 'Partie I', 'max_points': 4, 'chapter': 'Séries entières'}, {'number': '2', 'label': 'Partie II', 'max_points': 6, 'chapter': 'Intégrales'}, {'number': '3', 'label': None, 'max_points': 10, 'chapter': 'Réduction'}]}
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
db = lambda page, name: page.evaluate('n => JSON.parse(localStorage.getItem("__qa_db"))[n]', name)


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def finish(page):
    page.once('dialog', lambda d: d.accept())
    page.locator('.epreuve-focus [data-epreuve-finish]').click()
    page.wait_for_timeout(500)


with Site() as site:
    page, problems = site.workspace('desktop', exams=[P1, P2, P3], baremes=[BAREME])
    goto_page(page, 'epreuve')
    page.wait_for_timeout(700)
    look = page.evaluate("(() => ({title: getComputedStyle(document.querySelector('#page h1')).fontSize, nav: !!document.querySelector('.nav-item[data-page=epreuve][aria-current=page]')}))()")
    check('Épreuve opens from the sidebar with a 22px title', look['title'] == '22px' and look['nav'], look)
    rows = page.locator('[data-epreuve-paper]')
    check('papers of the student’s filière are listed', rows.count() == 2 and 'barème disponible' in (rows.first.inner_text()), [rows.count(), text(page, '.epreuve-papers')])
    page.evaluate('() => { const el = document.querySelector("[data-epreuve-filter=filiere]"); el.value = ""; el.dispatchEvent(new Event("change", {bubbles: true})); }')
    page.wait_for_timeout(300)
    page.evaluate('() => { const el = document.querySelector("[data-epreuve-filter=contest]"); el.value = "CNAEM"; el.dispatchEvent(new Event("change", {bubbles: true})); }')
    page.wait_for_timeout(300)
    check('concours filter keeps only CNAEM papers', page.locator('[data-epreuve-paper]').count() == 1 and 'ECS' in text(page, '.epreuve-papers'), text(page, '.epreuve-papers'))
    page.evaluate('() => { const el = document.querySelector("[data-epreuve-filter=contest]"); el.value = ""; el.dispatchEvent(new Event("change", {bubbles: true})); }')
    page.wait_for_timeout(300)

    # ---- Paper with an approved barème -------------------------------------------------------
    page.locator(f'[data-epreuve-paper="{P1["id"]}"]').click()
    page.wait_for_timeout(300)
    check('official duration is preselected', page.locator('[data-epreuve-minutes="240"][aria-pressed=true]').count() == 1, text(page, '.epreuve-durations'))
    page.locator('[data-epreuve-minutes="180"]').click()
    page.wait_for_timeout(200)
    page.locator('[data-epreuve-start]').click()
    page.wait_for_timeout(800)
    check('exam opens full screen with the paper', page.locator('.epreuve-focus').is_visible() and page.locator('.epreuve-focus iframe').count() == 1)
    clock = text(page, '#epreuveClock') or ''
    check('big countdown starts at 3 hours', clock in ('3:00:00', '2:59:59', '2:59:58'), clock)
    check('the running exam is kept in case of reload', page.evaluate(f'!!localStorage.getItem("prepago-epreuve-run-{A}")'))
    page.locator('.epreuve-focus-actions [data-epreuve-pause]').click()
    page.wait_for_timeout(300)
    check('pause hides the paper', page.locator('.epreuve-paused').is_visible() and not page.locator('#epreuvePaper').is_visible())
    page.locator('.epreuve-paused [data-epreuve-pause]').click()
    page.wait_for_timeout(300)
    page.locator('.epreuve-focus-actions [data-epreuve-pause]').click()
    page.wait_for_timeout(200)
    page.locator('.epreuve-focus-actions [data-epreuve-pause]').click()
    page.wait_for_timeout(200)
    has_leave_guard = page.evaluate('(() => { const e = new Event("beforeunload", {cancelable: true}); window.dispatchEvent(e); return e.defaultPrevented; })()')
    check('leaving the page during the exam is warned', has_leave_guard)
    finish(page)
    check('finishing leaves full screen for the grading grid', page.locator('.epreuve-focus').count() == 0 and page.locator('.epreuve-score-row').count() == 3)
    check('pauses are counted', '2 pauses' in (text(page, '.epreuve-done') or ''), text(page, '.epreuve-done'))
    inputs = page.locator('[data-epreuve-points]')
    inputs.nth(0).fill('1')
    inputs.nth(1).fill('6')
    inputs.nth(2).fill('7')
    page.wait_for_timeout(300)
    check('total out of 20 follows the barème', (text(page, '#epreuveTotal') or '').startswith('14') and '14 / 20 points' in (text(page, '#epreuveRaw') or ''), [text(page, '#epreuveTotal'), text(page, '#epreuveRaw')])
    page.locator('#epreuvePhotos').set_input_files([{'name': 'copie-1.png', 'mimeType': 'image/png', 'buffer': PNG}, {'name': 'copie-2.png', 'mimeType': 'image/png', 'buffer': PNG}])
    page.locator('[data-epreuve-save]').click()
    page.wait_for_timeout(900)
    saved = db(page, 'exam_attempts')
    att = saved[0] if saved else {}
    check('attempt saved with duration, pauses, scores and total', len(saved) == 1 and att['duration_seconds'] == 10800 and att['pauses'] == 2 and att['total_20'] == 14 and att['bareme_id'] == BAREME['id'] and [s['points'] for s in att['scores']] == [1, 6, 7] and att['grading_method'] == 'self', att)
    uploads = page.evaluate('window.__QA_UPLOADS || []')
    check('copy photos stored in the student’s folder and linked', len(uploads) == 2 and all(u['bucket'] == 'exam-copies' and u['path'].startswith(f'{A}/{att.get("id")}/') and u['path'].endswith('.png') for u in uploads) and len(att.get('copy_photos') or []) == 2, [uploads, att.get('copy_photos')])
    check('Mes épreuves opens after saving', page.locator('[data-epreuve-tab=history][aria-selected=true]').count() == 1 and '14 / 20' in (text(page, '.epreuve-history') or ''))
    check('score chart with a legend', page.locator('.epreuve-chart-svg .epreuve-dot').count() == 1 and 'Mathématiques' in (text(page, '.epreuve-legend') or ''))
    weak = text(page, '.epreuve-weak') or ''
    check('weakest chapter and question listed', 'Séries entières' in weak and 'Question 1' in weak, weak)

    # ---- Paper without a barème: the student creates one --------------------------------------
    page.locator('[data-epreuve-tab=new]').click()
    page.wait_for_timeout(300)
    page.locator(f'[data-epreuve-paper="{P2["id"]}"]').click()
    page.wait_for_timeout(300)
    check('unknown official duration falls back to 4 h', page.locator('[data-epreuve-minutes="240"][aria-pressed=true]').count() == 1 and 'non renseignée' in (text(page, '.epreuve-setup') or ''))
    page.locator('[data-epreuve-start]').click()
    page.wait_for_timeout(600)
    finish(page)
    check('no barème: the student is offered to create one', 'Pas encore de barème' in (text(page, '.epreuve-bareme') or ''))
    page.locator('[data-epreuve-bareme-make] [name=count]').fill('4')
    page.locator('[data-epreuve-bareme-make] [name=points]').fill('5')
    page.locator('[data-epreuve-bareme-make] [type=submit]').click()
    page.wait_for_timeout(300)
    check('a grid of 4 questions × 5 points is generated', page.locator('[data-bareme-row]').count() == 4)
    page.locator('[data-bareme-row] [name=chapter]').nth(0).fill('Mécanique')
    page.locator('[data-epreuve-bareme-save]').click()
    page.wait_for_timeout(600)
    mine = [b for b in db(page, 'exam_baremes') if b['paper_id'] == P2['id']]
    check('new barème saved as pending for review', len(mine) == 1 and mine[0]['status'] == 'pending' and len(mine[0]['questions']) == 4 and mine[0]['questions'][0]['chapter'] == 'Mécanique', mine)
    check('the student grades right away with it', page.locator('.epreuve-score-row').count() == 4 and 'en attente de validation' in (text(page, '.epreuve-grid') or ''))
    for i, v in enumerate(['5', '2', '3', '0']):
        page.locator('[data-epreuve-points]').nth(i).fill(v)
    page.locator('[data-epreuve-save]').click()
    page.wait_for_timeout(700)
    check('second attempt saved at 10/20', [a['total_20'] for a in db(page, 'exam_attempts')] == [14, 10], [a['total_20'] for a in db(page, 'exam_attempts')])
    check('chart now has two subjects', page.locator('.epreuve-legend span').count() == 2, text(page, '.epreuve-legend'))

    # ---- Time running out, after a reload -----------------------------------------------------
    page.locator('[data-epreuve-tab=new]').click()
    page.wait_for_timeout(300)
    page.locator(f'[data-epreuve-paper="{P1["id"]}"]').click()
    page.locator('[data-epreuve-start]').click()
    page.wait_for_timeout(500)
    page.evaluate(f'''(() => {{ const k = "prepago-epreuve-run-{A}", r = JSON.parse(localStorage.getItem(k)); r.startedAt = Date.now() - r.durationSeconds * 1000 + 2000; localStorage.setItem(k, JSON.stringify(r)); }})()''')
    page.once('dialog', lambda d: d.accept())
    page.reload(wait_until='load')
    page.wait_for_timeout(1500)
    goto_page(page, 'epreuve')
    page.wait_for_timeout(600)
    check('after a reload the exam can be resumed', page.locator('.epreuve-resume [data-epreuve-resume]').count() == 1, text(page, '#page'))
    page.locator('.epreuve-resume [data-epreuve-resume]').click()
    page.wait_for_function("document.querySelector('.epreuve-score-row')", timeout=6000)
    check('when time runs out the exam closes for grading', page.locator('.epreuve-focus').count() == 0 and (text(page, '.epreuve-done') or '').startswith('CNC MP'))
    check('no errors in Mode Épreuve', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Free plan: timer only, no chart --------------------------------------------------------
    old = [{'id': 'e1', 'user_id': A, 'paper_id': P1['id'], 'bareme_id': None, 'duration_seconds': 14400, 'used_seconds': 13000, 'pauses': 0, 'scores': [], 'total_20': 12, 'copy_photos': None, 'created_at': '2026-10-20T10:00:00Z'}]
    page, problems = site.workspace('phone', exams=[P1, P2], examAttempts=old)
    page.evaluate("window.PrepagoPlans.setOverride('free')")
    goto_page(page, 'epreuve')
    page.wait_for_timeout(700)
    page.locator('[data-epreuve-tab=history]').click()
    page.wait_for_timeout(300)
    check('free plan: history list without chart, with an upgrade card', page.locator('.epreuve-chart').count() == 0 and page.locator('.upgrade-card').count() == 1 and '12 / 20' in (text(page, '.epreuve-history') or ''))
    overflow = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check('phone: no sideways scrolling', overflow <= 0, overflow)
    page.locator('[data-epreuve-tab=new]').click()
    page.locator(f'[data-epreuve-paper="{P1["id"]}"]').click()
    page.locator('[data-epreuve-start]').click()
    page.wait_for_timeout(600)
    check('free plan: the timed exam still works', page.locator('.epreuve-focus').is_visible())
    bar = page.evaluate("(() => { const b = document.querySelector('.epreuve-focus-bar').getBoundingClientRect(); return b.width <= window.innerWidth; })()")
    check('phone: exam bar fits the screen', bar)
    check('no errors on phone', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
