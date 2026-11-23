// node do-move.cjs <predsModule> <predName> <target.css> "<header comment>"
const fs = require('fs'); const path = require('path');
const { units, render } = require('./cssmove.cjs'); const { removeSelectors } = require('./remove.cjs');
const [predsFile, predName, target, header] = process.argv.slice(2);
const pred = require(path.resolve(predsFile))[predName];
const legacy = fs.readFileSync('legacy.css', 'utf8');
const us = units(legacy); const picked = us.filter(pred);
const keys = new Set(picked.map((u) => `${u.media}\u0000${u.selector}`));
fs.writeFileSync(target, `${header}\n\n${render(picked)}`);
fs.writeFileSync('legacy.css', removeSelectors(legacy, (m, s) => keys.has(`${m}\u0000${s.replace(/\s+/g, ' ')}`)));
const left = units(fs.readFileSync('legacy.css', 'utf8')).filter(pred).length;
console.log(`${target}: ${picked.length} units moved, left in legacy matching: ${left}`);
