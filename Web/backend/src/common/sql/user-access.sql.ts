// SQL fragments shared by every query that reports a user's roles or unit scope, so
// the admin API, /users/me and the auth token all describe access the same way.
// Arguments are SQL expressions written in code (a column or a $n placeholder),
// never request input.

// Every role code of `r` (roles joined through user_roles), as a text array
export const ROLE_CODES_AGG = `COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}')`;

// Unit codes of the user's militia profiles, as a text array. Aliases are unusual on
// purpose so the fragment can sit inside queries that already use u/mp.
export const militiaUnitsOf = (userIdSql: string) => `ARRAY(
  SELECT pu.code FROM militia_profiles pmp JOIN units pu ON pu.id = pmp.unit_id
  WHERE pmp.user_id = ${userIdSql})`;

// Whether a user belongs to a unit: through a militia profile in it or an account scope on it
export const userInUnit = (userIdSql: string, unitCodeSql: string) => `(
  EXISTS (SELECT 1 FROM militia_profiles uim JOIN units uimu ON uimu.id = uim.unit_id
          WHERE uim.user_id = ${userIdSql} AND uimu.code = ${unitCodeSql})
  OR EXISTS (SELECT 1 FROM user_unit_scopes uis JOIN units uisu ON uisu.id = uis.unit_id
             WHERE uis.user_id = ${userIdSql} AND uisu.code = ${unitCodeSql}))`;

// Every account scope of the user as a unit code, '*' for a ward-wide ('all') scope. Unit
// staff may manage an account only when every entry is their own unit.
export const unitScopeCodesOf = (userIdSql: string) => `ARRAY(
  SELECT CASE WHEN sc.scope_type = 'all' THEN '*' ELSE scu.code END
  FROM user_unit_scopes sc
  JOIN units scu ON scu.id = sc.unit_id
  WHERE sc.user_id = ${userIdSql}
  ORDER BY 1)`;

// The user's unit scope as carried in the auth token: an 'all' scope is ward-wide
// (NULL); with several rows the broadest scope wins, then the unit code
export const unitScopeOf = (userIdSql: string) => `(
  SELECT CASE WHEN uus.scope_type = 'all' THEN NULL ELSE un.code END
  FROM user_unit_scopes uus
  JOIN units un ON un.id = uus.unit_id
  WHERE uus.user_id = ${userIdSql}
  ORDER BY CASE uus.scope_type
             WHEN 'all' THEN 0 WHEN 'subordinate' THEN 1 WHEN 'unit' THEN 2 ELSE 3
           END, un.code
  LIMIT 1)`;
