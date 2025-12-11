const fs = require('fs');
const content = fs.readFileSync('src/js/main.js', 'utf8');

let stack = [];
let inString = false;
let stringChar = '';
let inComment = false; // // style
let inMultiComment = false; // /* */ style

let line = 1;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '\n') {
        line++;
        inComment = false;
        continue;
    }

    // False positive avoidance for regex
    if (content.substring(i).startsWith('replace(/') || content.substring(i).startsWith('.match(/') || content.substring(i).startsWith('.test(')) {
        // Skip until end of line
        while (i < content.length && content[i] !== '\n') { i++; }
        line++;
        inComment = false;
        continue;
    }

    if (inComment) continue;

    if (inMultiComment) {
        if (char === '*' && nextChar === '/') {
            inMultiComment = false;
            i++;
        }
        continue;
    }

    if (inString) {
        if (char === '\\') {
            i++; // skip next char
            continue;
        }
        if (char === stringChar) {
            inString = false;
        }
        continue;
    }

    // Start comment
    if (char === '/' && nextChar === '/') {
        inComment = true;
        i++;
        continue;
    }
    if (char === '/' && nextChar === '*') {
        inMultiComment = true;
        i++;
        continue;
    }

    // Start string
    if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
    }

    if (char === '{' || char === '(' || char === '[') {
        stack.push({ char, line });
        continue;
    }

    if (char === '}' || char === ')' || char === ']') {
        if (stack.length === 0) {
            console.log(`Error: Extra '${char}' at line ${line}`);
            // process.exit(1); 
            continue;
        }

        const last = stack.pop();
        const expected = last.char === '{' ? '}' : last.char === '(' ? ')' : ']';
        if (char !== expected) {
            console.log(`Error: Mismatched '${char}' at line ${line}. Expected '${expected}' closing block from line ${last.line}`);
        }
    }
}

if (stack.length > 0) {
    console.log(`Missing ${stack.length} closing characters.`);
    stack.forEach(s => console.log(` - '${s.char}' from line ${s.line}`));
} else {
    console.log('Braces and brackets are balanced!');
}
