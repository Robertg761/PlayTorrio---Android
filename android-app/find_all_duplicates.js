
const fs = require('fs');
const lines = fs.readFileSync('src/js/main.js', 'utf8').split('\n');
const funcCounts = {};
lines.forEach((line, idx) => {
    // Match "function name("
    const m = line.match(/function\s+([a-zA-Z0-9_]+)\s*\(/);
    if (m) {
        const name = m[1];
        // Ignore anonymous functions or weird formatting if regex fails to capture correct name
        // But \w+ should be fine.
        if (!funcCounts[name]) funcCounts[name] = [];
        funcCounts[name].push(idx + 1);
    }
});
Object.keys(funcCounts).forEach(name => {
    if (funcCounts[name].length > 1) {
        console.log(`Duplicate ${name}: lines ${funcCounts[name].join(', ')}`);
    }
});
