"""Checks for Colle: solo colle with timers and self-grading, no repeated question, question
submission, admin moderation, upgrade screen, and a duo colle on two phones.
Run: python3 tests/qa/colle.py"""
import datetime as dt
import sys

import qa
from qa import Site, goto_page

results = []
KEY = 'mp:sup:math:4e38fac7d8'
A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def question(i, status='approved', author=None, points=(4, 6, 4, 3, 3)):
    return {'id': f'00000000-0000-4000-8000-00000000000{i}', 'filiere': 'MPSI', 'subject': 'math', 'chapter': 'Nombres complexes', 'chapter_key': KEY,
            'type': 'exercice' if i % 2 else 'cours', 'statement': f'Question {i} : résoudre $z^{i + 1} = 1$ dans $\\mathbb{{C}}$.', 'difficulty': 2,
            'checklist': [{'label': f'Élément {k + 1} avec $e^{{i\\theta}}$', 'points': p} for k, p in enumerate(points)],
            'traps': [{'question': 'Que vaut $|z|$ ?', 'answer': 'Toujours $1$.'}, {'question': 'Combien de solutions ?', 'answer': 'Exactement $n$.'}],
            'status': status, 'author_user_id': author, 'created_at': '2026-10-01T10:00:00Z'}


QUESTIONS = [question(1), question(2), question(3), question(4, 'pending', 'someone-else')]
PAPER = {'id': 'aaaaaaaa-0000-4000-8000-000000000001', 'filiere': 'MP', 'subject': 'Mathématiques I', 'year': 2024, 'published': True, 'archived': False}
db = lambda page, name: page.evaluate('n => JSON.parse(localStorage.getItem("__qa_db"))[n]', name)


def pick_chapter(page):
    page.locator('#colleChapterSearch').fill('complexes')
    page.wait_for_timeout(200)
    page.locator('[data-colle-chapter]').first.click()
    page.wait_for_timeout(300)


def select(page, selector, value):
    page.evaluate('([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event("change", {bubbles: true})); }', [selector, value])
    page.wait_for_timeout(300)


