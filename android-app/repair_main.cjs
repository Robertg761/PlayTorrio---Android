
const fs = require('fs');
const path = 'src/js/main.js';

let content = fs.readFileSync(path, 'utf8');

// Restore syntax by renaming instead of commenting
content = content.replace(
    '// function updateCardDoneStatus__DUPLICATE',
    'function updateCardDoneStatus_DUP'
);

fs.writeFileSync(path, content);
console.log('Repaired updateCardDoneStatus');
