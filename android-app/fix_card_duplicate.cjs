
const fs = require('fs');
const path = 'src/js/main.js';

let content = fs.readFileSync(path, 'utf8');

// Remove duplicate updateCardDoneStatus (second occurrence)
// We'll search for the function string and remove the second match.
const funcStr = 'function updateCardDoneStatus(cardElement, id, mediaType) {';
const firstIdx = content.indexOf(funcStr);
const secondIdx = content.indexOf(funcStr, firstIdx + 1);

if (secondIdx !== -1) {
    // Find the end of the function?
    // It's safer to just comment out the signature to avoid "Already declared" error.
    // Or simpler: replace strict string with empty if I can find the block.
    // The function is short.
    // Let's comment out the function name.
    const before = content.substring(0, secondIdx);
    const after = content.substring(secondIdx);
    const newAfter = after.replace('function updateCardDoneStatus', '// function updateCardDoneStatus__DUPLICATE');
    content = before + newAfter;
    console.log('Renamed duplicate updateCardDoneStatus');
    fs.writeFileSync(path, content);
} else {
    console.log('Duplicate updateCardDoneStatus not found');
}
