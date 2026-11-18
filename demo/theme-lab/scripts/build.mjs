import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import { extract } from './extract.mjs';
import StyleDictionary from 'style-dictionary';
import { themes, tokenFiles } from '../themes.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const check = process.argv.includes('--check');
const outputs = {};
let css = '/* Derived from Atlas UI 3 PR #1175, 1f9ba9851a735c9ecdc8d97cee2d61f16f1a8904. NovusGFX MIT; see upstream/LICENSE. */\n';
for (const [i, file] of tokenFiles.entries()) {
  const ast = postcss.parse(await fs.readFile(`upstream/source-tokens/${file}`, 'utf8'));
  ast.walkRules(rule => { if (rule.selector === ':root') rule.selector = `[data-atlas-theme="${themes[i]}"]`; else rule.remove(); });
  css += ast.toString() + '\n';
}
for (const file of ['retroCatalog.generated.css', 'retroChrome.generated.css', 'theme-presets.css']) css += `\n/* ${file} */\n${extract(await fs.readFile(`upstream/${file}`, 'utf8'))}\n`;
outputs['themes.css'] = css;
const sd = new StyleDictionary({source: ['tokens/semantic.json'], log: {verbosity: 'silent'}, platforms: {css: {transformGroup: 'css', files: [{destination: 'semantic.css', format: 'css/variables', options: {showFileHeader: false}}]}}});
const files = await sd.formatPlatform('css');
outputs['semantic.css'] = files[0].output;
for (const [file, content] of Object.entries(outputs)) {
  const target = path.join('generated', file);
  if (check) { if (await fs.readFile(target, 'utf8').catch(() => '') !== content) throw new Error(`Generated drift: ${target}. Run npm run build.`); }
  else await fs.writeFile(target, content);
}
const manifest = JSON.parse(await fs.readFile('upstream-hashes.json', 'utf8'));
for (const [file, hash] of Object.entries(manifest)) {
  if (crypto.createHash('sha256').update(await fs.readFile(`upstream/${file}`)).digest('hex') !== hash) throw new Error(`Pinned source changed: ${file}`);
}
console.log(check ? 'Generated files and pinned sources match.' : 'Built semantic tokens and three scoped themes.');
