
const fs = require('fs');
const path = 'g:/Projects/Android Apps/PlayTorrio - Android App/android-app/src/js/main.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('downloadMusicTrack')) {
        console.log(`Found at line ${i + 1}: ${lines[i]}`);
    }
}
