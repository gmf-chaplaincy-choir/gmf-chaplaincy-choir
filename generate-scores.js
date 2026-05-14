/**
 * GMF Chaplaincy Choir — Auto Score Generator
 * Scans the scores/ folder and builds the SCORES data block in index.html
 * Run automatically by Netlify on every deploy.
 */

const fs   = require('fs');
const path = require('path');

// ── Akan/special character map for display titles ──
const CHAR_MAP = {
  'ɛ':'ɛ','ɔ':'ɔ','Ɛ':'Ɛ','Ɔ':'Ɔ','ɣ':'ɣ','ŋ':'ŋ'
};

// Words that should stay lowercase in titles
const LOWER_WORDS = new Set(['a','an','the','and','or','of','in','on','at','to','for','with','from','by','as','is','it']);

// ── Convert filename to display title ──
function toTitle(filename) {
  // Remove -tonic / -staff / -solfa suffix and .pdf
  let name = filename
    .replace(/\.(pdf)$/i, '')
    .replace(/[-_](tonic|staff|solfa|jva)$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Capitalise words (respect Akan characters and small words)
  return name.split(' ').map((word, i) => {
    if (!word) return word;
    if (i !== 0 && LOWER_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    // Capitalise first character (handles ɛ, ɔ etc.)
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

// ── Detect notation type from filename ──
function getType(filename) {
  if (/tonic|solfa/i.test(filename)) return 'tonic';
  if (/staff/i.test(filename))       return 'staff';
  return null;
}

// ── Scan one category folder ──
function scanFolder(folderPath, category) {
  if (!fs.existsSync(folderPath)) return [];

  const files = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();

  // Group by base title (strip suffix)
  const grouped = {};
  files.forEach(file => {
    const type = getType(file);
    if (!type) return;
    const base = file
      .replace(/\.(pdf)$/i, '')
      .replace(/[-_](tonic|staff|solfa|jva)$/i, '')
      .toLowerCase();
    if (!grouped[base]) grouped[base] = { title: toTitle(file), tonic: null, staff: null };
    grouped[base][type] = `scores/${category}/${file}`;
  });

  // Build entries — always tonic first, then staff
  const entries = [];
  Object.values(grouped).forEach(g => {
    entries.push({ title: g.title, type: 'tonic', path: g.tonic });
    entries.push({ title: g.title, type: 'staff', path: g.staff });
  });
  return entries;
}

// ── Categories to auto-scan ──
const AUTO_CATS = ['anthems','hymns','easter','highlife','patriotic','classical','christmas'];

// ── Build SCORES object ──
const SCORES = {};
AUTO_CATS.forEach(cat => {
  SCORES[cat] = scanFolder(path.join(__dirname, 'scores', cat), cat);
});

// Keep manual entries for special items (Drive, Hymnbook, Collections)
const MANUAL = {
  hymns: [
    { title:"Methodist Praise Songs", type:"tonic", drive:"1cP-mta_6uEPcOnguC3xSgPsoemJyHbBG" },
    { title:"Methodist Praise Songs", type:"staff", drive:"1cP-mta_6uEPcOnguC3xSgPsoemJyHbBG" },
    { title:"Methodist Hymnbook",     type:"hymnModal", notation:"tonic", tonicId:"1as_6XVRDlv-HjNiZGAilv7_UfGlPSJbc", staffId:"15kS4RaO1tQ6d26V_Bz95ei-akzI-LYGj" },
    { title:"Methodist Hymnbook",     type:"hymnModal", notation:"staff", tonicId:"1as_6XVRDlv-HjNiZGAilv7_UfGlPSJbc", staffId:"15kS4RaO1tQ6d26V_Bz95ei-akzI-LYGj" },
  ],
  collections: [
    { title:"Varick Classics Vol. 1", type:"tonic", varrick:true, drive:"110JcTAItun_jS8OVeKyPMC3Iuy6-23yJ" },
    { title:"Varick Classics Vol. 1", type:"staff", varrick:true, drive:"110JcTAItun_jS8OVeKyPMC3Iuy6-23yJ" },
  ],
  general:   [],
  rehearsal: []
};

// Merge manual into auto (manual items appended)
Object.entries(MANUAL).forEach(([cat, items]) => {
  if (!SCORES[cat]) SCORES[cat] = [];
  SCORES[cat] = [...SCORES[cat], ...items];
});

// ── Inject into index.html ──
const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const generated = `const SCORES = ${JSON.stringify(SCORES, null, 2)};`;

// Replace the existing SCORES block
const start = html.indexOf('const SCORES = {');
const end   = html.indexOf('};', start) + 2;

if (start === -1) {
  console.error('ERROR: Could not find SCORES block in index.html');
  process.exit(1);
}

html = html.slice(0, start) + generated + html.slice(end);
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('✅ Scores generated successfully:');
AUTO_CATS.forEach(cat => {
  const count = (SCORES[cat]||[]).filter(s=>s.path).length;
  console.log(`   ${cat}: ${count} scores`);
});
