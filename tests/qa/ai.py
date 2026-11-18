"""Checks for the Prepago AI start screen: chat-first page, question sent with mode, subject and
chapter, answer shown in the thread, daily counter, guided example still reachable, AI+ gate kept.
Run: python3 tests/qa/ai.py"""
import sys

from qa import Site, goto_page

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def pick_first(page, selector):
    page.evaluate('''s => { const el = document.querySelector(s); const opt = [...el.options].find(o => o.value);
        el.value = opt.value; el.dispatchEvent(new Event("change", {bubbles: true})); }''', selector)
    page.wait_for_timeout(250)


with Site() as site:
    # ---- Tutor not switched on yet --------------------------------------------------------------
    page, problems = site.workspace('desktop', plan='ai_plus')
    goto_page(page, 'ai')
    page.wait_for_timeout(500)
    check('start screen is the first thing shown', 'Sur quoi tu bloques' in (text(page, '#page') or ''), text(page, '#page'))
    check('four suggestions are shown', page.locator('[data-ai-suggest]').count() == 4)
    check('tutor-off note is shown', page.locator('.ai-start-note').count() == 1, text(page, '.ai-start-note'))
    page.locator('[data-ai-suggest="cours"]').click()
    page.wait_for_timeout(200)
    check('a suggestion fills the box and picks a mode', 'questions de cours' in page.input_value('#aiAskText')
          and page.get_attribute('[data-ai-ask-mode="explanation"]', 'aria-pressed') == 'true')
    pick_first(page, '#aiAskSubject')
    pick_first(page, '#aiAskChapter')
    page.check('#aiAskConsent')
    page.locator('.ai-ask-send').click()
    page.wait_for_timeout(300)
    check('tutor off: nothing is sent and the student is told', 'pas été envoyée' in (text(page, '#aiAskStatus') or ''), text(page, '#aiAskStatus'))
    check('tutor off: no question request reached the server',
          not page.evaluate('window.__QA_CALLS.filter(c => c.fn && c.body && c.body.question).length'))
    page.locator('.ai-start-links [data-ai-demo]').click()
    page.wait_for_timeout(300)
    check('"Voir l’exemple guidé" opens the guided exercise', 'Travaillons cet exercice ensemble' in (text(page, '#page') or ''))
    page.locator('[data-ai-ask-reset]').first.click()
    page.wait_for_timeout(300)
    check('"Poser une question" comes back to the start screen', 'Sur quoi tu bloques' in (text(page, '#page') or ''))
    check('no errors (tutor off)', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Tutor on: ask a question ---------------------------------------------------------------
    page, problems = site.workspace('desktop', plan='ai_plus', aiEnabled=True)
    goto_page(page, 'ai')
    page.wait_for_timeout(600)
    check('daily counter shows questions used', '2 / 10' in (text(page, '.ai-start-usage') or ''), text(page, '.ai-start-usage'))
    page.fill('#aiAskText', 'court')
    page.locator('.ai-ask-send').click()
    page.wait_for_timeout(200)
    check('too-short question is refused', '10 caractères' in (text(page, '#aiAskStatus') or ''))
    page.fill('#aiAskText', 'Je ne sais pas comment établir l’équation du ressort.')
    page.locator('.ai-ask-send').click()
    page.wait_for_timeout(200)
    check('subject and chapter are required', 'matière et le chapitre' in (text(page, '#aiAskStatus') or ''), text(page, '#aiAskStatus'))
    pick_first(page, '#aiAskSubject')
    pick_first(page, '#aiAskChapter')
    page.locator('[data-ai-ask-mode="correction"]').click()
    page.wait_for_timeout(200)
    page.locator('.ai-ask-send').click()
    page.wait_for_timeout(200)
    check('consent is required the first time', 'Coche la case' in (text(page, '#aiAskStatus') or ''))
    page.check('#aiAskConsent')
    page.press('#aiAskText', 'Enter')
    page.wait_for_timeout(700)
    sent = page.evaluate('window.__QA_CALLS.filter(c => c.fn && c.body && c.body.question).map(c => c.body)')
    body = sent[0] if sent else {}
    check('Enter sends one question', len(sent) == 1, sent)
    check('the request carries mode, level, subject and chapter',
          body.get('mode') == 'correction' and body.get('level') in ('sup', 'spe') and body.get('subject') and body.get('chapter') and body.get('request_id'), body)
    check('the question and the answer appear in the thread',
          page.locator('.ai-chat-me').count() == 1 and 'bilan des forces' in (text(page, '.ai-chat-ai') or ''))
    check('the official programme link is shown', page.locator('.ai-chat-ai a[href^="https://www.cpge.ac.ma/"]').count() == 1)
    check('the counter updates after the answer', '3 / 10' in (text(page, '.ai-start-usage') or ''), text(page, '.ai-start-usage'))
    check('the question is listed under Récents', 'ressort' in (text(page, '.ai-start-recent') or ''))
    check('consent is not asked again', page.locator('#aiAskConsent').count() == 0)
    check('no errors (tutor on)', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Phone ----------------------------------------------------------------------------------
    page, problems = site.workspace('phone', plan='ai_plus')
    goto_page(page, 'ai')
    page.wait_for_timeout(500)
    check('phone: start screen fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
          page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]'))
    check('phone: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Standard plan keeps the AI+ gate -------------------------------------------------------
    page, problems = site.workspace('desktop')
    goto_page(page, 'ai')
    page.wait_for_timeout(400)
    check('standard plan still sees the AI+ gate', 'Réservé à Prepago AI+' in (text(page, '#page') or ''))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
