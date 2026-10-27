// Some languages need plural forms that rarely matter in this tool (Spanish
// uses "many" for exact millions, e.g. 1 000 000). Rather than asking every
// translator to write them, missing forms fall back to the `_other` text.
// This keeps the locale files with the same keys in every language.

type Tree = { [k: string]: unknown };
const SUFFIX = /_(zero|one|two|few|many|other)$/;

export function fillPluralForms(tree: Tree, lang: string): Tree {
  const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  const out: Tree = {};
  for (const [k, v] of Object.entries(tree)) {
    out[k] = v !== null && typeof v === 'object' ? fillPluralForms(v as Tree, lang) : v;
  }
  for (const k of Object.keys(tree)) {
    if (!k.endsWith('_other')) continue;
    const base = k.replace(SUFFIX, '');
    for (const cat of categories) {
      const key = `${base}_${cat}`;
      if (!(key in out)) out[key] = tree[k];
    }
  }
  return out;
}
