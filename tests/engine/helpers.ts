import { runStepByStep, type RunResult, type Step, type Table } from '../../src/engine';

export const mascotas: Table = {
  name: 'Mascotas',
  columns: [
    { name: 'Especie', type: 'text' },
    { name: 'Nombre', type: 'text' },
    { name: 'Edad', type: 'int' },
  ],
  rows: [
    ['Perro', 'Mora', 7],
    ['Perro', 'Dasha', 9],
    ['Gato', 'Bigotes', 3],
  ],
};

export const pets: Table = {
  name: 'Pets',
  columns: [
    { name: 'Species', type: 'text' },
    { name: 'Name', type: 'text' },
    { name: 'Age', type: 'int' },
  ],
  rows: [
    ['Dog', 'Mora', 7],
    ['Dog', 'Dasha', 9],
    ['Cat', 'Bigotes', 3],
  ],
};

/** A richer table with NULLs, decimals and dates. */
export const ventas: Table = {
  name: 'Ventas',
  columns: [
    { name: 'Region', type: 'text' },
    { name: 'Vendedor', type: 'text' },
    { name: 'Monto', type: 'decimal' },
    { name: 'Unidades', type: 'int' },
    { name: 'Fecha', type: 'date' },
  ],
  rows: [
    ['Norte', 'Ana', 100.5, 2, '2024-01-10'],
    ['Norte', 'Luis', 200, null, '2024-02-15'],
    ['Sur', 'Ana', null, 5, '2024-01-20'],
    ['Sur', 'Eva', 50.25, 1, '2024-03-01'],
    ['Este', 'Luis', 300, 4, '2024-03-05'],
    [null, 'Eva', 10, 1, null],
  ],
};

export function run(sql: string, tables: Table[] = [mascotas, ventas]): Step[] {
  const r = runStepByStep(sql, tables);
  if (!r.ok) throw new Error(`Unexpected error ${r.error.code} ${JSON.stringify(r.error.params)}`);
  return r.steps;
}

export function runError(sql: string, tables: Table[] = [mascotas, ventas]) {
  const r: RunResult = runStepByStep(sql, tables);
  if (r.ok) throw new Error(`Expected an error for: ${sql}`);
  return r.error;
}

export const stages = (steps: Step[]) => steps.map((s) => s.stage);
export const result = (steps: Step[]) => steps[steps.length - 1]!.rows.map((r) => r.values);
export const step = (steps: Step[], stage: Step['stage']) => steps.find((s) => s.stage === stage)!;
