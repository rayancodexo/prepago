"""Checks for pseudonyms in the weekly classement: a student sets their own, an admin sets one for a
student's account by e-mail. Scores are never typed in. Run: python3 tests/qa/classement.py"""
import sys

from qa import Site, goto_page

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


with Site() as site:
    # ---- Student sets their own pseudonym ---------------------------------------------------------
    page, problems = site.workspace('desktop')
    goto_page(page, 'progress')
    page.wait_for_timeout(700)
    check('student sees "Apparaître sous un pseudo"', page.locator('[data-weekly-xp-alias-edit]').count() == 1)
    check('student does not see the admin tool', page.locator('[data-weekly-xp-admin-toggle]').count() == 0)
    page.locator('[data-weekly-xp-alias-edit]').click()
    page.wait_for_timeout(200)
    check('the pseudo field gets focus', page.evaluate('document.activeElement.id') == 'weeklyXpAlias')
    page.fill('#weeklyXpAlias', 'x')
    page.locator('[data-weekly-xp-alias-form] button[type=submit]').click()
    page.wait_for_timeout(300)
    check('a 1-letter pseudo is refused', 'Pseudo invalide' in (text(page, '.weekly-xp-alias') or ''))
    page.fill('#weeklyXpAlias', 'pris')
    page.locator('[data-weekly-xp-alias-form] button[type=submit]').click()
    page.wait_for_timeout(400)
    check('a taken pseudo is refused', 'déjà pris' in (text(page, '.weekly-xp-alias') or ''), text(page, '.weekly-xp-alias'))
    page.fill('#weeklyXpAlias', '  Newton   2027 ')
    page.press('#weeklyXpAlias', 'Enter')
    page.wait_for_timeout(500)
    check('the pseudo is sent cleaned up', page.evaluate('window.__QA_ALIAS') == 'Newton 2027', page.evaluate('window.__QA_ALIAS'))
    check('the student is told which pseudo is shown', 'Newton 2027' in (text(page, '.weekly-xp-alias') or ''))
    row = page.evaluate('[...document.querySelectorAll(".weekly-xp-self td")].map(td => td.innerText.trim())')
    check('their row shows the pseudo and hides the filière', len(row) == 4 and 'Newton 2027' in row[1] and row[2] == '—', row)
    page.locator('[data-weekly-xp-alias-edit]').click()
    page.wait_for_timeout(200)
    page.locator('[data-weekly-xp-alias-remove]').click()
    page.wait_for_timeout(500)
    check('"Retirer" removes the pseudo', page.evaluate('window.__QA_ALIAS') is None and 'Apparaître sous un pseudo' in (text(page, '.weekly-xp-alias') or ''))
    check('no errors (student)', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Admin sets one for a student ---------------------------------------------------------------
    page, problems = site.workspace('desktop', admin=True)
    goto_page(page, 'progress')
    page.wait_for_timeout(700)
    page.locator('[data-weekly-xp-admin-toggle]').click()
    page.wait_for_timeout(400)
    check('admin form opens with an empty list', 'Aucun pseudo' in (text(page, '.weekly-xp-admin') or ''))
    check('no score field anywhere', page.locator('.weekly-xp-admin input').count() == 2)
    page.fill('#weeklyXpAdminEmail', 'nobody')
    page.fill('#weeklyXpAdminAlias', 'Omar')
    page.evaluate('document.querySelector("#weeklyXpAdminEmail").type = "text"')
    page.locator('[data-weekly-xp-admin-form] button[type=submit]').click()
    page.wait_for_timeout(400)
    check('unknown account is reported', 'Aucun compte' in (text(page, '.weekly-xp-admin') or ''), text(page, '.weekly-xp-admin'))
    page.fill('#weeklyXpAdminEmail', 'omar@example.com')
    page.fill('#weeklyXpAdminAlias', 'Le Fantôme')
    page.locator('[data-weekly-xp-admin-form] button[type=submit]').click()
    page.wait_for_timeout(500)
    check('the pseudo is listed with the account', 'Le Fantôme' in (text(page, '.weekly-xp-admin-list') or '') and 'omar@example.com' in (text(page, '.weekly-xp-admin-list') or ''))
    page.locator('[data-weekly-xp-admin-remove]').click()
    page.wait_for_timeout(500)
    check('admin can remove it', 'Aucun pseudo' in (text(page, '.weekly-xp-admin') or ''))
    check('no errors (admin)', not problems, '; '.join(problems[:3]))
    page.context.close()

    page, problems = site.workspace('phone')
    goto_page(page, 'progress')
    page.wait_for_timeout(600)
    page.locator('[data-weekly-xp-alias-edit]').click()
    page.wait_for_timeout(200)
    check('phone: fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    check('no errors (phone)', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
