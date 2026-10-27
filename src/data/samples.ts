// Sample table and starter query. Table, column, species and breed names come
// from the active locale's `sample` section, so each language gets its own
// table (Mascotas / Pets). NULLs are deliberate: they show how WHERE and the
// aggregates treat them.

import type { Table, Value } from '../engine';

type SpeciesKey = 'dog' | 'cat' | 'rabbit' | 'bird' | 'hamster';
type ColorKey = 'black' | 'white' | 'brown' | 'gray' | 'golden' | 'orange' | 'cream' | 'tricolor';
type BreedKey =
  | 'labrador' | 'poodle' | 'germanShepherd' | 'beagle' | 'mixedDog'
  | 'siamese' | 'persian' | 'european' | 'mixedCat'
  | 'dwarf' | 'lop'
  | 'canary' | 'parakeet' | 'cockatiel'
  | 'syrian' | 'russian';

export interface SampleVocabulary {
  table: string;
  columns: { id: string; name: string; species: string; breed: string; color: string; age: string; weight: string; adoption: string };
  species: Record<SpeciesKey, string>;
  breeds: Record<BreedKey, string>;
  colors: Record<ColorKey, string>;
  aliases: { count: string };
}

// [Id, Name, species, breed, age, weight kg, adoption date]
type Row = [number, string, SpeciesKey, BreedKey | null, number | null, number | null, string | null];

// Color of each row, in the same order as ROWS (null = unknown, on purpose).
const COLORS: (ColorKey | null)[] = [
  'golden', 'black', 'gray', 'cream', 'tricolor', 'orange', 'white', 'cream', 'brown', 'black',
  'white', 'orange', null, 'tricolor', 'golden', 'black', 'golden', 'white', 'orange', 'tricolor',
  'gray', 'brown', 'black', 'white', 'brown', 'cream', 'black', 'gray', 'orange', 'tricolor',
  'black', 'white', 'white', 'black', null, 'golden', 'gray', 'brown', 'golden', 'white',
  'golden', 'orange', 'gray', 'black', 'white', 'brown', null, 'brown', 'gray', 'cream',
];

