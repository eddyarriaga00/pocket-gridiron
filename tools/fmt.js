#!/usr/bin/env node
/* House formatter for this project's JavaScript. No dependencies.

     node tools/fmt.js js/game.js            rewrite the file in place
     node tools/fmt.js --check js/game.js    exit 1 if the file would change

   It only moves whitespace (and adds a missing semicolon at the end of a block), so the program cannot
   change meaning. Run tools/astcheck.js afterwards to prove it: that compares the syntax trees.

   What it does: one statement per line, two-space indentation, spaces around operators and after commas,
   a blank line between top-level functions. Line breaks the author wrote inside tables and long
   expressions are kept. Strings, template literals, regular expressions and comments are never touched. */
'use strict';
const fs = require('fs');

const OPWORDS = new Set(['in', 'of', 'instanceof']);
const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export extends finally for ' +
  'function if import in instanceof let new of return switch throw try typeof var void while with yield await').split(' '));
const CTL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??',
  '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@', '#'];
const BINARY = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=', '==', '!=', '===', '!==',
  '<', '>', '<=', '>=', '&&', '||', '??', '*', '/', '%', '**', '&', '|', '^', '<<', '>>', '>>>', '=>']);
const NUM = /^(0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?n?)/;
const IDENT = /^[A-Za-z_$ -￿][\w$ -￿]*/;

/* ---------- scanning helpers ---------- */
function scanString(s, i) {
  const q = s[i];
  for (i++; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === q) return i + 1;
  }
  throw new Error('unterminated string');
}
function scanTemplate(s, i) {
  for (i++; i < s.length;) {
    const c = s[i];
    if (c === '\\') i += 2;
    else if (c === '`') return i + 1;
    else if (c === '$' && s[i + 1] === '{') i = scanTemplateExpr(s, i + 2);
    else i++;
  }
  throw new Error('unterminated template literal');
}
function scanTemplateExpr(s, i) {
  for (let depth = 1; i < s.length;) {
    const c = s[i];
    if (c === '`') i = scanTemplate(s, i);
    else if (c === '\'' || c === '"') i = scanString(s, i);
    else if (c === '{') { depth++; i++; }
    else if (c === '}') { i++; if (--depth === 0) return i; }
    else i++;
  }
  throw new Error('unterminated ${ } in a template literal');
}
function scanRegex(s, i) {
  let cls = false;
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === '\n') throw new Error('unterminated regular expression');
    else if (c === '[') cls = true;
    else if (c === ']') cls = false;
    else if (c === '/' && !cls) { i++; while (/[a-z]/.test(s[i] || '')) i++; return i; }
  }
  throw new Error('unterminated regular expression');
}

/* ---------- tokens ----------
   Each token: { t: 'id'|'num'|'str'|'tpl'|'re'|'p'|'lc'|'bc', v: text, nl: line breaks before it in the source }
   plus notes the printer needs: kw, kind ('block'|'obj' for braces), un (unary + -), post (postfix ++ --),
   tern (ternary ? :), ctl (the parenthesis of if/for/while...), sep (a ; inside a for header), prop (after a dot). */
