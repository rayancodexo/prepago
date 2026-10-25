"""Checks for Colles et DS: plan an exam with its chapters, follow its preparation through
Matières, grade it, then results, calendar link and chapters to revisit, on desktop and phone.
Run: python3 tests/qa/grades.py"""
import datetime as dt
import sys

import qa
from qa import Site, goto_page

results = []
TODAY = dt.date.today()
day = lambda n: (TODAY + dt.timedelta(days=n)).isoformat()


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


def text(page, selector):
    return page.evaluate('s => document.querySelector(s)?.innerText.trim() ?? null', selector)


def set_value(page, selector, value):
    page.evaluate('''([s, v]) => { const el = document.querySelector(s); el.value = v;
      el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }''', [selector, value])


def seed(page, grades):
    """Records for the first subject; chapter indexes are turned into that subject's chapter ids."""
    page.evaluate('''grades => {
      const s = state.subjects[0];
      state.grades = grades.map((g, i) => ({id: 'g' + i, kind: 'ds', subjectId: s.id, time: '', outOf: 20, classAverage: null, note: '', eventId: '',
        createdAt: new Date(2026, 0, 1, 0, i).toISOString(), ...g, chapterIds: (g.chapters || []).map(n => s.chapters[n].id), chapters: undefined}));
      save(); navigate('grades');
    }''', grades)
    page.wait_for_timeout(500)


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
    check('how it works shows the three steps', page.locator('.grades-how li').count() == 3, text(page, '.grades-how'))
    check('nothing planned yet invites a first exam', page.locator('.grades-placeholder [data-grade-new]').count() == 1, text(page, '#page'))

    # ---- Plan a DS with two chapters -------------------------------------------------------
    page.locator('.grades-placeholder [data-grade-new]').click()
    page.wait_for_timeout(300)
    set_value(page, '#gradeDate', day(5))
    page.wait_for_timeout(100)
    hidden = page.evaluate("[document.querySelector('.grades-form-result').hidden, document.querySelector('.grades-form-later').hidden]")
    check('a future date hides the grade fields', hidden == [True, False], hidden)
    boxes = page.locator('#gradeChapters input[type=checkbox]')
    check('chapters of the chosen subject are listed', boxes.count() > 1, boxes.count())
    boxes.nth(0).check(); boxes.nth(1).check()
    page.locator('#modalForm button[type=submit]').click()
    page.wait_for_timeout(500)
    saved = page.evaluate('state.grades')
    event = page.evaluate("state.events.find(e => e.gradeId === state.grades[0]?.id) || null")
    check('planned DS is saved with its chapters and no grade', len(saved) == 1 and saved[0]['score'] is None and len(saved[0]['chapterIds']) == 2, saved)
    check('planned DS is added to the calendar as an exam', event and event['date'] == day(5) and event['category'] == 'exam', event)
    check('it shows under À venir with a countdown', 'dans 5 jours' in (text(page, '.grades-exam') or ''), text(page, '.grades-exam'))
    check('preparation starts at 0 %', '0 %' in (text(page, '.grades-prep') or ''), text(page, '.grades-prep'))

    # ---- Preparation follows Matières --------------------------------------------------------
    page.evaluate("(() => { const s = state.subjects[0], c = s.chapters.find(c => c.id === state.grades[0].chapterIds[0]); c.steps = {...(c.steps || {}), course: true, summary: true}; save(); render(); })()")
    page.wait_for_timeout(300)
    check('steps done in Matières raise the preparation', '20 %' in (text(page, '.grades-prep') or ''), text(page, '.grades-prep'))
    check('each chapter shows its next step', 'Prochaine étape : Exercices faciles' in (text(page, '.grades-exam-chapters') or ''), text(page, '.grades-exam-chapters'))
    page.locator('.grades-exam .grades-chapter-link').first.click()
    page.wait_for_timeout(600)
    card = page.evaluate("(() => { const id = state.grades[0].chapterIds[0]; return document.querySelector(`[data-chapter-card='${id}'] .chapter-grades`)?.innerText ?? null; })()")
    check('a chapter link opens Matières on that chapter', page.evaluate('currentPage') == 'subjects' and card is not None, page.evaluate('currentPage'))
    check('the chapter card shows the coming DS', card and 'DS dans 5 jours' in card, card)
    page.locator('.chapter-grades [data-grade-chapter-new]').first.click()
    page.wait_for_timeout(300)
    checked = page.evaluate("[...document.querySelectorAll('#gradeChapters input:checked')].map(i => i.value)")
    first = page.evaluate("document.querySelector('[data-chapter-card]').dataset.chapterCard")
    check('+ Colle ou DS on a chapter card pre-selects that chapter', checked == [first], [checked, first])
    page.locator('#cancelModal').click()
    goto_page(page, 'grades')
    page.locator('[data-grade-revise]').first.click()
    page.wait_for_timeout(500)
    check('Réviser opens a focus session on the next chapter', page.evaluate('currentPage') == 'focus')

    # ---- Calendar moves follow --------------------------------------------------------------
    page.evaluate(f"(() => {{ state.events.find(e => e.gradeId === state.grades[0].id).date = '{day(7)}'; save(); navigate('grades'); }})()")
    page.wait_for_timeout(300)
    check('moving the exam in the calendar moves it here', page.evaluate('state.grades[0].date') == day(7) and 'dans 7 jours' in (text(page, '.grades-exam') or ''))

    # ---- Grade it once it is over -----------------------------------------------------------
    seed(page, [{'date': day(-1), 'score': None, 'chapters': [0, 1]}])
    check('a past exam without a grade is listed under À noter', page.locator('.grades-exam.is-due').count() == 1, text(page, '#page'))
    page.locator('.grades-quick input[name=score]').fill('25')
    page.locator('.grades-quick button[type=submit]').click()
    page.wait_for_timeout(300)
    check('a grade above the scale is refused', page.evaluate('state.grades[0].score') is None)
    page.locator('.grades-quick input[name=score]').fill('8.5')
    page.locator('.grades-quick button[type=submit]').click()
    page.wait_for_timeout(500)
    check('the quick form saves the grade', page.evaluate('state.grades[0].score') == 8.5)
    check('results appear after the first grade', '8,5' in (text(page, '.grades-summary') or ''), text(page, '.grades-summary'))
    check('both chapters of a DS under 10 are to revisit', page.locator('.grades-weak-row').count() == 2, text(page, '.grades-weak'))
    page.locator('.grades-weak [data-grade-plan]').first.click()
    page.wait_for_timeout(300)
    title = page.locator('#modalForm [name=title]').input_value()
    check('Planifier opens a revision task for the chapter', title.startswith('Reprendre : '), title)
    page.locator('#cancelModal').click()
    page.locator('.grades-weak .grades-chapter-link').first.click()
    page.wait_for_timeout(600)
    weak = page.evaluate("document.querySelector('.chapter-grades.is-weak')?.innerText ?? null")
    check('the grade shows on the chapter in Matières', weak and 'Dernière note : 8,5/20' in weak and 'à revoir' in weak, weak)

    # ---- Results -----------------------------------------------------------------------------
    seed(page, [{'date': day(-50 + 7 * i), 'score': s, 'chapters': [i % 2], 'classAverage': 11} for i, s in enumerate([6, 8, 9, 12, 14, 15])] + [{'date': day(-1), 'score': 7, 'chapterId': None, 'chapters': []}])
    summary = text(page, '.grades-summary') or ''
    check('overall average over the graded exams', '10,1' in summary, summary)
    check('trend compares the last three grades to the three before', '+2,3' in summary, summary)
    check('a better grade since takes a chapter off the revisit list', page.locator('.grades-weak-row').count() == 0, text(page, '.grades-weak'))
    set_value(page, '[data-grade-kind-filter]', 'ds')
    page.wait_for_timeout(300)
    check('history can be filtered by kind', page.locator('.grades-row').count() == 7, page.locator('.grades-row').count())
    page.evaluate("(() => { state.grades.push({id: 'old', kind: 'colle', subjectId: state.subjects[0].id, chapterId: state.subjects[0].chapters[2].id, date: '2026-01-05', score: 13, outOf: 20}); save(); render(); })()")
    page.wait_for_timeout(300)
    set_value(page, '[data-grade-kind-filter]', '')
    page.wait_for_timeout(300)
    legacy = page.evaluate("document.querySelector('[data-grade-row=old]')?.innerText ?? ''")
    check('grades saved by the first version keep their chapter', page.evaluate('state.subjects[0].chapters[2].name') in legacy, legacy)

    # ---- Delete -----------------------------------------------------------------------------
    page.locator('[data-grade-new]').first.click()
    page.wait_for_timeout(300)
    set_value(page, '#gradeDate', day(3))
    page.locator('#modalForm button[type=submit]').click()
    page.wait_for_timeout(400)
    planned = page.evaluate("state.grades.find(g => g.date === '%s' && g.score === null)?.id" % day(3))
    page.once('dialog', lambda d: d.accept())
    page.locator(f'[data-grade-card={planned}] [data-grade-delete]').click()
    page.wait_for_timeout(400)
    check('deleting an exam asks first and removes it from the calendar', not page.evaluate(f"state.grades.some(g => g.id === '{planned}') || state.events.some(e => e.gradeId === '{planned}')"))

    # ---- Nouveau menu ----------------------------------------------------------------------
    goto_page(page, 'overview')
    page.locator('#topbarCreate').click()
    page.locator('[data-header-create=grade]').click()
    page.wait_for_timeout(300)
    check('Nouveau menu opens the exam form', page.locator('#modalTitle').inner_text() == 'Nouvelle colle ou DS')
    page.locator('#cancelModal').click()
    check('no errors on desktop', not problems, '; '.join(problems[:3]))
    page.context.close()

    # ---- Phone -----------------------------------------------------------------------------
    page, problems = site.workspace('phone')
    seed(page, [{'date': day(4), 'score': None, 'chapters': [0, 1, 2]}, {'date': day(-2), 'score': None, 'chapters': [0]}] + [{'date': day(-30 + i), 'score': s, 'chapters': [0]} for i, s in enumerate([6, 12, 14])])
    info = page.evaluate(LOOK)
    check('phone: no sideways scrolling', info['overflow'] <= 0, info)
    page.locator('[data-studio-more]').click()
    check('phone: Colles et DS is in the Plus menu', page.locator('.studio-more [data-go=grades]').count() == 1)
    check('no errors on phone', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
