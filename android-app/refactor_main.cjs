
const fs = require('fs');
const path = 'src/js/main.js';

let content = fs.readFileSync(path, 'utf8');

// 1. Imports
const imports = `import { StorageService } from '../services/storage';\n\n`;
content = imports + content;

// 2. Replace getUserPref('discord_dismissed')
// Original: const result = await window.electronAPI?.getUserPref?.('discord_dismissed');
// Replacement: const result = (await StorageService.get('discord_dismissed')) === 'true';
// Note: handle optional chaining in regex
content = content.replace(
    /await\s+window\.electronAPI\?\.getUserPref\?.\('discord_dismissed'\)/g,
    "(await StorageService.get('discord_dismissed')) === 'true'"
);

// 3. Replace setUserPref('discord_dismissed', true)
// Original: await window.electronAPI.setUserPref('discord_dismissed', true);
// Match both with and without ?.
content = content.replace(
    /await\s+window\.electronAPI\??\.setUserPref\('discord_dismissed',\s*true\)/g,
    "await StorageService.set('discord_dismissed', 'true')"
);

// 4. Mock electronAPI platform for styling (lines 31499 was using it)
// It checks window.electronAPI && window.electronAPI.platform
// We can set it globally or shim it.
// Let's shim it at the START (after imports)
const shim = `
// Shim electronAPI
window.electronAPI = window.electronAPI || {};
window.electronAPI.platform = 'android';
`;
content = imports + shim + content.substring(imports.length);

// 5. Expose Global Functions
const exportsCode = `
// Expose functions to window for onclick handlers
window.showCustomMagnetModal = showCustomMagnetModal;
window.closeEpubDownloadModal = closeEpubDownloadModal;
window.applyUIMode = applyUIMode;
window.applyTheme = applyTheme;
`;
content += exportsCode;

fs.writeFileSync(path, content);
console.log('Refactored src/js/main.js');
