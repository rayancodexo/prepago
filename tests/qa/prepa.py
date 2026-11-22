"""Checks for the prépa picker: search, pick from the list, "Ma prépa n'est pas dans la liste"
with a typed name, required at sign-up, sent with the account, editable in Mon compte.
Run: python3 tests/qa/prepa.py"""
import sys

from qa import Site, goto_page

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def signups(page):
    return page.evaluate("(window.__QA_CALLS || []).filter(c => c.auth === 'signUp')")


def fill_signup(page, email):
    page.fill('input[name="full_name"]', 'Test Prépa')
    page.select_option('select[name="filiere"]', 'PSI')
    page.fill('#authForm input[name="email"]', email)
    page.fill('#authForm input[name="password"]', 'motdepasse123')


with Site() as site:
    for viewport in ('desktop', 'phone'):
        # ---- Search and pick from the list ------------------------------------------------------
        page, problems = site.open('/#inscription', viewport, {'mode': 'signed-out'})
        check(f'{viewport}: picker is on the sign-up form', page.is_visible('#authForm .prepa-query'))
        full = page.locator('#authForm .prepa-list [data-prepa-pick]').count()
        check(f'{viewport}: full list shown before typing (+ not-listed option)', full > 25, full)
        page.fill('#authForm .prepa-query', 'tanger')
        names = page.locator('#authForm .prepa-list [data-prepa-pick]').all_inner_texts()
        check(f'{viewport}: search by city', names[:1] == ['Lycée Moulay El Hassan — Tanger'], names)
        check(f'{viewport}: not-listed option always last', names[-1:] == ['Ma prépa n’est pas dans la liste'], names)
        page.fill('#authForm .prepa-query', 'moulay hassan')
        check(f'{viewport}: search ignores accents and missing words',
              'Lycée Moulay El Hassan — Tanger' in page.locator('#authForm .prepa-list [data-prepa-pick]').all_inner_texts())
        page.fill('#authForm .prepa-query', 'zzzz')
        check(f'{viewport}: no match keeps the not-listed option',
              page.locator('#authForm .prepa-not-listed').count() == 1 and 'Aucune prépa' in page.inner_text('#authForm .prepa-list'))
        check(f'{viewport}: fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))

        # ---- Required at sign-up ----------------------------------------------------------------
        fill_signup(page, 'sans-prepa@example.invalid')
        page.fill('#authForm .prepa-query', '')
        page.click('#authSubmit')
        page.wait_for_timeout(400)
        check(f'{viewport}: sign-up without prépa is blocked', not signups(page))
        check(f'{viewport}: and says why', page.is_visible('#authForm .prepa-error'))

        # ---- Pick, then send --------------------------------------------------------------------
        page.fill('#authForm .prepa-query', 'oujda')
        page.locator('#authForm .prepa-list [data-prepa-pick]').first.click()
        check(f'{viewport}: chosen prépa shown', 'Oujda' in page.inner_text('#authForm .prepa-chosen'))
        page.click('#authSubmit')
        page.wait_for_timeout(500)
        sent = signups(page)
        check(f'{viewport}: prépa travels with the account',
              len(sent) == 1 and sent[0]['data'].get('prepa') == 'Lycée Omar Ibn Abdelaziz — Oujda', sent)
        check(f'{viewport}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

    # ---- Not in the list: type it -------------------------------------------------------------
    page, problems = site.open('/#inscription', 'desktop', {'mode': 'signed-out'})
    fill_signup(page, 'autre@example.invalid')
    page.locator('#authForm .prepa-not-listed').click()
    check('not-listed opens a text box', page.is_visible('#authForm .prepa-other-input'))
    page.click('#authSubmit')
    page.wait_for_timeout(300)
    check('empty typed name is refused', not signups(page) and page.is_visible('#authForm .prepa-error'))
    page.fill('#authForm .prepa-other-input', '  CPGE   Privée  Excellence — Casablanca ')
    page.click('#authSubmit')
    page.wait_for_timeout(500)
    sent = signups(page)
    check('typed prépa is sent, spaces tidied',
          len(sent) == 1 and sent[0]['data'].get('prepa') == 'CPGE Privée Excellence — Casablanca', sent)
    check('no errors (typed prépa)', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Login does not ask for it ------------------------------------------------------------
    page, problems = site.open('/#connexion', 'desktop', {'mode': 'signed-out'})
    page.fill('#authForm input[name="email"]', 'login@example.invalid')
    page.fill('#authForm input[name="password"]', 'motdepasse123')
    page.click('#authSubmit')
    page.wait_for_timeout(400)
    check('login is not blocked by the prépa field', not page.is_visible('#authForm .prepa-error'))
    page.context.close()

    # ---- Mon compte ---------------------------------------------------------------------------
    page, problems = site.workspace('desktop')
    goto_page(page, 'account')
    page.wait_for_timeout(300)
    check('Mon compte shows the picker', page.is_visible('#accountForm .prepa-query'))
    page.fill('#accountForm .prepa-query', 'rabat')
    page.locator('#accountForm .prepa-list [data-prepa-pick]').first.click()
    page.click('#accountForm button[type="submit"]')
    page.wait_for_timeout(500)
    saved = page.evaluate("window.PrepagoAccount.profile.prepa")
    check('Mon compte saves the prépa', saved and 'Rabat' in saved, saved)
    check('no errors (Mon compte)', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
