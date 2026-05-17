/**
 * GMF Chaplaincy Choir — Auto Score Generator v2
 * Scans the scores/ folder and builds the SCORES data block in index.html
 * Run automatically by Netlify on every deploy.
 *
 * FIXES in v2:
 * - Strict end-of-filename suffix detection (prevents "Prekese Toni" bug)
 * - mergeDuplicateTitles() merges pairs with spelling differences in filenames
 * - Warns about skipped/duplicate files in build log
 */

const fs   = require('fs');
const path = require('path');

const LOWER_WORDS = new Set([
  'a','an','the','and','or','of','in','on','at','to','for',
  'with','from','by','as','is','it','na','bi','wo','me','ne',
  'ma','mu','ye','se','no','ni','bo','ko','so','wa','ba','ka'
]);

function toTitle(base) {
  return base.split(' ').map((word, i) => {
    if (!word) return word;
    if (i !== 0 && LOWER_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

// STRICT suffix detection — only matches at END of filename
function getType(filename) {
  const lower = filename.toLowerCase().replace(/\.pdf$/i, '');
  if (/[_-](tonic|solfa)$/.test(lower)) return 'tonic';
  if (/[_-](staff)$/.test(lower))       return 'staff';
  return null;
}

function getBaseKey(filename) {
  return filename
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[_-](tonic|staff|solfa|jva)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function scanFolder(folderPath, category) {
  if (!fs.existsSync(folderPath)) return [];
  const files = fs.readdirSync(folderPath)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();
  const grouped = {};
  files.forEach(file => {
    const type = getType(file);
    if (!type) {
      console.warn('  skipping (no valid suffix): ' + category + '/' + file);
      return;
    }
    const baseKey = getBaseKey(file);
    if (!grouped[baseKey]) grouped[baseKey] = { title: toTitle(baseKey), tonic: null, staff: null };
    if (!grouped[baseKey][type]) {
      grouped[baseKey][type] = 'scores/' + category + '/' + file;
    } else {
      console.warn('  duplicate ' + type + ' for "' + baseKey + '" — skipping: ' + file);
    }
  });
  const entries = [];
  Object.values(grouped).forEach(g => {
    entries.push({ title: g.title, type: 'tonic', path: g.tonic });
    entries.push({ title: g.title, type: 'staff', path: g.staff });
  });
  return entries;
}

// Merge entries that have same title but different base keys
// (caused by spelling differences between tonic and staff filenames)
function mergeDuplicateTitles(entries) {
  const byTitle = {};
  entries.forEach(e => {
    const key = e.title.toLowerCase().trim();
    if (!byTitle[key]) byTitle[key] = { title: e.title, tonic: null, staff: null };
    if (e.type === 'tonic' && e.path && !byTitle[key].tonic) byTitle[key].tonic = e.path;
    if (e.type === 'staff' && e.path && !byTitle[key].staff) byTitle[key].staff = e.path;
  });
  const merged = [];
  Object.values(byTitle).forEach(g => {
    merged.push({ title: g.title, type: 'tonic', path: g.tonic });
    merged.push({ title: g.title, type: 'staff', path: g.staff });
  });
  return merged;
}

const AUTO_CATS = ['anthems','hymns','easter','highlife','patriotic','classical','christmas'];
const SCORES = {};
AUTO_CATS.forEach(cat => {
  const raw = scanFolder(path.join(__dirname, 'scores', cat), cat);
  SCORES[cat] = mergeDuplicateTitles(raw);
});

const MANUAL = {
  hymns: [
    { title:"Methodist Praise Songs", type:"tonic", drive:"1cP-mta_6uEPcOnguC3xSgPsoemJyHbBG" },
    { title:"Methodist Praise Songs", type:"staff", drive:"1cP-mta_6uEPcOnguC3xSgPsoemJyHbBG" },
    { title:"Methodist Hymnbook", type:"hymnModal", notation:"tonic", tonicId:"1as_6XVRDlv-HjNiZGAilv7_UfGlPSJbc", staffId:"15kS4RaO1tQ6d26V_Bz95ei-akzI-LYGj" },
    { title:"Methodist Hymnbook", type:"hymnModal", notation:"staff", tonicId:"1as_6XVRDlv-HjNiZGAilv7_UfGlPSJbc", staffId:"15kS4RaO1tQ6d26V_Bz95ei-akzI-LYGj" },
  ],
  collections: [
    { title:"Varick Classics Vol. 1", type:"tonic", varrick:true, drive:"110JcTAItun_jS8OVeKyPMC3Iuy6-23yJ" },
    { title:"Varick Classics Vol. 1", type:"staff", varrick:true, drive:"110JcTAItun_jS8OVeKyPMC3Iuy6-23yJ" },
  ],
  general:   [],
  rehearsal: []
};

// ── Drive overrides — replace local path with Google Drive for large files ──
const DRIVE_OVERRIDES = {
  highlife: [
    { title:"Wo Gyidie Agye Wo Nkwa", type:"tonic", drive:"1livk6Ij_8-OSWnUaDKy3VBu3_ERIxK25" },
  ]
};

Object.entries(MANUAL).forEach(([cat, items]) => {
  if (!SCORES[cat]) SCORES[cat] = [];
  SCORES[cat] = [...SCORES[cat], ...items];
});

// Apply Drive overrides — swap path→drive for specific large files
Object.entries(DRIVE_OVERRIDES).forEach(([cat, overrides]) => {
  if (!SCORES[cat]) return;
  overrides.forEach(ov => {
    const entry = SCORES[cat].find(s =>
      s.title.toLowerCase() === ov.title.toLowerCase() && s.type === ov.type
    );
    if (entry) {
      entry.path  = null;
      entry.drive = ov.drive;
      console.log('  Drive override applied: ' + ov.title + ' (' + ov.type + ')');
    }
  });
});

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const generated = 'const SCORES = ' + JSON.stringify(SCORES, null, 2) + ';';
const start = html.indexOf('const SCORES = {');
const end   = html.indexOf('};', start) + 2;
if (start === -1) { console.error('ERROR: SCORES block not found'); process.exit(1); }
html = html.slice(0, start) + generated + html.slice(end);
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('\n✅ Scores generated successfully:');
AUTO_CATS.forEach(cat => {
  const avail = (SCORES[cat]||[]).filter(s => s.path).length;
  const total = (SCORES[cat]||[]).length;
  console.log('   ' + cat.padEnd(12) + ': ' + avail + ' available / ' + total + ' total');
});
console.log('');
