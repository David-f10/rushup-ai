// Test synthétique V5.136 — P1 : affinage des accroches (refineAccroches)
// Extrait les VRAIES fonctions de index.html et les exécute sur des cas fabriqués.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

// --- Extraction par comptage d'accolades (les template `${}` restent équilibrés) ---
function extract(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('Fonction introuvable : ' + name);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

var window = {}; // fallback référencé par findAllPassageOccurrences (non atteint ici)
const bundle = [
  extract('findAllPassageOccurrences'),
  extract('secToSRTTC'),
  extract('tcToSec'),
  extract('refineAccroches'),
].join('\n\n');
eval(bundle);

// --- Construction d'un flux de mots Whisper {word,start,end} ---
function build(phrase, startAt, cadence) {
  const arr = []; let t = startAt;
  for (const p of phrase.split(' ')) { arr.push({ word: p, start: +t.toFixed(3), end: +(t + cadence * 0.8).toFixed(3) }); t += cadence; }
  return arr;
}
const CAD = 0.35;
const isTC = s => /^\d{2}:\d{2}:\d{2},\d{3}$/.test(s);

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── CAS 1 — accroche cohérente, réellement présente dans l'audio ──────────────
console.log('\nCAS 1 — accroche cohérente (présente à ~06:00)');
{
  const words = build('je suis tombé de dix étages et je ne suis pas mort ce jour là', 360, CAD);
  const a = { text: 'je suis tombé de dix étages', start: '00:00:00,000', end: '00:00:00,000', duration_sec: 99, why: 'hook', hook_type: 'shock_statement', rank: 1 };
  refineAccroches([a], words);
  check('matchée (_matchedLocal === true)', a._matchedLocal === true, '_matchedLocal=' + a._matchedLocal);
  check('_matchScore >= 0.75', a._matchScore >= 0.75, 'score=' + a._matchScore);
  check('start/end au format HH:MM:SS,mmm', isTC(a.start) && isTC(a.end), a.start + ' → ' + a.end);
  check('TC recalé vers ~06:00 (et non 00:00:00)', a.start.startsWith('00:06:0'), a.start);
  check('duration_sec = end - start (recalculé, ≠ 99)', Math.abs(a.duration_sec - (tcToSec(a.end.replace(',','.')) - tcToSec(a.start.replace(',','.')))) < 0.001 && a.duration_sec !== 99, 'dur=' + a.duration_sec);
  check('champs why/hook_type/rank préservés', a.why === 'hook' && a.hook_type === 'shock_statement' && a.rank === 1);
}

// ── CAS 2 — chimère : deux moitiés présentes MAIS à ~40s d'écart ──────────────
console.log('\nCAS 2 — chimère (moitiés séparées dans l\'audio, jamais contiguës)');
{
  const words = build('je suis tombé de dix étages et je ne suis pas mort', 360, CAD)
    .concat(build('bref j ai eu cinq cents factures mais c est faux vraiment', 400, CAD));
  const a = { text: 'je suis tombé de dix étages cinq cents factures mais c est faux', start: '00:06:00,000', end: '00:06:10,000', duration_sec: 99, why: 'hook' };
  refineAccroches([a], words);
  check('NON matchée (_matchedLocal === false)', a._matchedLocal === false, '_matchedLocal=' + a._matchedLocal);
  check('_matchScore = 0', a._matchScore === 0, 'score=' + a._matchScore);
  check('TC brut de Claude conservé', a.start === '00:06:00,000' && a.end === '00:06:10,000', a.start + ' → ' + a.end);
  check('duration_sec recalculé depuis le TC brut (= 10s)', Math.abs(a.duration_sec - 10) < 0.001, 'dur=' + a.duration_sec);
}

// ── CAS 3 — texte cohérent MAIS TC Claude malformé (2 champs) ─────────────────
console.log('\nCAS 3 — TC malformé « 00:32:780 » mais texte présent → doit être réparé');
{
  const words = build('je suis tombé de dix étages et je ne suis pas mort', 360, CAD);
  const a = { text: 'je suis tombé de dix étages', start: '00:32:780', end: '00:32:880', duration_sec: 0.1 };
  refineAccroches([a], words);
  check('matchée malgré TC d\'entrée malformé', a._matchedLocal === true, '_matchedLocal=' + a._matchedLocal);
  check('start réparé au format HH:MM:SS,mmm', isTC(a.start), a.start);
  check('duration_sec cohérent (> 1s, ≠ 0.1)', a.duration_sec > 1 && a.duration_sec !== 0.1, 'dur=' + a.duration_sec);
}

// ── CAS 4 — garde-fous : entrées vides / wordsSource absent ───────────────────
console.log('\nCAS 4 — garde-fous (ne doit pas jeter)');
{
  let threw = false;
  try {
    refineAccroches([], build('x y z', 0, CAD));
    refineAccroches([{ text: '' }], build('x y z', 0, CAD));
    refineAccroches([{ text: 'abc' }], []);      // wordsSource vide
    refineAccroches(null, null);
  } catch (e) { threw = true; console.log('    exception: ' + e.message); }
  check('aucune exception sur entrées dégénérées', !threw);
  const a = { text: '' };
  refineAccroches([a], build('x y z', 0, CAD));
  check('accroche à texte vide → _matchedLocal=false, score 0', a._matchedLocal === false && a._matchScore === 0);
}

console.log('\n──────────────────────────────');
console.log('Résultat : ' + pass + ' passés, ' + fail + ' échoués');
process.exit(fail ? 1 : 0);
