
const fs = require('fs');
const path = 'src/js/main.js';

let content = fs.readFileSync(path, 'utf8');

// 1. Rename declaration at 19551
// Match indentation and function name
// Original:         function formatTime(seconds) {
content = content.replace(
    /function formatTime\(seconds\) \{\s*\n\s*const h = Math\.floor\(seconds \/ 3600\);/g,
    'function formatDuration(seconds) {\n            const h = Math.floor(seconds / 3600);'
);

// 2. Update usage at 6751
// Original: return formatTime(Math.floor(Number(s||0)));
content = content.replace(
    /return formatTime\(Math\.floor\(Number\(s\|\|0\)\)\);/g,
    'return formatDuration(Math.floor(Number(s||0)));'
);

fs.writeFileSync(path, content);
console.log('Renamed duplicate formatTime to formatDuration');
