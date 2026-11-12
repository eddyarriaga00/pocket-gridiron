#!/usr/bin/env node
/* Proves two JavaScript files are the same program: parses both and compares the syntax trees,
   ignoring positions. Used after tools/fmt.js. Needs the parser that ships inside Node:

     node --expose-internals tools/astcheck.js before.js after.js */
'use strict';
const fs = require('fs');
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
catch (_) { console.error('run with: node --expose-internals tools/astcheck.js a.js b.js'); process.exit(2); }

const tree = f => JSON.stringify(acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' }),
  (k, v) => (k === 'start' || k === 'end' || k === 'loc' || k === 'range' ? undefined : v));
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: node --expose-internals tools/astcheck.js a.js b.js'); process.exit(2); }
const ta = tree(a), tb = tree(b);
if (ta === tb) { console.log('same program: ' + a + ' and ' + b + ' (' + ta.length + ' bytes of tree)'); process.exit(0); }
let i = 0;
while (i < ta.length && ta[i] === tb[i]) i++;
console.error('DIFFERENT at tree offset ' + i + '\n  ' + ta.slice(Math.max(0, i - 120), i + 120) + '\n  ' + tb.slice(Math.max(0, i - 120), i + 120));
process.exit(1);