function tokenize(src) {
  const toks = [], stack = [{ ch: '', tern: 0 }];
  let i = 0, nl = 0, prev = null;
  const top = () => stack[stack.length - 1];
  const valueEnd = t => {
    if (!t) return false;
    if (t.t === 'num' || t.t === 'str' || t.t === 'tpl' || t.t === 're') return true;
    if (t.t === 'id') return !t.kw;
    return (t.v === ')' && !t.ctl) || t.v === ']' || (t.v === '}' && t.kind === 'obj') || ((t.v === '++' || t.v === '--') && t.post);
  };
  const push = t => { t.nl = nl; nl = 0; toks.push(t); if (t.t !== 'lc' && t.t !== 'bc') prev = t; return t; };
  while (i < src.length) {
    const c = src[i], rest = src.slice(i, i + 80);
    if (c === '\n') { nl++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = src.length; push({ t: 'lc', v: src.slice(i, j).trimEnd() }); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2) + 2; if (j < 2) throw new Error('unterminated comment'); push({ t: 'bc', v: src.slice(i, j) }); i = j; continue; }
    if (c === '\'' || c === '"') { const j = scanString(src, i); push({ t: 'str', v: src.slice(i, j) }); i = j; continue; }
    if (c === '`') { const j = scanTemplate(src, i); push({ t: 'tpl', v: src.slice(i, j) }); i = j; continue; }
    if (c === '/' && !valueEnd(prev)) { const j = scanRegex(src, i); push({ t: 're', v: src.slice(i, j) }); i = j; continue; }
    let m = (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) && NUM.exec(rest);
    if (m) { push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    m = IDENT.exec(src.slice(i, i + 200));
    if (m) {
      const prop = prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.');
      push({ t: 'id', v: m[0], kw: !prop && KEYWORDS.has(m[0]), prop });
      i += m[0].length; continue;
    }
    let p = PUNCT.find(x => src.startsWith(x, i));
    if (!p) throw new Error('unexpected character ' + JSON.stringify(c) + ' at offset ' + i);
    if (p === '?.' && /[0-9]/.test(src[i + 2] || '')) p = '?';
    const t = { t: 'p', v: p };
    if (p === '{') {
      const a = prev;
      const block = !a || (a.t === 'p' && (a.v === ')' || a.v === '=>' || a.v === ';' || ((a.v === '{' || a.v === '}') && a.kind === 'block'))) ||
        (a.t === 'id' && (!a.kw || a.v === 'else' || a.v === 'try' || a.v === 'finally' || a.v === 'do'));
      t.kind = block ? 'block' : 'obj';
      stack.push({ ch: '{', kind: t.kind, tern: 0, isDo: !!(a && a.kw && a.v === 'do') });
    } else if (p === '(' || p === '[') {
      const ctl = p === '(' && prev && prev.kw && CTL.has(prev.v);
      t.ctl = ctl;
      stack.push({ ch: p, tern: 0, ctl, isFor: ctl && prev.v === 'for' });
    } else if (p === '}' || p === ')' || p === ']') {
      const e = stack.pop();
      if (!e || !e.ch) throw new Error('unbalanced ' + p + ' at offset ' + i);
      if (p === '}') { t.kind = e.kind; t.isDo = e.isDo; }
      if (p === ')') t.ctl = e.ctl;
    } else if (p === ';') {
      if (top().ch === '(') t.sep = true; else top().tern = 0;
    } else if (p === '?') { t.tern = true; top().tern++; }
    else if (p === ':') { if (top().tern > 0) { t.tern = true; top().tern--; } }
    else if (p === '+' || p === '-') t.un = !valueEnd(prev);
    else if (p === '++' || p === '--') t.post = valueEnd(prev);
    push(t); i += p.length;
  }
  if (stack.length !== 1) throw new Error('unbalanced brackets at end of file');
  return toks;
}

/* ---------- printing ---------- */
const isWord = t => t.t === 'id' || t.t === 'num';
const isBlock = (t, v) => t.t === 'p' && t.v === v && t.kind === 'block';
const isObj = (t, v) => t.t === 'p' && t.v === v && t.kind === 'obj';
const isBin = t => t.t === 'p' && (BINARY.has(t.v) || ((t.v === '+' || t.v === '-') && !t.un) || ((t.v === '?' || t.v === ':') && t.tern));

function space(a, b) {
  if (a.t === 'bc' || b.t === 'bc' || b.t === 'lc') return true;
  if (b.t === 'p') {
    if ([',', ';', ')', ']', '.', '?.'].includes(b.v)) return false;
    if (b.v === ':' && !b.tern) return false;
    if ((b.v === '++' || b.v === '--') && b.post) return false;
  }
  if (a.t === 'p') {
    if (['(', '[', '.', '?.', '!', '~', '...'].includes(a.v)) return false;
    if ((a.v === '+' || a.v === '-') && a.un) return false;
    if ((a.v === '++' || a.v === '--') && !a.post) return false;
    if (a.v === ',' || a.v === ';' || a.v === ':') return true;
  }
  if (isBin(a) || isBin(b)) return true;
  if (isObj(a, '{')) return !isObj(b, '}');
  if (isObj(b, '}')) return true;
  if (isBlock(b, '{')) return true;
  if (isBlock(a, '}')) return isWord(b);
  if (a.t === 'p' && a.v === ')' && a.ctl) return true;
  if (b.t === 'id' && OPWORDS.has(b.v) && !b.prop) return true;
  if (a.kw) return true;
  if (isWord(a) && isWord(b)) return true;
  return false;
}

/* after the } of a block: these continue the statement, anything else starts a new line */
const JOIN = new Set([')', ']', ',', ';', '.', '?.', ':', '?', '=', '=>', '&&', '||', '??']);
function joinsBlockEnd(close, next) {
  if (!next) return false;
  if (next.t === 'p') return JOIN.has(next.v);
  if (next.t === 'id' && next.kw) return next.v === 'else' || next.v === 'catch' || next.v === 'finally' || (next.v === 'while' && close.isDo) || OPWORDS.has(next.v);
  return false;
}

