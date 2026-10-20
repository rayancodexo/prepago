"""Behaviour checks for the AI tutor (stand-in answers, no network). Run: python3 tests/qa/tutor.py [screenshot-dir]"""
import sys

import qa
from qa import Site

results = []
shots = sys.argv[1] if len(sys.argv) > 1 else None


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def shot(page, name):
    if shots:
        page.screenshot(path=f'{shots}/{name}.png')


def ask_first(page):
    page.click('[data-ai-live-open]')
    page.wait_for_selector('#aiLiveDialog[open]')
    form = '#aiLiveForm'
    subject = page.evaluate("[...document.querySelectorAll('#aiLiveForm select[name=subject] option')].map(o => o.value).filter(Boolean)")
    levels = ['sup', 'spe']
    chosen = None
    for level in levels:
        page.select_option(f'{form} select[name=level]', level)
        for value in subject:
            page.select_option(f'{form} select[name=subject]', value)
            chapters = page.evaluate("[...document.querySelectorAll('#aiLiveForm select[name=chapter] option')].map(o => o.value).filter(Boolean)")
            if chapters:
                page.select_option(f'{form} select[name=chapter]', chapters[0])
                chosen = (level, value, chapters[0])
                break
        if chosen:
            break
    page.check(f'{form} input[name=mode][value=explanation]', force=True)
    page.fill('#aiLiveQuestion', 'Un solide de masse m relié à un ressort de raideur k. Établir l’équation du mouvement.')
    page.check(f'{form} input[name=consent]')
    return chosen


with Site() as site:
    for viewport in ('desktop', 'phone'):
        # A student on Prepago AI+ gets the tutor.
        page, problems = site.workspace(viewport, tutor=True, plan='ai_plus')
        qa.goto_page(page, 'ai')
        page.wait_for_timeout(400)
        check(f'{viewport}: AI+ student sees the tutor button', page.is_visible('[data-ai-live-open]'))
        chosen = ask_first(page)
        check(f'{viewport}: a chapter can be chosen', chosen, chosen)
        shot(page, f'{viewport}-1-setup')
        page.click('#aiLiveForm [type=submit]')
        page.wait_for_selector('.ai-msg-tutor .katex', timeout=4000)
        check(f'{viewport}: the answer renders math with KaTeX', page.evaluate("document.querySelectorAll('.ai-msg-tutor .katex').length >= 2"))
        check(f'{viewport}: display formula is on its own line', page.evaluate("!!document.querySelector('.ai-msg-tutor .katex-display')"))
        check(f'{viewport}: bold and list formatting render', page.evaluate("!!document.querySelector('.ai-msg-tutor strong') && !!document.querySelector('.ai-msg-tutor li')"))
        check(f'{viewport}: no raw LaTeX left', page.evaluate("!document.querySelector('.ai-msg-tutor .ai-msg-body').textContent.includes('$$')"))
        check(f'{viewport}: context chip shows the chosen chapter', page.is_visible('.ai-tutor-context'))
        shot(page, f'{viewport}-2-answer')
        # Follow-up through a suggestion chip carries the conversation.
        page.click('[data-ai-follow="1"]')
        page.wait_for_function("document.querySelectorAll('.ai-msg-tutor').length === 2", timeout=4000)
        sent = page.evaluate("(window.__QA_CALLS || []).filter(c => c.fn && c.body && !c.body.action).map(c => c.body)")
        check(f'{viewport}: follow-up sends the previous exchange', len(sent) == 2 and len(sent[1].get('history') or []) == 2 and sent[1]['mode'] == 'hint', sent[-1] if sent else None)
        check(f'{viewport}: first question has no history', sent and not sent[0].get('history'), sent[0] if sent else None)
        check(f'{viewport}: four messages in the thread', page.evaluate("document.querySelectorAll('.ai-msg').length") == 4)
        shot(page, f'{viewport}-3-followup')
        page.click('[data-ai-reset]')
        check(f'{viewport}: "Nouvelle question" starts over', page.is_visible('#aiLiveQuestion'))
        check(f'{viewport}: no sideways scrolling', page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        check(f'{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

    # A free-month student (promo code, standard plan) does not get the tutor.
    page, problems = site.workspace('desktop', tutor=True)
    qa.goto_page(page, 'ai')
    page.wait_for_timeout(400)
    check('promo student does not see the tutor', not page.query_selector('[data-ai-live-open]'))
    check('promo student: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

    # A failure gives the student their text back and keeps their choices.
    page, problems = site.workspace('desktop', tutor=True, tutorFail=True, plan='ai_plus')
    qa.goto_page(page, 'ai')
    chosen = ask_first(page)
    page.click('#aiLiveForm [type=submit]')
    page.wait_for_function("document.querySelector('#aiLiveStatus')?.textContent.length > 0", timeout=4000)
    check('failure: message says the request is not counted', 'ne compte pas' in page.inner_text('#aiLiveStatus'))
    check('failure: the statement is kept', 'ressort' in page.input_value('#aiLiveQuestion'))
    check('failure: the chapter choice is kept', page.input_value('#aiLiveForm select[name=chapter]') == chosen[2], page.input_value('#aiLiveForm select[name=chapter]'))
    shot(page, 'desktop-4-failure')
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok or not detail else '  -> ' + detail[:200]))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
