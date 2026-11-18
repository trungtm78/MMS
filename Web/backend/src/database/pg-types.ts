import { types } from 'pg';

// DATE columns hold calendar days. node-postgres would turn them into JavaScript Dates at
// the host's local midnight, which serialise as the previous day east of UTC; keep the
// YYYY-MM-DD text Postgres sends. Timestamps keep their default Date parsing.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// NUMERIC columns (leave and training days, coordinates, scores, payroll amounts) and the
// AVG/SUM/ROUND over them reach clients as JSON numbers, not the "10.0" text node-postgres
// keeps by default. The widest column is DECIMAL(12,2), exact to the cent in a double.
// BIGINT (COUNT) stays text: it may exceed Number.MAX_SAFE_INTEGER.
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number(value));
