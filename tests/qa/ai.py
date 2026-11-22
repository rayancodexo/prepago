"""Checks for the Prepago AI start screen: chat-first page, question sent with mode, subject and
chapter, answer shown in the thread, daily counter, guided example still reachable (admin), students see a coming-soon page.
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
    page, problems = site.workspace('desktop', plan='ai_plus', admin=True)
    goto_page(page, 'ai')
    page.wait_for_timeout(500)
    check('start screen is the first thing shown', 'Sur quoi tu bloques' in (text(page, '#page') or ''), text(page, '#page'))
    check('four suggestions are shown', page.locator('[data-ai-suggest]').count() == 4)
    check('no consent box and no activation banner', page.locator('#aiAskConsent, .ai-start-note').count() == 0)
    check('no year / subject / chapter pickers', page.locator('#aiAskLevel, #aiAskSubject, #aiAskChapter').count() == 0)
    page.locator('[data-ai-suggest="cours"]').click()
    page.wait_for_timeout(200)
    check('a suggestion fills the box and picks a mode', 'questions de cours' in page.input_value('#aiAskText')
          and page.get_attribute('[data-ai-ask-mode="explanation"]', 'aria-pressed') == 'true')
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
    page, problems = site.workspace('desktop', plan='ai_plus', aiEnabled=True, admin=True)
    goto_page(page, 'ai')
    page.wait_for_timeout(600)
    check('daily counter shows questions used', '2 / 10' in (text(page, '.ai-start-usage') or ''), text(page, '.ai-start-usage'))
    page.fill('#aiAskText', 'court')
    page.locator('.ai-ask-send').click()
    page.wait_for_timeout(200)
    check('too-short question is refused', '10 caractères' in (text(page, '#aiAskStatus') or ''))
    page.fill('#aiAskText', 'Je ne sais pas comment établir l’équation du ressort.')
    page.locator('[data-ai-ask-mode="correction"]').click()
    page.wait_for_timeout(200)
    page.press('#aiAskText', 'Enter')
    page.wait_for_timeout(700)
    sent = page.evaluate('window.__QA_CALLS.filter(c => c.fn && c.body && c.body.question).map(c => c.body)')
    body = sent[0] if sent else {}
    check('Enter sends one question', len(sent) == 1, sent)
    check('the request carries the question, mode and level',
          body.get('mode') == 'correction' and body.get('level') in ('sup', 'spe') and body.get('request_id'), body)
    check('the question and the answer appear in the thread',
          page.locator('.ai-chat-me').count() == 1 and 'bilan des forces' in (text(page, '.ai-chat-ai') or ''))
    check('the official programme link is shown', page.locator('.ai-chat-ai a[href^="https://www.cpge.ac.ma/"]').count() == 1)
    check('the counter updates after the answer', '3 / 10' in (text(page, '.ai-start-usage') or ''), text(page, '.ai-start-usage'))
    check('the question is listed under Récents', 'ressort' in (text(page, '.ai-start-recent') or ''))
    check('no errors (tutor on)', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Phone ----------------------------------------------------------------------------------
    page, problems = site.workspace('phone', plan='ai_plus', admin=True)
    goto_page(page, 'ai')
    page.wait_for_timeout(500)
    check('phone: start screen fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
          page.evaluate('[document.documentElement.scrollWidth, window.innerWidth]'))
    check('phone: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Students see "coming soon" (admins keep the workspace above) ---------------------------
    for plan, viewport in (('standard', 'desktop'), ('ai_plus', 'desktop'), ('ai_plus', 'phone')):
        page, problems = site.workspace(viewport, plan=plan)
        goto_page(page, 'ai')
        page.wait_for_timeout(400)
        body = text(page, '#page') or ''
        check(f'{plan}/{viewport}: coming-soon page shown', 'arrive bientôt' in body, body[:120])
        check(f'{plan}/{viewport}: no question box', page.locator('#aiAskText').count() == 0)
        check(f'{plan}/{viewport}: nav says Bientôt', 'Bientôt' in (text(page, '#mainNav [data-page="ai"]') or ''))
        check(f'{plan}/{viewport}: fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        check(f'{plan}/{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
