/* The discovery lesson is authored content, never a simulated model response. */
(function (root) {
  'use strict';

  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const types = Object.freeze({
    'application/pdf': {kind: 'pdf', extension: 'pdf'},
    'image/jpeg': {kind: 'image', extension: 'jpe?g'},
    'image/png': {kind: 'image', extension: 'png'},
    'image/webp': {kind: 'image', extension: 'webp'}
  });

  function fileType(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0) {
      throw new Error('Ce fichier est vide ou illisible.');
    }
    if (file.size > MAX_FILE_BYTES) throw new Error('Choisis un fichier de 12 Mo maximum.');
    const type = types[file.type];
    if (!type || !new RegExp('\\.(' + type.extension + ')$', 'i').test(file.name || '')) {
      throw new Error('Choisis un PDF ou une image JPG, PNG ou WebP.');
    }
    return type.kind;
  }

  async function validateFile(file) {
    const kind = fileType(file);
    const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const matches = (signature, offset = 0) => signature.every((byte, index) => bytes[index + offset] === byte);
    let valid = false;
    if (file.type === 'application/pdf') {
      const header = [37, 80, 68, 70, 45];
      valid = Array.from({length: Math.max(0, bytes.length - header.length + 1)}, (_, index) => index)
        .some(index => matches(header, index));
    } else if (file.type === 'image/png') {
      valid = matches([137, 80, 78, 71, 13, 10, 26, 10]);
    } else if (file.type === 'image/jpeg') {
      valid = matches([255, 216, 255]);
    } else if (file.type === 'image/webp') {
      valid = matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8);
    }
    if (!valid) throw new Error('Le contenu du fichier ne correspond pas à son format.');
    return kind;
  }

  const hints = Object.freeze([
    Object.freeze({
      title: 'Commence par un bilan des forces.',
      text: 'Le poids et la réaction du support se compensent verticalement. Sur l’axe horizontal, seule la force du ressort agit :',
      equation: 'Fₓ = −kx',
      question: 'Quelle relation donne la deuxième loi de Newton ?'
    }),
    Object.freeze({
      title: 'Applique la deuxième loi de Newton.',
      text: 'Dans le référentiel du laboratoire supposé galiléen, la somme des forces est égale à la masse multipliée par l’accélération. Projette cette relation sur l’axe horizontal :',
      equation: 'm x″(t) = −k x(t)',
      question: 'Peux-tu rassembler tous les termes dans le même membre ?'
    }),
    Object.freeze({
      title: 'Reconnais l’oscillateur harmonique.',
      text: 'Divise par m et compare à l’équation d’un oscillateur harmonique. La pulsation propre vérifie ω₀² = k/m :',
      equation: 'x″(t) + ω₀² x(t) = 0',
      question: 'Comment utiliser x(0) = A et x′(0) = 0 pour trouver les constantes ?'
    })
  ]);

  function lesson(mode, index) {
    if (mode === 'explanation') return {
      title: 'Pourquoi le mouvement est-il oscillant ?',
      text: 'Quand le solide est écarté vers la droite, le ressort exerce une force vers la gauche, et inversement. Cette force de rappel est proportionnelle à l’écart à l’équilibre. Sans frottement, l’énergie mécanique se conserve et le mouvement reste sinusoïdal.',
      equation: 'ω₀ = √(k/m) = 10 rad·s⁻¹',
      question: 'La masse ralentit les oscillations ; la raideur du ressort les accélère.'
    };
    if (mode === 'correction') return {
      title: 'La correction de cet exemple.',
      text: 'Le bilan des forces donne m x″ = −kx, soit x″ + (k/m)x = 0. La solution générale est x(t) = C cos(ω₀t) + D sin(ω₀t). Les conditions initiales x(0) = 0,02 m et x′(0) = 0 donnent C = 0,02 m et D = 0.',
      equation: 'x(t) = 0,02 cos(10t) m',
      question: 'La période vaut T = 2π/ω₀ ≈ 0,628 s. Vérifie les unités et les deux conditions initiales.'
    };
    const safeIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, hints.length - 1)) : 0;
    return hints[safeIndex];
  }

  function chaptersFor(subjects, subjectId, level) {
    return (subjects.find(subject => subject.id === subjectId)?.chapters || [])
      .filter(chapter => !chapter.studyLevel || chapter.studyLevel === level);
  }

  function hasWorkspaceAccess(account, now = Date.now()) {
    if (account?.isAdmin === true) return true;
    const profile = account?.profile;
    if (profile?.subscription_plan !== 'ai_plus') return false;
    if (profile.subscription_status === 'active') {
      return !profile.subscription_ends_at || new Date(profile.subscription_ends_at).getTime() > now;
    }
    if (profile.subscription_status === 'promo') {
      return Boolean(profile.subscription_ends_at) && new Date(profile.subscription_ends_at).getTime() > now;
    }
    return profile.subscription_status === 'trial'
      && Boolean(profile.trial_ends_at)
      && new Date(profile.trial_ends_at).getTime() > now;
  }

  /* Turns a tutor answer into safe HTML: escaped text, light markdown, and LaTeX rendered by KaTeX.
   * Math is cut out first (so markdown never touches it), the rest is escaped, then math is put back. */
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\\$|[^$\n])+?)\$/g;

  function renderMath(tex, display, katex) {
    if (katex && typeof katex.renderToString === 'function') {
      try {
        return katex.renderToString(tex, {displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200, output: 'html'});
      } catch { /* Falls through to plain source. */ }
    }
    return display ? `<pre class="ai-math-source">${escapeHtml(tex)}</pre>` : `<code>${escapeHtml(tex)}</code>`;
  }

  function inline(text) {
    return text
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  }

  function formatAnswer(source, katex) {
    const maths = [];
    const text = String(source ?? '').replace(/\r\n?/g, '\n').replace(MATH, (match, block, bracket, paren, dollar) => {
      const display = block !== undefined || bracket !== undefined;
      maths.push(renderMath((block ?? bracket ?? paren ?? dollar).trim(), display, katex));
      return `\u0000${maths.length - 1}\u0000`;
    });
    const html = [];
    let list = null;
    const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
    let paragraph = [];
    const flush = () => { if (paragraph.length) { html.push(`<p>${paragraph.join('<br>')}</p>`); paragraph = []; } };
    for (const rawLine of escapeHtml(text).split('\n')) {
      const line = rawLine.trim();
      const bullet = /^[-•*]\s+(.*)$/.exec(line);
      const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(line);
      const heading = /^#{1,4}\s+(.*)$/.exec(line);
      if (!line) { flush(); closeList(); continue; }
      if (bullet || numbered) {
        flush();
        const kind = bullet ? 'ul' : 'ol';
        if (list !== kind) { closeList(); html.push(`<${kind}>`); list = kind; }
        html.push(`<li>${inline(bullet ? bullet[1] : numbered[2])}</li>`);
        continue;
      }
      closeList();
      if (heading) { flush(); html.push(`<p class="ai-answer-heading"><strong>${inline(heading[1])}</strong></p>`); continue; }
      if (/^\u0000\d+\u0000$/.test(line)) { flush(); html.push(line); continue; }
      paragraph.push(inline(line));
    }
    flush(); closeList();
    return html.join('').replace(/\u0000(\d+)\u0000/g, (match, index) => maths[Number(index)] ?? '');
  }

  const api = Object.freeze({MAX_FILE_BYTES, fileType, validateFile, hints, lesson, chaptersFor, hasWorkspaceAccess, formatAnswer, escapeHtml});
  root.PrepagoAICore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
