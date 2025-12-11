
const fs = require('fs');
const path = 'src/js/main.js';

const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const funcsToFind = ['showCustomMagnetModal', 'closeEpubDownloadModal', 'getUserPref', 'setUserPref'];

funcsToFind.forEach(func => {
    // Search for "function funcName" or "funcName ="
    lines.forEach((line, idx) => {
        if (line.includes(func)) {
            console.log(`Found ${func} at line ${idx + 1}: ${line.trim().substring(0, 100)}...`);
        }
    });
});
