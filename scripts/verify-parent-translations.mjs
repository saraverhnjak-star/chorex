import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}
function readCatalog(locale) {
  const values = {};
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer))
      values[node.name.text] = node.initializer.text;
    ts.forEachChild(node, visit);
  };
  visit(parse(path.join(root, `packages/ui/src/locales/${locale}.ts`)));
  return values;
}
const catalogs = ['de', 'sl', 'hr'].map(readCatalog);
const placeholders = (text) => (text.match(/\{\d+\}/g) ?? []).sort();
for (const catalog of catalogs) {
  assert.deepEqual(
    Object.keys(catalog).sort(),
    Object.keys(catalogs[0]).sort(),
  );
  for (const [key, value] of Object.entries(catalog)) {
    assert.ok(value.trim(), `Empty translation: ${key}`);
    assert.deepEqual(
      placeholders(value),
      placeholders(key),
      `Interpolation mismatch: ${key}`,
    );
  }
}
const brands = new Set(['Amber Aurora']);
const translatedKeys = new Set();
function visitDirectory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'locales') visitDirectory(file);
    } else if (/\.tsx?$/.test(file)) {
      const source = parse(file);
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === 't' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          translatedKeys.add(key);
          if (!brands.has(key))
            for (const catalog of catalogs)
              assert.ok(catalog[key], `Missing translation: ${key} in ${file}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
for (const dir of [
  'apps/parent/app',
  'apps/parent/src',
  'apps/child/app',
  'apps/child/src',
  'packages/ui/src',
])
  visitDirectory(path.join(root, dir));
console.log(
  `PASS: ${translatedKeys.size} translation calls covered; ${Object.keys(catalogs[0]).length} catalog entries per language, with matching parameters.`,
);
