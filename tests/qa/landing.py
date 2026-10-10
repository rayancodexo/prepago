"""Checks for the public home page: product tour (laptop / phone), XP section, layout.
Run: python3 tests/qa/landing.py"""
import sys

import qa
from qa import Site

results = []
qa.VIEWPORTS['wide'] = {'width': 1440, 'height': 900}


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))


TOUR = '''() => { const vids = [...document.querySelectorAll('video[data-tour]')];
  const shown = v => v.offsetParent !== null;
  const v = vids.find(shown), box = document.querySelector('[data-tour-box]');
  const poster = v && v.parentElement.querySelector('.tour-poster');
  return { count: vids.length, frame: v ? (v.closest('.laptop') ? 'laptop' : 'phone') : null, src: v ? v.getAttribute('src') : null,
    paused: v ? v.paused : null, poster: !!poster && poster.complete && poster.naturalWidth > 0,
    pressed: document.querySelector('[data-tour-toggle]').getAttribute('aria-pressed'), label: document.querySelector('[data-tour-toggle] span').textContent,
    playing: box.classList.contains('is-playing'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; }'''

with Site() as site:
    for vp in ('wide', 'tablet', 'phone'):
        page, problems = site.open('/', vp, {'mode': 'signed-out'}, wait=1200)
        page.locator('[data-tour-box]').scroll_into_view_if_needed()
        page.wait_for_timeout(600)
        t = page.evaluate(TOUR)
        frame = 'phone' if vp == 'phone' else 'laptop'
        check(f'{vp}: the tour shows in a {frame}, poster loaded', t['frame'] == frame and t['poster'], t)
        # The harness asks for reduced motion: nothing may start or download by itself.
        check(f'{vp}: reduced motion keeps the tour still and unloaded', t['src'] is None and t['paused'] and t['pressed'] == 'true' and t['label'] == 'Lire la visite', t)
        page.click('[data-tour-toggle]')
        page.wait_for_timeout(2500)
        t2 = page.evaluate(TOUR)
        check(f'{vp}: "Lire la visite" loads and plays the right video', t2['src'] and ('reel' in t2['src']) == (vp == 'phone') and not t2['paused'] and t2['playing'] and t2['label'] == 'Mettre en pause', t2)
        page.click('[data-tour-toggle]')
        page.wait_for_timeout(300)
        check(f'{vp}: the button pauses it again', page.evaluate(TOUR)['paused'])
        check(f'{vp}: no sideways scrolling', t['overflow'] <= 0, t['overflow'])
        check(f'{vp}: no errors', not problems, '; '.join(problems[:3]))
        page.context.close()

    page, problems = site.open('/', 'wide', {'mode': 'signed-out'}, wait=1000)
    xp = page.evaluate("[...document.querySelectorAll('.xp-table li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())")
    check('XP section lists the real rewards', xp == ['Cours +10 XP', 'Résumé +15 XP', 'Exercices faciles +20 XP', 'Exercices avancés +30 XP', 'Chapitre maîtrisé +25 XP', 'Tâche terminée +25 XP', 'Épreuve CNC terminée +150 XP', 'Concentration 2 XP / minute'], xp)
    check('the example leaderboard is labelled as an example', 'Exemple' in page.inner_text('.home-xp-visual'))
    check('one laptop video and one phone video on the page', page.evaluate("document.querySelectorAll('#prepagoLanding video').length") == 2)
    page.context.close()

    page, problems = site.workspace('desktop')
    page.wait_for_timeout(800)
    check('workspace never loads the tour video', page.evaluate("[...document.querySelectorAll('video[data-tour]')].every(v => !v.getAttribute('src'))"))
    check('workspace: no errors', not problems, '; '.join(problems[:3]))
    page.context.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
