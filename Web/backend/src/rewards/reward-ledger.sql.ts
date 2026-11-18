import {
  DISCIPLINE_FORM_LABELS,
  REWARD_AUTHORITY_LABELS,
  REWARD_FORM_LABELS,
  sqlLabelCase,
} from './reward-codes';

// Every khen thưởng / kỷ luật entry of a member in one shape, for the profile tab and the
// rewards report: the free-form militia_rewards rows (migration 014) and the typed
// decisions recorded through /rewards and /discipline (migration 026). Columns: id,
// militia_id, reward_type ('reward' | 'discipline'), title, description, issued_date,
// issued_by, status (a discipline decision's status, else NULL), created_at.
// Use it as a subquery: filters on militia_id and issued_date reach each branch's index.
export const REWARD_LEDGER_SQL = `
  SELECT mr.id, mr.militia_id, mr.reward_type, mr.title::text AS title, mr.description,
         mr.issued_date, mr.issued_by::text AS issued_by, NULL::varchar AS status, mr.created_at
  FROM militia_rewards mr
  UNION ALL
  SELECT rd.id, rd.militia_id, 'reward', ${sqlLabelCase('rd.reward_form', REWARD_FORM_LABELS)},
         rd.criteria, rd.issued_date,
         ${sqlLabelCase('rd.issuing_authority', REWARD_AUTHORITY_LABELS)}, NULL, rd.created_at
  FROM reward_decisions rd
  UNION ALL
  SELECT dd.id, dd.militia_id, 'discipline', ${sqlLabelCase('dd.discipline_form', DISCIPLINE_FORM_LABELS)},
         dd.violation, dd.decision_date, dd.issued_by, dd.status, dd.created_at
  FROM discipline_decisions dd`;
