"""Checks for Colles et DS: empty state, adding a grade, averages, trend, chapters to revisit,
filters, editing and deleting, on desktop and phone. Run: python3 tests/qa/grades.py"""
import datetime as dt
import sys

import qa
from qa import Site, goto_page

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def seed(page, scores):
    """Grades for the first subject's first two chapters, oldest first, ending today."""
    page.evaluate('''scores => {
      const s = state.subjects[0], [a, b] = s.chapters, today = new Date();
      state.grades = scores.map((score, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (scores.length - 1 - i) * 7);
        return {id: 'g' + i, kind: i % 2 ? 'ds' : 'colle', subjectId: s.id, chapterId: (i % 2 ? b : a).id, date: localISO(d),
          score, outOf: 20, classAverage: 11, note: i === scores.length - 1 ? 'Erreurs de signe' : '', createdAt: new Date(2026, 0, 1, 0, i).toISOString()};
      });
      save(); navigate('grades');
    }''', scores)
    page.wait_for_timeout(500)


def set_select(page, selector, value):
    page.evaluate('''([s, v]) => { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); }''', [selector, value])


LOOK = '''() => {
  const h1 = document.querySelector('#page h1');
  return {title: h1 ? getComputedStyle(h1).fontSize : null, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nav: !!document.querySelector('.nav-item[data-page=grades][aria-current=page]')};
}'''


with Site() as site:
    page, problems = site.workspace('desktop')
    goto_page(page, 'grades')
    info = page.evaluate(LOOK)
    check('page opens from the sidebar entry with a 22px title', info['title'] == '22px' and info['nav'], info)
    check('empty state invites a first grade', page.locator('.grades-empty [data-grade-new]').count() == 1, text(page, '#page'))

    # ---- Add a grade through the form ------------------------------------------------------
    page.locator('.grades-empty [data-grade-new]').click()
    page.wait_for_timeout(300)
    form = page.locator('#modalForm')
    check('form opens with today as the date', form.locator('[name=date]').input_value() == dt.date.today().isoformat())
    chapters = page.evaluate("[...document.querySelectorAll('#gradeChapter option')].length")
    check('chapter list follows the chosen subject', chapters > 1, chapters)
    form.locator('[name=score]').fill('25')
    form.locator('button[type=submit]').click()
    page.wait_for_timeout(300)
    check('a score above the scale is refused', page.evaluate('(state.grades || []).length') == 0 and not page.locator('#modalBackdrop').is_hidden())
    form.locator('[name=score]').fill('8.5')
    form.locator('[name=classAverage]').fill('10')
    chapter_id = page.evaluate("document.querySelector('#gradeChapter option:nth-child(2)').value")
    set_select(page, '#gradeChapter', chapter_id)
    form.locator('[name=note]').fill('Démonstration oubliée')
    form.locator('button[type=submit]').click()
    page.wait_for_timeout(500)
    saved = page.evaluate('state.grades')
    check('grade is saved in the account state', len(saved) == 1 and saved[0]['score'] == 8.5 and saved[0]['chapterId'] == chapter_id and saved[0]['note'] == 'Démonstration oubliée', saved)
    check('summary shows the average out of 20', '8,5' in (text(page, '.grades-summary') or ''), text(page, '.grades-summary'))
    check('a grade under 10 puts its chapter in Chapitres à reprendre', page.locator('.grades-weak-row').count() == 1, text(page, '.grades-weak'))

    # ---- Averages, trend, filters --------------------------------------------------------
    seed(page, [6, 8, 9, 12, 14, 15])
    summary = text(page, '.grades-summary') or ''
    check('overall average over six grades', '10,7' in summary, summary)
    check('trend compares the last three grades to the three before', '+6' in summary, summary)
    check('subject row shows its average and gap to the class', '10,7' in (text(page, '.grades-subject') or '') and 'vs classe' in (text(page, '.grades-subject') or ''), text(page, '.grades-subject'))
    check('history lists newest first', page.locator('.grades-row').first.get_attribute('data-grade-row') == 'g5')
    check('chapters back above 10 leave the revisit list', page.locator('.grades-weak-row').count() == 0, text(page, '.grades-weak'))
    set_select(page, '[data-grade-kind-filter]', 'ds')
    page.wait_for_timeout(300)
    check('kind filter keeps only DS', page.locator('.grades-row').count() == 3, page.locator('.grades-row').count())
    set_select(page, '[data-grade-kind-filter]', '')
    page.wait_for_timeout(300)

    # ---- Weak chapter actions ----------------------------------------------------------------
    seed(page, [14, 12, 7])
    check('latest grade under 10 flags its chapter', page.locator('.grades-weak-row').count() == 1, text(page, '.grades-weak'))
    page.locator('[data-grade-plan]').click()
    page.wait_for_timeout(300)
    title = page.locator('#modalForm [name=title]').input_value()
    check('Planifier opens a revision task for the chapter', title.startswith('Reprendre : '), title)
    page.locator('#cancelModal').click()

    # ---- Edit and delete -----------------------------------------------------------------
    page.locator('[data-grade-edit=g2]').click()
    page.wait_for_timeout(300)
    page.locator('#modalForm [name=score]').fill('16')
    page.locator('#modalForm button[type=submit]').click()
    page.wait_for_timeout(400)
    check('editing a grade updates it in place', page.evaluate("state.grades.find(g => g.id === 'g2').score") == 16 and page.evaluate('state.grades.length') == 3)
    check('a fixed chapter leaves the revisit list', page.locator('.grades-weak-row').count() == 0, text(page, '.grades-weak'))
    page.once('dialog', lambda d: d.accept())
    page.locator('[data-grade-delete=g0]').click()
    page.wait_for_timeout(400)
    check('deleting a grade asks first, then removes it', page.evaluate('state.grades.length') == 2)

    # ---- Nouveau menu ----------------------------------------------------------------------
    goto_page(page, 'overview')
    page.locator('#topbarCreate').click()
    page.locator('[data-header-create=grade]').click()
    page.wait_for_timeout(300)
    check('Nouveau menu opens the grade form', page.locator('#modalTitle').inner_text() == 'Nouvelle note')
    page.locator('#cancelModal').click()
    check('no errors on desktop', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Phone -----------------------------------------------------------------------------
    page, problems = site.workspace('phone')
    seed(page, [6, 8, 9, 12, 14, 7])
    info = page.evaluate(LOOK)
    check('phone: no sideways scrolling', info['overflow'] <= 0, info)
    page.locator('[data-studio-more]').click()
    check('phone: Colles et DS is in the Plus menu', page.locator('.studio-more [data-go=grades]').count() == 1)
    check('no errors on phone', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL'), name, '' if ok else f'-- {detail}')
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
