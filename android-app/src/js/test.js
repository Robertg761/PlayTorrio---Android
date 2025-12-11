// Minimal test script to check if module loading works
console.log('[TEST] Test script loaded successfully!');

// Test if basic ES module syntax works
const testVar = 'Module loading works';
console.log('[TEST]', testVar);

// Export something to verify module nature
export const testModule = true;

// Signal to window that we loaded
window.testScriptLoaded = true;
console.log('[TEST] All tests passed - window.testScriptLoaded is now true');
