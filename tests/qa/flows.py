"""Behaviour checks for the activation-code journey. Run: python3 tests/qa/flows.py"""
import sys

from qa import Site

IG = 'https://www.instagram.com/prepago.ma/'
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))


def calls(page, key):
    return page.evaluate('k => (window.__QA_CALLS || []).filter(c => k in c)', key)


def rpc_calls(page, name):
    return [c for c in calls(page, 'rpc') if c['rpc'] == name]


with Site() as site:
    # 1. Hero button opens sign-up in place, with the code field.
    page, problems = site.open('/', 'desktop', {'mode': 'signed-out'})
    start = page.url
    page.click('.public-hero-actions a.public-button:not(.secondary)')
    page.wait_for_timeout(400)
    check('hero opens sign-up without leaving the page', page.url.split('#')[0] == start.split('#')[0] and page.is_visible('#authCard'))
    check('sign-up shows the code field', page.is_visible('#authCodeField input[name="activation_code"]'))
    page.click('[data-auth-mode="login"]')
    check('login hides the code field', not page.is_visible('#authCodeField'))
    check('no errors on landing', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 2. Every Instagram link is correct and opens in a new tab.
    for path in ['/', '/tarifs/', '/contact/', '/methode/', '/fonctionnalites/', '/conditions/']:
        page, _ = site.open(path, 'desktop', {'mode': 'signed-out'})
        links = page.evaluate("[...document.querySelectorAll('a[href*=\"instagram\"]')].map(a => [a.href, a.target, a.rel])")
        check(f'instagram links on {path}', links and all(l == [IG, '_blank', 'noopener'] for l in links), f'{len(links)} link(s)')
        text = page.evaluate("document.querySelector('#prepagoLanding, main')?.innerText || ''")
        check(f'no "paiement en ligne" promise on {path}', not __import__('re').search(r'paiement en ligne', text, __import__('re').I), text[:0])
        page.context.close()

    # 3. Sign-up sends the code with the account, in upper case.
    page, problems = site.open('/#inscription', 'desktop', {'mode': 'signed-out'})
    page.fill('input[name="full_name"]', 'Test Étudiant')
    page.select_option('select[name="filiere"]', 'MP')
    page.fill('#authForm input[name="email"]', 'Test@Example.invalid')
    page.fill('#authForm input[name="password"]', 'motdepasse123')
    page.fill('input[name="activation_code"]', ' prepa-2026 ')
    page.click('#authSubmit')
    page.wait_for_timeout(500)
    sent = calls(page, 'auth')
    signup = [c for c in sent if c['auth'] == 'signUp']
    check('sign-up was sent once', len(signup) == 1)
    check('code travels with the account, upper-cased', signup and signup[0]['data'].get('activation_code') == 'PREPA-2026', str(signup[:1]))
    check('profile fields unchanged', signup and signup[0]['data'].get('full_name') == 'Test Étudiant' and signup[0]['data'].get('filiere') == 'MP')
    check('confirmation link unchanged', signup and signup[0]['redirect'] == 'https://prepago.site/verification/')
    check('confirmation screen shown', page.is_visible('#confirmCard'))
    check('no errors during sign-up', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 4. Sign-up without a code still works and sends no code.
    page, _ = site.open('/#inscription', 'desktop', {'mode': 'signed-out'})
    page.fill('input[name="full_name"]', 'Sans Code')
    page.select_option('select[name="filiere"]', 'PSI')
    page.fill('#authForm input[name="email"]', 'sans@example.invalid')
    page.fill('#authForm input[name="password"]', 'motdepasse123')
    page.click('#authSubmit')
    page.wait_for_timeout(500)
    signup = [c for c in calls(page, 'auth') if c['auth'] == 'signUp']
    check('sign-up without code sends none', len(signup) == 1 and 'activation_code' not in signup[0]['data'])
    page.context.close()

    # 5. A badly formed code is refused before anything is sent.
    page, _ = site.open('/#inscription', 'desktop', {'mode': 'signed-out'})
    page.fill('input[name="full_name"]', 'Mauvais Code')
    page.select_option('select[name="filiere"]', 'TSI')
    page.fill('#authForm input[name="email"]', 'bad@example.invalid')
    page.fill('#authForm input[name="password"]', 'motdepasse123')
    page.fill('input[name="activation_code"]', 'a b')
    page.click('#authSubmit')
    page.wait_for_timeout(400)
    check('bad code blocks sign-up', not [c for c in calls(page, 'auth') if c['auth'] == 'signUp'])
    check('bad code explains itself', 'code d’activation' in page.inner_text('#authStatus'))
    page.context.close()

    # 6. First login with a stored code: activated automatically, workspace opens.
    page, problems = site.open('/#connexion', 'desktop', {'mode': 'inactive', 'metaCode': 'prepa-2026'}, wait=1800)
    redeemed = rpc_calls(page, 'redeem_promo_code')
    check('stored code redeemed once', len(redeemed) == 1 and redeemed[0]['args']['input_code'] == 'PREPA-2026', str(redeemed))
    check('workspace opens after activation', page.evaluate('!document.body.classList.contains("auth-pending")'))
    cleared = [c for c in calls(page, 'auth') if c['auth'] == 'updateUser']
    check('stored code cleared afterwards', cleared and cleared[0]['data'] == {'activation_code': None}, str(cleared))
    check('no errors during auto-activation', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 7. Stored code refused: activation screen, code kept in the field, reason shown, no loop.
    page, problems = site.open('/#connexion', 'desktop', {'mode': 'inactive', 'metaCode': 'OLD-CODE', 'promoOk': False}, wait=1800)
    check('refused code leads to the activation screen', page.is_visible('#accessGate') and page.evaluate('document.body.classList.contains("auth-pending")'))
    check('refused code stays in the field', page.input_value('#promoCodeInput') == 'OLD-CODE')
    check('refusal is explained without "promo"', page.inner_text('#promoStatus').strip() == 'Ce code est invalide.', page.inner_text('#promoStatus'))
    page.wait_for_timeout(1200)
    check('refused code is tried only once', len(rpc_calls(page, 'redeem_promo_code')) == 1)
    page.context.close()

    # 8. No stored code: activation screen, typing a code opens the workspace.
    page, problems = site.open('/#connexion', 'phone', {'mode': 'inactive'}, wait=1500)
    check('inactive account sees the activation screen', page.is_visible('#accessGate') and 'Active ton accès' in page.inner_text('#accessGate'))
    check('no automatic attempt without a stored code', not rpc_calls(page, 'redeem_promo_code'))
    check('activation screen points to Instagram', page.get_attribute('#accessGate .auth-code-help a', 'href') == IG)
    page.fill('#promoCodeInput', 'manuel-1')
    page.click('#promoForm button[type="submit"]')
    page.wait_for_timeout(1500)
    check('manual code is sent upper-cased', [c['args']['input_code'] for c in rpc_calls(page, 'redeem_promo_code')] == ['MANUEL-1'])
    check('workspace opens after manual activation', page.evaluate('!document.body.classList.contains("auth-pending")'))
    check('no errors during manual activation', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 9. An active account is never asked for a code and nothing is redeemed.
    page, problems = site.workspace('desktop', metaCode='STRAY-CODE')
    check('active account opens directly', page.evaluate('!document.body.classList.contains("auth-pending")'))
    check('active account redeems nothing', not rpc_calls(page, 'redeem_promo_code'))
    page.context.close()

    # 10. Header links from another page land on the right form.
    page, _ = site.open('/tarifs/', 'desktop', {'mode': 'signed-out'})
    page.click('.public-actions a.public-button')
    page.wait_for_timeout(900)
    check('"Créer mon espace" from /tarifs/ opens sign-up', page.url.endswith('/#inscription') and page.is_visible('#authCodeField'))
    page.context.close()

# ---------------------------------------------------------------- loading
with Site() as site:
    # 11. Reading the landing page runs none of the workspace.
    page, problems = site.open('/', 'phone', {'mode': 'signed-out'}, wait=2500)
    check('landing runs no workspace code', page.evaluate('typeof window.PrepagoState === "undefined" && typeof window.supabase === "undefined"'))
    check('landing has three scripts of its own', page.evaluate('document.querySelectorAll("script[src]").length') == 3)
    check('landing holds first paint for 10 stylesheets only', page.evaluate('document.querySelectorAll(\'link[rel="stylesheet"]:not([data-app-style])\').length') == 10)
    check('workspace styles arrive afterwards', page.evaluate('!document.documentElement.classList.contains("app-styles-pending") && [...document.querySelectorAll("link[data-app-style]")].every(l => l.media === "all")'))
    check('no errors on the light landing page', not problems, '; '.join(problems[:3]))
    # 12. Going to login from there loads the workspace and the form works.
    page.click('.public-menu')
    page.click('.public-actions a[href="/#connexion"]')
    page.wait_for_function('!document.documentElement.classList.contains("app-booting")', timeout=8000)
    check('login form appears once it is wired up', page.is_visible('#authForm input[name="email"]') and page.evaluate('getComputedStyle(document.querySelector(".auth-form-panel")).visibility') == 'visible')
    page.fill('#authForm input[name="email"]', 'qa@example.invalid')
    page.fill('#authForm input[name="password"]', 'motdepasse123')
    page.click('#authSubmit')
    page.wait_for_timeout(1800)
    check('login from the landing page opens the workspace', page.evaluate('!document.body.classList.contains("auth-pending")') and len([c for c in calls(page, 'auth') if c['auth'] == 'signIn']) == 1)
    check('no errors after lazy start', not problems, '; '.join(problems[:3]))
    page.context.close()

    # 13. A returning student on the bare address goes straight to the workspace.
    page, problems = site.open('/', 'desktop', {'mode': 'active'}, wait=2000)
    check('stored session opens the workspace from /', page.evaluate('!document.body.classList.contains("auth-pending") && !document.body.classList.contains("landing-view")'), '; '.join(problems[:3]))
    page.context.close()

    # 14. E-mail links still land where they should.
    page, problems = site.open('/nouveau-mot-de-passe/?code=abc123', 'desktop', {'mode': 'active'}, wait=2000)
    check('password-reset link opens the new-password form', page.is_visible('#recoveryForm') and 'recovery=1' in page.url, page.url)
    page.context.close()
    page, problems = site.open('/mot-de-passe-oublie/', 'desktop', {'mode': 'signed-out'}, wait=2000)
    check('forgotten-password page opens the request form', page.is_visible('#resetRequestForm'), page.url)
    page.context.close()
    page, problems = site.open('/verification/?code=abc123', 'desktop', {'mode': 'inactive'}, wait=2200)
    check('confirmation link signs in and reaches activation', page.is_visible('#accessGate') and 'code=' not in page.url, page.url)
    page.context.close()
    page, problems = site.open('/activation/', 'desktop', {'mode': 'signed-out'}, wait=2000)
    check('/activation/ opens the login form', page.is_visible('#authForm') and not problems, page.url)
    page.context.close()

    # 15. If the workspace scripts never arrive, pressing Enter must not submit the form natively.
    ctx = site.browser.new_context(viewport={'width': 1366, 'height': 900})
    ctx.route('**/*', lambda r: r.abort() if (not r.request.url.startswith(site.base) or r.request.url.split('?')[0].endswith('/auth.js')) else r.continue_())
    page = ctx.new_page()
    page.goto(site.base + '/#connexion', wait_until='load')
    page.wait_for_timeout(600)
    page.evaluate("""() => { const f = document.querySelector('#authForm'); f.elements.email.value = 'a@b.co'; f.elements.password.value = 'secret-password'; f.requestSubmit(); }""")
    page.wait_for_timeout(500)
    check('password never reaches the address bar', 'secret' not in page.url and 'password' not in page.url and page.url == site.base + '/#connexion', page.url)
    ctx.close()

failed = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(('ok  ' if ok else 'FAIL') + ' ' + name + (f'  [{detail}]' if detail and not ok else ''))
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
