// T-SQL LIKE: % any string, _ one character, [abc] / [a-z] sets, [^abc] negated sets.
// Case-insensitive like the default SQL Server collation.

const cache = new Map<string, RegExp>();

export function likeToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '%') re += '[\\s\\S]*';
    else if (c === '_') re += '[\\s\\S]';
    else if (c === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close === -1) {
        re += '\\[';
        continue;
      }
      let body = pattern.slice(i + 1, close);
      const negate = body.startsWith('^');
      if (negate) body = body.slice(1);
      const escaped = body.replace(/[\\\]]/g, '\\$&').replace(/^\^/, '\\^');
      re += `[${negate ? '^' : ''}${escaped}]`;
      i = close;
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // SQL Server ignores trailing spaces of the value being matched.
  const compiled = new RegExp(`^${re}\\s*$`, 'iu');
  cache.set(pattern, compiled);
  return compiled;
}

export function like(value: string, pattern: string): boolean {
  return likeToRegExp(pattern).test(value);
}
