
const fs = require('fs');
const path = 'src/js/main.js';

let content = fs.readFileSync(path, 'utf8');

// 1. myListRead() -> StorageService.getObject('my-list') || []
// Usage: const response = await window.electronAPI.myListRead();
content = content.replace(
    /await\s+window\.electronAPI\.myListRead\(\)/g,
    "(await StorageService.getObject('my-list')) || []"
);

// 2. myListWrite(data) -> StorageService.setObject('my-list', data)
// Usage: await window.electronAPI.myListWrite(myListCache);
content = content.replace(
    /await\s+window\.electronAPI\.myListWrite\(([^)]+)\)/g,
    "await StorageService.setObject('my-list', $1)"
);

// 3. doneWatchingRead() -> StorageService.getObject('done-watching') || []
// Usage: const response = await window.electronAPI.doneWatchingRead();
content = content.replace(
    /await\s+window\.electronAPI\.doneWatchingRead\(\)/g,
    "(await StorageService.getObject('done-watching')) || []"
);

// 4. doneWatchingWrite(data) -> StorageService.setObject('done-watching', data)
// Usage: await window.electronAPI.doneWatchingWrite(doneWatchingCache);
content = content.replace(
    /await\s+window\.electronAPI\.doneWatchingWrite\(([^)]+)\)/g,
    "await StorageService.setObject('done-watching', $1)"
);

fs.writeFileSync(path, content);
console.log('Refactored lists persistence');
