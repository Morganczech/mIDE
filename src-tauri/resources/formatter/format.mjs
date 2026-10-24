import * as prettier from 'prettier';
import * as astro from 'prettier-plugin-astro';

const filename = process.argv[2];
const parsers = { html: 'html', htm: 'html', css: 'css', js: 'babel', mjs: 'babel', cjs: 'babel', jsx: 'babel', ts: 'typescript', tsx: 'typescript', astro: 'astro', json: 'json', md: 'markdown', markdown: 'markdown' };
const parser = parsers[filename?.split('.').pop()?.toLowerCase()];
if (!parser) { process.stderr.write('This file type has no formatter.'); process.exit(1); }
let source = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  source += chunk;
  if (source.length > 16 * 1024 * 1024) { process.stderr.write('Document is too large to format.'); process.exit(1); }
}
try {
  const result = await prettier.format(source, { parser, plugins: parser === 'astro' ? [astro] : [], endOfLine: source.includes('\r\n') ? 'crlf' : 'lf' });
  process.stdout.write(result);
} catch (error) {
  process.stderr.write(error.message ?? String(error)); process.exitCode = 1;
}
