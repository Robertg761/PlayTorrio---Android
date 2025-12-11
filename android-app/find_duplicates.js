
const fs = require('fs');
const path = 'src/js/main.js';

const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    // Check for function declaration
    if (/function\s+formatTime\s*\(/.test(line)) {
        console.log(`Function Decl at line ${idx + 1}: ${line.trim()}`);
    }
    // Check for var/let/const
    if (/(?:var|let|const)\s+formatTime\s*=?/.test(line)) {
        console.log(`Variable Decl at line ${idx + 1}: ${line.trim()}`);
    }
});
