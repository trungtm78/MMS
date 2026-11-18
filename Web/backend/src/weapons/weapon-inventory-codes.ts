// Weapon conditions, as the weapons table (migration 019) and the inventory items table
// (migration 026) constrain them
export const WEAPON_CONDITIONS = ['good', 'damaged', 'maintenance'] as const;
export type WeaponCondition = (typeof WEAPON_CONDITIONS)[number];
