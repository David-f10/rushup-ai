// Test structurel V5.137 — P8 : valide l'XMEML généré par buildSequenceXML() contre les
// 6 invariants, sans Premiere. Extrait les VRAIES fonctions de index.html.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

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
eval([extract('buildSequenceXML'), extract('tcToSec')].join('\n\n'));

// ── Harnais : sources + segments + résolveur injecté ──────────────────────────
function makeSources(audioChannels) { return [{ name: 'rush.mp4', durationSec: 600, offset: 0, audioChannels: audioChannels }]; }
const SEGS = [
  { start: '00:00:10,000', end: '00:00:15,000', arc_part: 'intro',   text: 'un' },
  { start: '00:01:00,000', end: '00:01:08,000', arc_part: 'tension', text: 'deux' },
  { start: '00:02:00,000', end: '00:02:04,000', arc_part: 'conclusion', text: 'trois' },
];
const getSourceForTC = (sources) => (tcSec) => ({ name: sources[0].name, localTC: tcSec, sourceIndex: 0 });

function gen(audioChannels, linkMode) {
  const sources = makeSources(audioChannels);
  return buildSequenceXML({
    ch: 'instagram_reels', cfg: { name: 'Instagram Reels' }, segs: SEGS, sources: sources, fps: 25,
    seqName: 'TEST', sequenceWidth: 1080, sequenceHeight: 1920, scaleA: 100, scaleB: 85,
    linkMode: linkMode || 'none', getSourceForTC: getSourceForTC(sources)
  }).xml;
}

// ── Mini-extracteurs XML ──────────────────────────────────────────────────────
// Les balises de SÉQUENCE sont indentées à 6 espaces ; celles imbriquées dans <file>
// (samplecharacteristics) à 16 espaces. On ancre sur l'indentation pour ne pas les confondre.
const between = (s, open, close) => { const a = s.indexOf(open); const b = s.indexOf(close, a); return a < 0 || b < 0 ? '' : s.slice(a + open.length, b); };
const seqSection = (xml, tag) => between(xml, '\n      <' + tag + '>\n', '\n      </' + tag + '>\n');
const audioOf = xml => seqSection(xml, 'audio');
const videoOf = xml => seqSection(xml, 'video');
// découpe une section en chunks par <track> ... </track> (garde anti-boucle si </track> absent)
function tracks(section) {
  const out = []; let idx = 0;
  while (true) {
    const a = section.indexOf('<track>', idx); if (a < 0) break;
    const b = section.indexOf('</track>', a); if (b < 0) break;
    out.push(section.slice(a + 7, b)); idx = b + 8;
  }
  return out;
}
const countClipitems = chunk => (chunk.match(/<clipitem /g) || []).length;

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '  →  ' + detail : '')); }
}

