"""Checks for the Concours filter bar and for Mode Épreuve being hidden.
Run: python3 tests/qa/concours.py"""
import sys

from qa import Site, goto_page

results = []


def paper(n, filiere, subject, year, correction=False):
    p = {'id': f'aaaaaaaa-0000-4000-8000-00000000000{n}', 'filiere': filiere, 'subject': subject, 'year': year,
         'subject_path': f'aaaaaaaa-0000-4000-8000-00000000000{n}/x.pdf', 'published': True, 'archived': False}
    if correction:
        p['correction_path'] = f'aaaaaaaa-0000-4000-8000-00000000000{n}/c.pdf'
    return p


EXAMS = [paper(1, 'MP', 'Mathématiques I', 2024, True), paper(2, 'MP', 'Physique I', 2023), paper(3, 'PSI', 'Physique', 2024),
         paper(4, 'ECS', 'Mathématiques', 2022), {**paper(5, 'PSI', 'Chimie', 2021), 'published': False}]


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def choose(page, key, value):
    page.select_option(f'[data-cnc-filter="{key}"]', value)
    page.wait_for_timeout(250)


def rows(page):
    return page.evaluate('[...document.querySelectorAll(".cnc-result-row strong")].map(n => n.innerText)')


with Site() as site:
    page, problems = site.workspace('desktop', exams=EXAMS)
    goto_page(page, 'cnc')
    page.wait_for_timeout(600)
    check('filter bar has Concours, Filière, Matière, Année',
          page.evaluate('[...document.querySelectorAll(".cnc-filter > span:first-child")].map(n => n.innerText).join(",")') == 'Concours,Filière,Matière,Année')
    check('filter bar sits above the filière cards',
          page.evaluate('!!document.querySelector(".cnc-filters") && !!(document.querySelector(".cnc-filters").compareDocumentPosition(document.querySelector(".filiere-grid")) & Node.DOCUMENT_POSITION_FOLLOWING)'))
    check('no filter: the cards are shown, no list', page.locator('.filiere-grid .choice-card').count() >= 4 and page.locator('.cnc-results').count() == 0)

    choose(page, 'filiere', 'MP')
    check('Filière MP lists its 2 published sujets, newest first', rows(page) == ['Mathématiques I', 'Physique I'], rows(page))
    check('a filter replaces the cards', page.locator('.filiere-grid').count() == 0)
    check('Matière only offers MP subjects',
          page.evaluate('[...document.querySelector("[data-cnc-filter=subject]").options].map(o => o.value).filter(Boolean).join("|")') == 'Mathématiques I|Physique I')
    check('corrigé is mentioned when available', 'corrigé disponible' in (text(page, '.cnc-result-row') or ''))
    choose(page, 'year', '2023')
    check('Année narrows to one sujet', rows(page) == ['Physique I'], rows(page))
    choose(page, 'contest', 'CNAEM')
    check('Concours CNAEM resets the MP filière and shows ECS', rows(page) == ['Mathématiques'] and page.input_value('[data-cnc-filter="filiere"]') == '', rows(page))
    check('unpublished sujets never show', 'Chimie' not in (text(page, '#page') or ''))

    page.locator('[data-cnc-filter-clear]').click()
    page.wait_for_timeout(250)
    check('"Effacer les filtres" brings the cards back', page.locator('.filiere-grid').count() == 1 and page.locator('.cnc-results').count() == 0)
    choose(page, 'filiere', 'PSI')
    page.locator('.cnc-result-row').first.click()
    page.wait_for_timeout(400)
    check('a sujet opens like before', page.evaluate('cncView.screen') == 'paper' and page.evaluate('cncView.subject') == 'Physique')

    # Mode Épreuve is hidden everywhere.
    check('Épreuve is not in the sidebar', not page.locator('#mainNav [data-page="epreuve"]').is_visible())
    page.evaluate("navigate('epreuve')")
    page.wait_for_timeout(300)
    check('opening Épreuve lands on Concours', page.evaluate('currentPage') == 'cnc')
    check('no errors (desktop)', not problems, '; '.join(problems[:3]))
    page.context.close()

    page, problems = site.workspace('phone', exams=EXAMS)
    goto_page(page, 'cnc')
    page.wait_for_timeout(500)
    page.click('[data-studio-more]')
    page.wait_for_timeout(300)
    check('phone: Épreuve is not in the Plus menu', not page.locator('.studio-more [data-go="epreuve"]').is_visible())
    check('phone: Concours fits the width', page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    check('no errors (phone)', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