with Site() as site:
    # ---- Solo colle ---------------------------------------------------------------------------
    page, problems = site.workspace('desktop', colleQuestions=QUESTIONS)
    goto_page(page, 'colle')
    page.wait_for_timeout(500)
    look = page.evaluate("(() => ({title: getComputedStyle(document.querySelector('#page h1')).fontSize, nav: !!document.querySelector('.nav-item[data-page=colle][aria-current=page]')}))()")
    check('Colle opens from the sidebar with a 22px title', look['title'] == '22px' and look['nav'], look)
    check('Épreuve is in the sidebar too', page.locator('.nav-item[data-page=epreuve]').count() == 1)
    check('old Colles et DS entry is gone', page.locator('.nav-item[data-page=grades]').count() == 0)
    page.locator('#colleChapterSearch').fill('complexes')
    page.wait_for_timeout(200)
    found = text(page, '#colleResults') or ''
    check('typing the course name finds the chapter and its questions', 'Réels et complexes' in found and '3 questions' in found and 'Nombres complexes' in found, found)
    page.locator('[data-colle-chapter]').first.click()
    page.wait_for_timeout(300)
    check('chosen chapter shows as a chip', 'Réels et complexes' in (text(page, '.colle-chip') or ''))
    select(page, '#collePrep', '3')
    select(page, '#collePass', '10')
    page.locator('[data-colle-start]').click()
    page.wait_for_timeout(800)
    check('preparation timer starts at 3 minutes', text(page, '.colle-phase') == 'PRÉPARATION' or 'Préparation' in (text(page, '.colle-timer') or ''), text(page, '.colle-timer'))
    clock = text(page, '#colleClock') or ''
    check('clock counts down from 03:00', clock in ('03:00', '02:59', '02:58'), clock)
    page.wait_for_function("document.querySelector('.colle-statement .katex')", timeout=5000)
    check('formulas are rendered with KaTeX', page.locator('.colle-statement .katex').count() > 0)
    check('checklist hidden during the colle', page.locator('.colle-check').count() == 0)
    first = page.evaluate('document.querySelector(".colle-statement").innerText')
    page.locator('[data-colle-skip]').click()
    page.wait_for_timeout(300)
    check('skipping goes to the 10-minute passage', 'Passage' in (text(page, '.colle-timer') or '') and (text(page, '#colleClock') or '') in ('10:00', '09:59'), text(page, '.colle-timer'))
    page.locator('[data-colle-reveal]').click()
    page.wait_for_timeout(500)
    check('correction shows what the colleur expects', page.locator('.colle-check').count() == 5, page.locator('.colle-check').count())
    page.locator('.colle-check input').nth(0).check()
    page.locator('.colle-check input').nth(1).check()
    page.wait_for_timeout(200)
    check('ticking items computes the score out of 20', (text(page, '#colleScore') or '').startswith('10'), text(page, '#colleScore'))
    check('trap answers start hidden', page.locator('.colle-trap-answer:not([hidden])').count() == 0)
    page.locator('[data-colle-trap]').first.click()
    page.wait_for_timeout(200)
    check('tapping reveals a trap answer', page.locator('.colle-trap-answer:not([hidden])').count() == 1)
    page.locator('[data-colle-save]').click()
    page.wait_for_timeout(600)
    saved = db(page, 'colle_attempts')
    check('attempt saved with mode, ticks, times and score', len(saved) == 1 and saved[0]['mode'] == 'solo' and saved[0]['checked_items'] == [0, 1] and saved[0]['score'] == 10 and saved[0]['grading_method'] == 'self', saved)
    check('result screen shows the score', '10' in (text(page, '.colle-result') or ''), text(page, '.colle-result'))
    page.locator('[data-colle-again]').click()
    page.wait_for_timeout(800)
    again = page.evaluate('document.querySelector(".colle-statement")?.innerText')
    check('next colle avoids the question just seen', again and again != first, [first, again])
    page.once('dialog', lambda d: d.accept())
    page.locator('[data-colle-quit]').click()
    page.wait_for_timeout(600)
    check('home shows this week’s colle', (text(page, '.colle-stats') or '').startswith('1'), text(page, '.colle-stats'))

    # ---- Submitting a question --------------------------------------------------------------
    page.locator('.colle-head-actions [data-colle-submit]').click()
    page.wait_for_timeout(400)
    select(page, '#cfChapter', KEY)
    page.locator('#cfStatement').fill('Calculer $(1+i)^{10}$.')
    page.wait_for_timeout(900)
    check('statement preview renders formulas', page.locator('#colleStatementPreview .katex').count() > 0)
    labels = page.locator('[name=checkLabel]')
    labels.nth(0).fill('Forme exponentielle de $1+i$')
    labels.nth(1).fill('Formule de Moivre')
    page.locator('#colleForm [type=submit]').click()
    page.wait_for_timeout(400)
    check('fewer than 3 expected items is refused', len([q for q in db(page, 'colle_questions') if q['author_user_id'] == A]) == 0 and page.locator('#colleForm').count() == 1)
    labels.nth(2).fill('Résultat $32i$')
    page.locator('[name=trapQuestion]').first.fill('Et $(1-i)^{10}$ ?')
    page.locator('[name=trapAnswer]').first.fill('$-32i$')
    page.locator('#colleForm [type=submit]').click()
    page.wait_for_timeout(600)
    mine = [q for q in db(page, 'colle_questions') if q['author_user_id'] == A]
    check('submission saved as pending with its checklist and trap', len(mine) == 1 and mine[0]['status'] == 'pending' and len(mine[0]['checklist']) == 3 and len(mine[0]['traps']) == 1 and mine[0]['chapter'] == 'Réels et complexes', mine)
    contrib = text(page, '.colle-contribute') or ''
    check('progress shows accepted questions out of 5', '0/5 questions acceptées' in contrib and '1 en attente' in contrib, contrib)
    check('no errors in solo colle', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Upgrade screen (free plan) -----------------------------------------------------------
    week = [{'id': f'w{i}', 'user_id': A, 'question_id': QUESTIONS[0]['id'], 'mode': 'solo', 'score': 12, 'checked_items': [], 'created_at': dt.datetime.now(dt.timezone.utc).isoformat()} for i in range(3)]
    page, problems = site.workspace('desktop', colleQuestions=QUESTIONS, colleAttempts=week)
    page.evaluate("window.PrepagoPlans.setOverride('free')")
    goto_page(page, 'colle')
    page.wait_for_timeout(500)
    pick_chapter(page)
    page.locator('[data-colle-start]').click()
    page.wait_for_timeout(400)
    card = text(page, '.upgrade-card') or ''
    check('free plan: 4th colle of the week shows the upgrade screen', '3 colles par semaine' in card and page.locator('.upgrade-card a[href="/tarifs/"]').count() == 1, card)
    page.locator('.upgrade-card [data-colle-home]').click()
    page.wait_for_timeout(300)
    page.locator('[data-colle-mode=duo]').click()
    page.wait_for_timeout(200)
    page.locator('[data-colle-start]').click()
    page.wait_for_timeout(300)
    check('free plan: duo shows the upgrade screen', 'mode duo' in (text(page, '.upgrade-card') or ''), text(page, '.upgrade-card'))
    check('no errors on the upgrade screen', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Moderation (admin) -------------------------------------------------------------------
    baremes = [{'id': 'bbbbbbbb-0000-4000-8000-000000000001', 'paper_id': PAPER['id'], 'questions': [{'number': '1', 'max_points': 4}, {'number': '2', 'max_points': 6}], 'status': 'pending', 'author_user_id': B, 'created_at': '2026-10-02T10:00:00Z'}]
    page, problems = site.workspace('desktop', admin=True, colleQuestions=QUESTIONS, baremes=baremes, exams=[PAPER])
    goto_page(page, 'colle')
    page.wait_for_timeout(700)
    check('admin sees Modération with the pending count', 'Modération (2)' in (text(page, '.colle-head-actions') or ''), text(page, '.colle-head-actions'))
    page.locator('[data-colle-moderation]').click()
    page.wait_for_timeout(600)
    check('pending question listed with its checklist', page.locator('.colle-mod-card').count() == 1 and page.locator('.colle-mod-card .katex').count() > 0)
    page.locator('[data-colle-mod-edit]').click()
    page.wait_for_timeout(400)
    page.locator('#cfStatement').fill('Question 4 corrigée : $z^5 = 1$.')
    page.locator('[data-colle-review=approved]').click()
    page.wait_for_timeout(700)
    q4 = next(q for q in db(page, 'colle_questions') if q['id'].endswith('4'))
    check('admin edits and accepts a question', q4['status'] == 'approved' and q4['statement'].startswith('Question 4 corrigée'), q4)
    page.locator('[data-colle-mod-tab=baremes]').click()
    page.wait_for_timeout(300)
    check('pending barème shown with its paper', 'Mathématiques I' in (text(page, '.colle-mod') or ''), text(page, '.colle-mod'))
    page.locator('[data-colle-mod-bareme$="|approved"]').click()
    page.wait_for_timeout(600)
    check('admin accepts a barème', db(page, 'exam_baremes')[0]['status'] == 'approved')
    check('no errors in moderation', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Duo: A is the colleur, B the étudiant, two phones ------------------------------------
    host, problems = site.workspace('phone', colleQuestions=QUESTIONS, duoCode='4821')
    guest = host.context.new_page()
    guest_problems = []
    guest.on('pageerror', lambda e: guest_problems.append('script error: ' + str(e)[:300]))
    guest.add_init_script('window.__QA = Object.assign(window.__QA || {}, {uid: "%s", name: "Mehdi Alaoui"});' % B)
    guest.goto(site.base + '/#dashboard', wait_until='load')
    guest.wait_for_timeout(1500)
    goto_page(host, 'colle')
    host.wait_for_timeout(500)
    pick_chapter(host)
    select(host, '#collePrep', '3')
    host.locator('[data-colle-mode=duo]').click()
    host.wait_for_timeout(200)
    host.locator('[data-colle-start]').click()
    host.wait_for_timeout(800)
    check('duo: colleur gets a 4-digit code', (text(host, '.colle-code strong') or '') == '4821', text(host, '.colle-code'))
    check('duo: colleur sees the checklist and the traps', host.locator('.colle-check').count() == 5 and host.locator('.colle-trap').count() == 2)
    goto_page(guest, 'colle')
    guest.wait_for_timeout(500)
    guest.locator('#colleCode').fill('4821')
    guest.locator('.colle-join [type=submit]').click()
    guest.wait_for_timeout(800)
    check('duo: étudiant waits for the colleur', 'Le colleur va lancer la colle' in (text(guest, '#page') or ''), text(guest, '#page'))
    host.wait_for_function("document.querySelector('.colle-code')?.innerText.includes('connecté')", timeout=6000)
    check('duo: colleur sees the étudiant join', True)
    host.locator('.colle-code [data-colle-drive=start]').click()
    guest.wait_for_function("document.querySelector('#colleClock')", timeout=6000)
    check('duo: étudiant sees the question and the timer', guest.locator('.colle-statement').count() == 1 and 'Préparation' in (text(guest, '.colle-timer') or ''), text(guest, '.colle-timer'))
    check('duo: étudiant does not see the checklist', guest.locator('.colle-check, .colle-trap').count() == 0)
    host.locator('[data-colle-drive=pass]').click()
    guest.wait_for_function("document.querySelector('.colle-timer')?.innerText.includes('Passage')", timeout=6000)
    check('duo: phases follow on the étudiant phone', True)
    host.locator('.colle-check input').nth(0).check()
    host.locator('.colle-check input').nth(2).check()
    host.locator('.colle-check input').nth(4).check()
    host.wait_for_timeout(600)
    host.locator('[data-colle-drive=review]').click()
    host.wait_for_timeout(600)
    guest.wait_for_function("document.querySelector('#page')?.innerText.includes('Le colleur note ta colle')", timeout=6000)
    check('duo: étudiant waits while the colleur grades', True)
    host.locator('[data-colle-finish]').click()
    host.wait_for_timeout(800)
    check('duo: colleur sees the final score', '11' in (text(host, '.colle-result') or ''), text(host, '.colle-result'))
    guest.wait_for_function("document.querySelector('.colle-result')?.innerText.includes('Ta note')", timeout=6000)
    check('duo: étudiant sees the same score', '11' in (text(guest, '.colle-result') or ''), text(guest, '.colle-result'))
    duo = [a for a in db(guest, 'colle_attempts') if a['mode'] == 'duo']
    check('duo: attempt saved for the étudiant', len(duo) == 1 and duo[0]['user_id'] == B and duo[0]['score'] == 11 and duo[0]['checked_items'] == [0, 2, 4], duo)
    overflow = host.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check('duo on phone: no sideways scrolling', overflow <= 0, overflow)
    check('no errors in duo colle', not problems and not guest_problems, '; '.join((problems + guest_problems)[:3]))
    host.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