const ROWS: Row[] = [
  [1, 'Mora', 'dog', 'labrador', 7, 28.5, '2019-03-14'],
  [2, 'Dasha', 'dog', 'germanShepherd', 9, 31.2, '2017-08-02'],
  [3, 'Bigotes', 'cat', 'european', 3, 4.1, '2023-01-20'],
  [4, 'Luna', 'cat', 'siamese', 5, 3.8, '2021-06-11'],
  [5, 'Rocky', 'dog', 'beagle', 4, 12.4, '2022-02-27'],
  [6, 'Coco', 'bird', 'parakeet', 2, 0.04, '2024-04-05'],
  [7, 'Tambor', 'rabbit', 'dwarf', 3, 1.2, '2023-09-18'],
  [8, 'Simba', 'cat', 'persian', 8, 5.6, '2018-11-30'],
  [9, 'Max', 'dog', 'mixedDog', 6, 18.0, '2020-05-09'],
  [10, 'Nala', 'cat', null, 2, 3.2, '2024-02-14'],
  [11, 'Toby', 'dog', 'poodle', 11, 7.9, '2015-07-21'],
  [12, 'Pipo', 'bird', 'canary', 1, 0.02, '2025-01-08'],
  [13, 'Canela', 'dog', 'mixedDog', null, 15.3, '2022-10-03'],
  [14, 'Michi', 'cat', 'mixedCat', 4, null, '2022-03-16'],
  [15, 'Bolita', 'hamster', 'syrian', 1, 0.15, '2025-03-02'],
  [16, 'Thor', 'dog', 'germanShepherd', 5, 34.0, '2021-01-25'],
  [17, 'Kira', 'dog', 'labrador', 3, 26.7, '2023-05-30'],
  [18, 'Oreo', 'rabbit', 'lop', 4, 2.3, '2022-08-12'],
  [19, 'Garfield', 'cat', 'persian', 10, 6.4, '2016-12-01'],
  [20, 'Lola', 'dog', 'beagle', 8, 11.8, '2018-04-19'],
  [21, 'Kiwi', 'bird', 'cockatiel', 3, 0.09, '2023-07-07'],
  [22, 'Manchas', 'dog', null, 2, 9.5, null],
  [23, 'Sombra', 'cat', 'mixedCat', 6, 4.7, '2020-09-28'],
  [24, 'Pelusa', 'rabbit', 'dwarf', 2, 1.0, '2024-06-15'],
  [25, 'Bruno', 'dog', 'mixedDog', 12, 22.1, '2014-02-10'],
  [26, 'Mia', 'cat', 'siamese', 1, 2.6, '2025-02-22'],
  [27, 'Rex', 'dog', 'germanShepherd', 7, 33.5, '2019-10-08'],
  [28, 'Ñoqui', 'hamster', 'russian', 2, 0.04, '2024-11-11'],
  [29, 'Sol', 'bird', 'canary', null, 0.02, '2023-03-03'],
  [30, 'Frida', 'cat', 'european', 9, 4.9, '2017-05-17'],
  [31, 'Zeus', 'dog', 'labrador', 10, 30.8, '2016-01-29'],
  [32, 'Copito', 'rabbit', 'lop', 5, null, '2021-12-24'],
  [33, 'Lucas', 'dog', 'poodle', 3, 6.2, '2023-08-09'],
  [34, 'Pantera', 'cat', 'mixedCat', 7, 5.1, '2019-06-02'],
  [35, 'Chispa', 'dog', 'beagle', 1, 8.7, '2025-04-01'],
  [36, 'Paco', 'bird', 'parakeet', 4, 0.04, '2022-01-13'],
  [37, 'Tiza', 'cat', null, null, 3.9, '2024-08-20'],
  [38, 'Duque', 'dog', 'mixedDog', 9, 19.6, '2017-11-05'],
  [39, 'Galleta', 'hamster', 'syrian', 1, 0.13, '2025-05-27'],
  [40, 'Nieve', 'rabbit', 'dwarf', 6, 1.4, '2020-03-08'],
  [41, 'Bella', 'dog', 'labrador', 4, 27.3, '2022-06-23'],
  [42, 'Félix', 'cat', 'european', 5, 4.4, '2021-10-10'],
  [43, 'Lima', 'bird', 'cockatiel', 6, 0.1, '2020-07-14'],
  [44, 'Trueno', 'dog', 'germanShepherd', 2, 29.0, '2024-01-31'],
  [45, 'Misha', 'cat', 'persian', 3, 4.8, null],
  [46, 'Choco', 'dog', 'poodle', 13, 8.3, '2013-09-12'],
  [47, 'Pompón', 'rabbit', null, 1, 0.9, '2025-06-06'],
  [48, 'Lupe', 'dog', 'mixedDog', 5, null, '2021-04-04'],
  [49, 'Tom', 'cat', 'mixedCat', 11, 5.3, '2015-10-27'],
  [50, 'Maní', 'hamster', 'russian', 1, 0.03, '2025-07-19'],
];

export function sampleTable(v: SampleVocabulary): Table {
  const c = v.columns;
  return {
    name: v.table,
    columns: [
      { name: c.id, type: 'int' },
      { name: c.name, type: 'text' },
      { name: c.species, type: 'text' },
      { name: c.breed, type: 'text' },
      { name: c.color, type: 'text' },
      { name: c.age, type: 'int' },
      { name: c.weight, type: 'decimal' },
      { name: c.adoption, type: 'date' },
    ],
    rows: ROWS.map(([id, name, sp, br, age, weight, date], i): Value[] => {
      const color = COLORS[i] ?? null;
      return [id, name, v.species[sp], br ? v.breeds[br] : null, color ? v.colors[color] : null, age, weight, date];
    }),
  };
}

const ident = (s: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `[${s}]`);

/** Query shown in the editor on first load; from then on the query is the user's own. */
export function starterQuery(v: SampleVocabulary): string {
  return `SELECT ${ident(v.columns.species)}, COUNT(*) AS ${ident(v.aliases.count)}\nFROM ${ident(v.table)}\nGROUP BY ${ident(v.columns.species)}`;
}
