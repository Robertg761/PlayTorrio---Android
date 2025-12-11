
const fs = require('fs');
const indexPath = 'src/index.html';
const jsPath = 'src/js/main.js';

try {
    const lines = fs.readFileSync(indexPath, 'utf-8').split(/\r?\n/);

    // Config based on findstr output
    // 11215:<script>
    // 31447:    </script>
    // 31496:<script>
    // 31503:</script>

    const script1StartLine = 11215; // 1-based
    const script1EndLine = 31447;   // 1-based
    const script2StartLine = 31496; // 1-based
    const script2EndLine = 31503;   // 1-based

    console.log(`Extracting JS from lines ${script1StartLine}-${script1EndLine} and ${script2StartLine}-${script2EndLine}`);

    // Slice is 0-based, so subtract 1 for start index.
    // We want content AFTER the opening tag, so startLine (which is index startLine-1) + 1?
    // No, lines[script1StartLine-1] is "<script>". We want lines[script1StartLine].
    // So slice start is script1StartLine.
    // End is the line containing </script>, so script1EndLine-1.

    const js1 = lines.slice(script1StartLine, script1EndLine - 1).join('\n');
    const js2 = lines.slice(script2StartLine, script2EndLine - 1).join('\n');

    fs.writeFileSync(jsPath, js1 + '\n\n' + js2);
    console.log(`Wrote ${jsPath}`);

    // Reconstruct HTML
    // Keep lines BEFORE script1StartLine (index 0 to script1StartLine-2 inclusive) -> slice(0, script1StartLine - 1)
    const part1 = lines.slice(0, script1StartLine - 1);

    // Keep lines BETWEEN script1EndLine and script2StartLine
    // script1EndLine is </script>. script2StartLine is <script>.
    // slice(script1EndLine, script2StartLine - 1)
    const part2 = lines.slice(script1EndLine, script2StartLine - 1);

    // Keep lines AFTER script2EndLine
    // slice(script2EndLine)
    const part3 = lines.slice(script2EndLine);

    part1.push('<script type="module" src="/js/main.js"></script>');

    const newHtml = [...part1, ...part2, ...part3].join('\n');
    fs.writeFileSync(indexPath, newHtml);
    console.log(`Updated ${indexPath}`);

} catch (e) {
    console.error(e);
    process.exit(1);
}