function runScenario(name, nCh) {
  console.log('\n' + name + ' (canaux attendus : ' + nCh + ')');
  const xml = gen(nCh, 'none');
  const audio = audioOf(xml), video = videoOf(xml);
  const aTracks = tracks(audio), vTracks = tracks(video);
  const N = SEGS.length;

  // Invariant 1 — nb pistes audio == numOutputChannels (le <channels> de séquence est supprimé en V5.138 ;
  // le compte de canaux de la séquence passe désormais uniquement par numOutputChannels)
  const numOut = +(audio.match(/<numOutputChannels>(\d+)<\/numOutputChannels>/) || [])[1];
  check('I1 · pistes audio == numOutputChannels == ' + nCh,
    aTracks.length === nCh && numOut === nCh,
    'pistes=' + aTracks.length + ' numOut=' + numOut);

  // Invariant 2 — ZÉRO piste audio vide + N clipitems par piste (le défaut qui bloquait la prod)
  const counts = aTracks.map(countClipitems);
  check('I2 · aucune piste audio vide (' + N + ' clips/piste)  ⟵ défaut bloquant prod',
    counts.length === nCh && counts.every(c => c === N),
    'clips par piste = [' + counts.join(', ') + ']');

  // Invariant 3 — chaque clipitem audio a sourcetrack/trackindex == index de sa piste
  let stOK = true, stDetail = '';
  aTracks.forEach((chunk, ti) => {
    const idx = ti + 1;
    const clips = chunk.split('<clipitem ').slice(1);
    clips.forEach(cl => {
      const m = cl.match(/<sourcetrack><mediatype>audio<\/mediatype><trackindex>(\d+)<\/trackindex><\/sourcetrack>/);
      if (!m || +m[1] !== idx) { stOK = false; stDetail = 'piste ' + idx + ' : ' + (m ? m[1] : 'ABSENT'); }
    });
  });
  check('I3 · sourcetrack/trackindex correct sur chaque clip audio', stOK, stDetail);

  // Invariant 4 — aucun mediatype video / filtre Motion dans la section audio
  check('I4 · section audio sans <mediatype>video</mediatype>, sans <filter>, sans Motion',
    !/<mediatype>video<\/mediatype>/.test(audio) && !/<filter>/.test(audio) && !/Motion/.test(audio));

  // Invariant 5 — vidéo : N clips + timeline continue (start == end précédent)
  const vClips = countClipitems(vTracks[0] || '');
  const starts = [...(video.matchAll(/<start>(\d+)<\/start>/g))].map(m => +m[1]);
  const ends = [...(video.matchAll(/<end>(\d+)<\/end>/g))].map(m => +m[1]);
  let cont = starts.length === N && starts[0] === 0;
  for (let i = 1; i < starts.length; i++) if (starts[i] !== ends[i - 1]) cont = false;
  check('I5 · vidéo intacte : ' + N + ' clips + timeline continue', vClips === N && cont,
    'clips=' + vClips + ' starts=[' + starts + '] ends=[' + ends + ']');

  // Invariant 6 — <file> complet déclaré UNE seule fois (au lieu de 2)
  const fullFile = (xml.match(/<file id="file-1">/g) || []).length;      // ouverture avec enfants
  check('I6 · <file> complet déclaré 1× (au lieu de 2)', fullFile === 1, 'occurrences=' + fullFile);

  // Invariant 7 — <channelcount> == nCh dans le <file> ; AUCUN <channels> nulle part (la balise fantôme)
  const fileBlock = between(xml, '<file id="file-1">', '</file>');
  const chCount = +(fileBlock.match(/<channelcount>(\d+)<\/channelcount>/) || [])[1];
  check('I7 · <file> <channelcount> == ' + nCh + ' (l\'élément que Premiere lit réellement)', chCount === nCh, 'channelcount=' + chCount);
  check('I7b · AUCUN <channels> dans tout le XML (balise fantôme éliminée partout)', !/<channels>/.test(xml), 'reste ' + (xml.match(/<channels>/g) || []).length);
}

runScenario('SCÉNARIO A — mono déclaré mono', 1);
runScenario('SCÉNARIO B — stéréo déclaré stéréo (cas qui bloquait)', 2);

// ── linkMode ─────────────────────────────────────────────────────────────────
console.log('\nSCÉNARIO C — linkMode (stéréo)');
{
  const none = gen(2, 'none');
  const full = gen(2, 'full');
  const linksNone = (none.match(/<link>/g) || []).length;
  const linksFull = (full.match(/<link>/g) || []).length;
  // full : par segment, bloc = 1 vidéo + 2 audio = 3 <link>, attaché à 3 clips (v + a1 + a2) = 9 ; × 3 segments = 27
  check('linkMode "none" → 0 <link>', linksNone === 0, 'links=' + linksNone);
  check('linkMode "full" → 27 <link> (3 clips × 3 refs × 3 segments)', linksFull === 27, 'links=' + linksFull);
  check('linkMode "none" → sortie vidéo identique au sourcetrack seul (pas de <link> en vidéo)',
    !/<link>/.test(videoOf(none)));
}

console.log('\n──────────────────────────────');
console.log('Résultat : ' + pass + ' passés, ' + fail + ' échoués');
process.exit(fail ? 1 : 0);
