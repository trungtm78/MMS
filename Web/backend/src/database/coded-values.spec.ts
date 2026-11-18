import * as fs from 'fs';
import * as path from 'path';
import {
  APPEAL_OUTCOMES,
  DISCIPLINE_FORMS,
  DISCIPLINE_STATUSES,
  REWARD_AUTHORITIES,
  REWARD_BASES,
  REWARD_FORMS,
} from '../rewards/reward-codes';
import { TRAINING_TYPES } from '../training/dto/create-training.dto';
import { TRAINING_PLAN_STATUSES } from '../training/training-plan-codes';
import { WEAPON_CONDITIONS } from '../weapons/weapon-inventory-codes';

const MIGRATION = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'migrations',
    '026_rewards_discipline_training_plans_weapon_inventory.sql',
  ),
  'utf8',
);

// Values of `CONSTRAINT <name> CHECK (<column> IN ('a', 'b', ...))` in migration 026
function checkedValues(constraint: string): string[] {
  const match = new RegExp(
    `CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(\\s*\\w+\\s+IN\\s*\\(([^)]*)\\)`,
  ).exec(MIGRATION);
  if (!match) throw new Error(`migration 026 has no CHECK ${constraint}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('coded values shared by the API and migration 026', () => {
  it.each([
    ['chk_reward_decisions_form', REWARD_FORMS],
    ['chk_reward_decisions_authority', REWARD_AUTHORITIES],
    ['chk_reward_decisions_basis', REWARD_BASES],
    ['chk_discipline_decisions_form', DISCIPLINE_FORMS],
    ['chk_discipline_decisions_status', DISCIPLINE_STATUSES],
    ['chk_discipline_appeals_outcome', APPEAL_OUTCOMES],
    ['chk_training_plans_type', TRAINING_TYPES],
    ['chk_training_plans_status', TRAINING_PLAN_STATUSES],
    ['chk_weapon_inventory_items_condition', WEAPON_CONDITIONS],
    ['chk_weapon_inventory_items_observed_condition', WEAPON_CONDITIONS],
  ] as const)('%s accepts exactly the API codes', (constraint, codes) => {
    expect(checkedValues(constraint)).toEqual([...codes].sort());
  });

  // District level administrations ended with the two-tier local government model
  it('refuses district-level reward decisions dated from 1 July 2025', () => {
    expect(MIGRATION).toMatch(
      /CONSTRAINT\s+chk_reward_decisions_district_before_2025\s+CHECK\s*\(\s*issuing_authority\s*<>\s*'district'\s+OR\s+issued_date\s*<\s*DATE\s+'2025-07-01'\s*\)/,
    );
  });
});