function format(src) {
  const toks = tokenize(src), out = [];
  const stack = [];               // open brackets: { block, lineIndent }
  let line = '', lineIndent = 0, last = null, lastSig = null, stmtOpen = false, blocks = 0;
  const sigAfter = k => { for (let j = k + 1; j < toks.length; j++) if (toks[j].t !== 'lc' && toks[j].t !== 'bc') return toks[j]; return null; };
  const flush = () => { if (line !== '') { out.push(line.replace(/[ \t]+$/, '')); line = ''; last = null; } };
  const blank = () => { flush(); if (out.length && out[out.length - 1] !== '') out.push(''); };
  const prevLine = () => (out.length ? out[out.length - 1].trim() : '');
  const inBlock = () => !stack.length || stack[stack.length - 1].block;

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k], comment = t.t === 'lc' || t.t === 'bc';
    const closer = t.t === 'p' && (t.v === '}' || t.v === ')' || t.v === ']');

    /* a block ends: finish the last statement and put the brace on its own line */
    if (isBlock(t, '}')) {
      const emptyBody = lastSig && isBlock(lastSig, '{') && last === lastSig;
      if (!emptyBody) {
        if (line !== '' && lastSig && lastSig.t === 'p' && lastSig.v !== ';' && !isBlock(lastSig, '{') && !isBlock(lastSig, '}') && !(lastSig.v === ':' && !lastSig.tern)) line += ';';
        else if (line !== '' && lastSig && lastSig.t !== 'p' && last === lastSig) line += ';';
        flush();
      }
    } else if (t.nl >= 1 && line !== '' && !(lastSig && isBlock(lastSig, '}') && last === lastSig && joinsBlockEnd(lastSig, t))) flush();
    if (t.nl >= 2 && out.length && !prevLine().endsWith('{')) blank();

    /* breathing room around top-level functions and comment blocks */
    if (line === '' && !stmtOpen && blocks <= 1 && inBlock() && out.length) {
      const pl = prevLine(), plain = pl !== '' && !pl.endsWith('{') && !pl.startsWith('//') && !pl.endsWith('*/');
      const fn = t.t === 'id' && t.kw && t.v === 'function';
      if ((fn || (comment && t.nl >= 1)) && plain) blank();
      else if (pl === '}' && !closer && plain) blank();
    }

    if (line === '') {
      const e = stack[stack.length - 1];
      if (closer && e) lineIndent = e.lineIndent;
      else lineIndent = (e ? e.lineIndent + 1 : 0) + (stmtOpen && inBlock() ? 1 : 0);
      line = '  '.repeat(lineIndent);
    } else if (last && space(last, t)) line += t.t === 'lc' ? '  ' : ' ';

    /* the token itself */
    if (t.t === 'bc' && t.v.includes('\n')) {
      const pad = ' '.repeat(line.length + 3);
      line += t.v.split('\n').map((l, n) => (n ? pad + l.trim() : l)).join('\n');
    } else line += t.v;
    last = t;
    if (!comment) lastSig = t;

    /* bookkeeping and the line breaks that follow */
    if (t.t === 'lc') { flush(); continue; }
    if (comment) continue;
    if (t.t === 'p' && (t.v === '{' || t.v === '(' || t.v === '[')) {
      stack.push({ block: t.kind === 'block', lineIndent });
      if (t.kind === 'block') {
        blocks++; stmtOpen = false;
        const n = toks[k + 1];
        if (!(n && isBlock(n, '}'))) flush();
      }
      continue;
    }
    if (closer) {
      stack.pop();
      if (t.kind === 'block') {
        blocks--;
        const n = sigAfter(k);
        if (joinsBlockEnd(t, n)) stmtOpen = true;
        else { stmtOpen = false; const c = toks[k + 1]; if (!(c && c.t === 'lc' && c.nl === 0)) flush(); }
      }
      continue;
    }
    if (t.t === 'p' && t.v === ';' && !t.sep) {
      stmtOpen = false;
      const c = toks[k + 1];
      if (!(c && c.t === 'lc' && c.nl === 0)) flush();
      continue;
    }
    stmtOpen = true;
  }
  flush();
  return out.join('\n') + '\n';
}

if (require.main === module) {
  const args = process.argv.slice(2), check = args[0] === '--check', files = check ? args.slice(1) : args;
  if (!files.length) { console.error('usage: node tools/fmt.js [--check] file.js ...'); process.exit(2); }
  let changed = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8'), res = format(src);
    if (res !== src) { changed++; if (!check) fs.writeFileSync(f, res); }
    console.log((res === src ? 'unchanged  ' : check ? 'would change  ' : 'formatted  ') + f);
  }
  process.exit(check && changed ? 1 : 0);
}
module.exports = { format, tokenize };
