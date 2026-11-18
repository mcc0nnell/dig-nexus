import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { themes, isTheme, tokenFiles } from '../themes.mjs';
import { extract } from '../scripts/extract.mjs';
test('strict allowlist and split selector AST', () => {
  assert.equal(themes.length, 3);
  for (const value of ['win95', '', null, '__proto__']) assert.equal(isTheme(value), false);
  const output = extract('[data-atlas-theme="mac7"] .a, [data-atlas-theme="win95"] .b {color:red}');
  assert.match(output, /mac7/); assert.doesNotMatch(output, /win95/);
});
test('deterministic build and drift detection', async () => {
  execFileSync('node', ['scripts/build.mjs', '--check']);
  const before = await fs.readFile('generated/themes.css');
  execFileSync('node', ['scripts/build.mjs']);
  assert.deepEqual(await fs.readFile('generated/themes.css'), before);
  try {
    await fs.appendFile('generated/themes.css', '\n/* drift */');
    assert.throws(() => execFileSync('node', ['scripts/build.mjs', '--check'], {stdio: 'pipe'}));
  } finally { await fs.writeFile('generated/themes.css', before); }
});
test('all extracted selectors scoped to exactly three themes; original tokens projected', async () => {
  const css = await fs.readFile('generated/themes.css', 'utf8');
  const found = new Set();
  postcss.parse(css).walkRules(rule => selectorParser().astSync(rule.selector).each(selector => {
    const first = selector.nodes[0];
    assert.equal(first.attribute, 'data-atlas-theme'); assert.ok(isTheme(first.value)); found.add(first.value);
  }));
  assert.deepEqual([...found].sort(), [...themes].sort());
  for (const [i, file] of tokenFiles.entries()) {
    const declarations = [];
    postcss.parse(await fs.readFile(`upstream/source-tokens/${file}`, 'utf8')).walkDecls(d => declarations.push([d.prop, d.value]));
    const scoped = postcss.parse(css).nodes.find(n => n.selector === `[data-atlas-theme="${themes[i]}"]`);
    assert.deepEqual(scoped.nodes.filter(n => n.type === 'decl').map(d => [d.prop,d.value]), declarations);
  }
});
test('MIT attribution and no remote assets or inline JS', async () => {
  assert.match(await fs.readFile('upstream/LICENSE', 'utf8'), /MIT License/);
  assert.match(await fs.readFile('upstream/SOURCE.md', 'utf8'), /1f9ba9851a735c9ecdc8d97cee2d61f16f1a8904/);
  for (const file of ['index.html', 'layout.css', 'generated/themes.css', 'app.mjs']) {
    const content = await fs.readFile(file, 'utf8');
    assert.doesNotMatch(content, /https?:\/\/|@import|@font-face|localStorage|sessionStorage|fetch\(/);
  }
  const html = await fs.readFile('index.html', 'utf8');
  assert.doesNotMatch(html, /\son\w+=/); assert.match(html, /<script type="module" src="app.mjs"><\/script>/);
});
