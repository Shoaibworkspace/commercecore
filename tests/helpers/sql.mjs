import { readFileSync } from 'node:fs';

// Split SQL scripts without breaking semicolons/apostrophes in catalog text.
// Preserve trigger bodies, including nested CASE ... END expressions.
export function sqlStatements(relativePath) {
  const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
  const result = [];
  let statement = '',
    quoted = false,
    comment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index],
      next = source[index + 1];
    if (comment) {
      if (char === '\n') {
        comment = false;
        statement += '\n';
      }
      continue;
    }
    if (!quoted && char === '-' && next === '-') {
      comment = true;
      index++;
      continue;
    }
    if (char === "'") {
      if (quoted && next === "'") {
        statement += "''";
        index++;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted && char === ';') {
      if (/^\s*CREATE\s+TRIGGER\b/i.test(statement)) {
        const tokens =
          statement.replace(/'(?:''|[^'])*'/g, '').match(/\b(?:BEGIN|CASE|END)\b/gi) ?? [];
        const depth = tokens.reduce(
          (sum, token) => sum + (token.toUpperCase() === 'END' ? -1 : 1),
          0,
        );
        if (depth > 0) {
          statement += char;
          continue;
        }
      }
      if (statement.trim()) result.push(statement.trim());
      statement = '';
    } else statement += char;
  }
  if (statement.trim()) result.push(statement.trim());
  return result;
}
export async function applySQL(db, file) {
  await db.batch(sqlStatements(file).map((sql) => db.prepare(sql)));
}
