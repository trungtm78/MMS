# E2E TEST PLAN — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

---

## TOOL SELECTION

| US | Risk | Tool | Lý do |
|----|------|------|-------|
| US-SS-01 | 🔴 | Playwright | Web UI — keyboard + mouse interaction |
| US-SS-02 | 🟡 | Playwright | API mock + real search |
| US-SS-03 | 🔴 | Playwright | Modal flow + bind-back |
| US-SS-04 | 🟡 | Playwright (API test) | HTTP endpoint validation |
| US-SS-07 | 🟡 | Playwright | Context dependency chain |
| US-SS-08 | 🟡 | Playwright | Full form flow |
| US-SS-09 | 🟡 | Playwright | Full form flow |
| US-SS-06 | 🟢 | Playwright (unit via Vitest) | Static filter — unit test sufficient |
| US-SS-10 | 🟢 | Playwright | Admin form smoke |
| US-SS-11 | 🟢 | Playwright | Filter smoke |

---

## PLAYWRIGHT TEST INVENTORY

### specs/smart-select-core.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-01 | AC-1 | E2E-SS01-HP-001 | happy-path | P0 | Focus field → dropdown opens |
| US-SS-01 | AC-1 | E2E-SS01-HP-002 | happy-path | P0 | Click field → dropdown opens |
| US-SS-01 | AC-2 | E2E-SS01-HP-003 | happy-path | P0 | ArrowDown → item[0] active |
| US-SS-01 | AC-2 | E2E-SS01-HP-004 | happy-path | P0 | ArrowDown × 2 → item[1] active |
| US-SS-01 | AC-3 | E2E-SS01-HP-005 | happy-path | P0 | ArrowUp clamp at item[0] |
| US-SS-01 | AC-4 | E2E-SS01-HP-006 | happy-path | P0 | Enter → onChange called, dropdown closed |
| US-SS-01 | AC-5 | E2E-SS01-HP-007 | happy-path | P0 | Esc → dropdown closed, value unchanged |
| US-SS-01 | AC-6 | E2E-SS01-HP-008 | happy-path | P0 | Tab → active item selected, focus moves |
| US-SS-01 | AC-7 | E2E-SS01-HP-009 | happy-path | P0 | Hover item → highlight |
| US-SS-01 | AC-7 | E2E-SS01-HP-010 | happy-path | P0 | Click item → selected, dropdown closed |
| US-SS-01 | AC-8 | E2E-SS01-HP-011 | happy-path | P0 | Click outside → dropdown closed |
| US-SS-01 | AC-9 | E2E-SS01-NP-001 | negative-path | P0 | Required + blur → error visible |
| US-SS-01 | AC-9 | E2E-SS01-NP-002 | negative-path | P0 | Select item → required error disappears |
| US-SS-01 | AC-11 | E2E-SS01-HP-012 | happy-path | P1 | Clear button clears selection |
| US-SS-01 | AC-12 | E2E-SS01-HP-013 | happy-path | P1 | Loading state visible during fetch |
| US-SS-01 | AC-13 | E2E-SS01-HP-014 | happy-path | P1 | Pre-selected value shows label |
| US-SS-01 | AC-10 | E2E-SS01-HP-015 | happy-path | P1 | Disabled — click does nothing |

### specs/smart-select-search.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-02 | AC-1 | E2E-SS02-HP-001 | happy-path | P0 | Type "nguyen" → API call → results |
| US-SS-02 | AC-2 | E2E-SS02-HP-002 | happy-path | P0 | Type "nguyen van an" → match unaccent |
| US-SS-02 | AC-3 | E2E-SS02-HP-003 | happy-path | P0 | Type phone → match |
| US-SS-02 | AC-7 | E2E-SS02-HP-004 | happy-path | P1 | Loading spinner during fetch |
| US-SS-02 | AC-8 | E2E-SS02-NP-001 | negative-path | P0 | API error → error state in dropdown |
| US-SS-02 | AC-10 | E2E-SS02-BV-001 | boundary | P1 | Debounce: rapid type → 1 API call |
| US-SS-06 | AC-2 | E2E-SS06-HP-001 | happy-path | P1 | Static: type "cong an" → normalizeVi |
| US-SS-06 | AC-3 | E2E-SS06-HP-002 | happy-path | P1 | Static: type acronym → match |

### specs/smart-select-create.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-03 | AC-1 | E2E-SS03-HP-001 | happy-path | P0 | 0 results → "Không tìm thấy" message |
| US-SS-03 | AC-1 | E2E-SS03-HP-002 | happy-path | P0 | canCreate=true → "Tạo mới" button visible |
| US-SS-03 | AC-5 | E2E-SS03-NP-001 | negative-path | P0 | canCreate=false → button NOT visible |
| US-SS-03 | AC-2 | E2E-SS03-HP-003 | happy-path | P0 | Click "Tạo mới" → modal opens |
| US-SS-03 | AC-2 | E2E-SS03-HP-004 | happy-path | P0 | Keyword prefilled in modal form |
| US-SS-03 | AC-3 | E2E-SS03-HP-005 | happy-path | P0 | Submit modal → success → modal closed |
| US-SS-03 | AC-3 | E2E-SS03-HP-006 | happy-path | P0 | New record auto-selected in SmartSelect |
| US-SS-03 | AC-4 | E2E-SS03-HP-007 | happy-path | P0 | Cancel modal → SmartSelect unchanged |
| US-SS-03 | AC-6 | E2E-SS03-NP-002 | negative-path | P0 | Required modal field missing → error |
| US-SS-03 | AC-7 | E2E-SS03-NP-003 | negative-path | P1 | Conflict 409 → error inline in modal |
| US-SS-03 | AC-8 | E2E-SS03-HP-008 | happy-path | P1 | Submit loading → button disabled |
| US-SS-03 | AC-9 | E2E-SS03-BV-001 | boundary | P1 | Partial results + "Tạo mới" coexist |

### specs/smart-select-context.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-07 | AC-1 | E2E-SS07-HP-001 | happy-path | P0 | context filter → searchFn receives unitScope |
| US-SS-07 | AC-2 | E2E-SS07-HP-002 | happy-path | P0 | Parent change → child reset + refetch |
| US-SS-07 | AC-3 | E2E-SS07-NP-001 | negative-path | P0 | context empty → child disabled |

### specs/task-create.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-08 | AC-1 | E2E-SS08-HP-001 | happy-path | P0 | Search militia → select → assigneeId bound |
| US-SS-08 | AC-1 | E2E-SS08-HP-002 | happy-path | P0 | Submit full form → POST /tasks 201 |
| US-SS-08 | AC-2 | E2E-SS08-NP-001 | negative-path | P0 | Missing assigneeId → validation error |
| US-SS-08 | AC-2 | E2E-SS08-NP-002 | negative-path | P0 | Missing title → error |
| US-SS-08 | AC-3 | E2E-SS08-HP-003 | happy-path | P0 | Quick-create militia → auto-bind |
| US-SS-08 | AC-4 | E2E-SS08-NP-003 | negative-path | P1 | dqtv user → form tạo ẩn |

### specs/attendance-form.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-09 | AC-1 | E2E-SS09-HP-001 | happy-path | P0 | SmartSelect militia + period hoạt động |
| US-SS-09 | AC-2 | E2E-SS09-HP-002 | happy-path | P0 | Period chỉ hiện status=open |
| US-SS-09 | AC-3 | E2E-SS09-HP-003 | happy-path | P0 | Militia filter theo user unitScope |
| US-SS-09 | AC-1 | E2E-SS09-HP-004 | happy-path | P0 | Submit → POST /attendance 201 |
| US-SS-09 | AC-1 | E2E-SS09-NP-001 | negative-path | P0 | Submit thiếu militiaId → error |

### specs/user-form.spec.ts

| US | AC | Scenario ID | Category | Priority | Description |
|----|----|-----------  |----------|----------|-------------|
| US-SS-10 | AC-1 | E2E-SS10-HP-001 | happy-path | P1 | Role SmartSelect → select → bound |
| US-SS-10 | AC-2 | E2E-SS10-HP-002 | happy-path | P1 | role=system_admin → unitScope disabled |
| US-SS-10 | AC-3 | E2E-SS10-HP-003 | happy-path | P1 | Change role → unitScope clears |

---

## SCREENSHOT REQUIREMENTS

### US-SS-01 (🔴) — Required Screenshots
| Step | File name pattern |
|----|-------------------|
| SmartSelect closed state | `ss01-step01-closed.png` |
| SmartSelect open with results | `ss01-step02-open-results.png` |
| Item active (keyboard nav) | `ss01-step03-keyboard-active.png` |
| Item selected (input shows label) | `ss01-step04-selected.png` |
| Required validation error | `ss01-error01-required.png` |
| Loading state | `ss01-step05-loading.png` |

### US-SS-03 (🔴) — Required Screenshots
| Step | File name pattern |
|----|-------------------|
| Empty state "Không tìm thấy" | `ss03-step01-empty-state.png` |
| "Tạo mới" button visible | `ss03-step02-create-btn.png` |
| Quick-create modal open | `ss03-step03-modal-open.png` |
| Modal with prefilled keyword | `ss03-step04-modal-prefill.png` |
| Modal submit loading | `ss03-step05-modal-loading.png` |
| Create success, item bound | `ss03-step06-bound-success.png` |
| Modal validation error | `ss03-error01-modal-validation.png` |

### US-SS-08 (🟡) — Required Screenshots
| Step | File name pattern |
|----|-------------------|
| Task form open | `ss08-step01-form.png` |
| Militia SmartSelect searching | `ss08-step02-search.png` |
| Assignee selected | `ss08-step03-selected.png` |
| Form submitted successfully | `ss08-step04-success.png` |
| Validation errors | `ss08-error01-validation.png` |

---

## TRACEABILITY MATRIX

| Requirement | AC | Scenario ID | Test file | Status |
|-------------|----|-----------  |-----------|--------|
| US-SS-01 | AC-1 | E2E-SS01-HP-001 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-2 | E2E-SS01-HP-003..005 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-3 | E2E-SS01-HP-005 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-4 | E2E-SS01-HP-006 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-5 | E2E-SS01-HP-007 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-6 | E2E-SS01-HP-008 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-7 | E2E-SS01-HP-009..010 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-8 | E2E-SS01-HP-011 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-9 | E2E-SS01-NP-001..002 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-11 | E2E-SS01-HP-012 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-12 | E2E-SS01-HP-013 | smart-select-core.spec.ts | Pending |
| US-SS-01 | AC-13 | E2E-SS01-HP-014 | smart-select-core.spec.ts | Pending |
| US-SS-02 | AC-1..3 | E2E-SS02-HP-001..003 | smart-select-search.spec.ts | Pending |
| US-SS-02 | AC-8 | E2E-SS02-NP-001 | smart-select-search.spec.ts | Pending |
| US-SS-03 | AC-1..9 | E2E-SS03-HP-001..008, NP-001..003 | smart-select-create.spec.ts | Pending |
| US-SS-07 | AC-1..3 | E2E-SS07-HP-001..002, NP-001 | smart-select-context.spec.ts | Pending |
| US-SS-08 | AC-1..4 | E2E-SS08-HP-001..003, NP-001..003 | task-create.spec.ts | Pending |
| US-SS-09 | AC-1..3 | E2E-SS09-HP-001..004, NP-001 | attendance-form.spec.ts | Pending |
| US-SS-10 | AC-1..3 | E2E-SS10-HP-001..003 | user-form.spec.ts | Pending |

---

## TEST DATA (Fixtures)

### Seed Users (from 001_initial_data.sql)
| Username | Password | Role |
|---|---|---|
| admin | 123456 | system_admin |
| dqtv001 | 123456 | militia |

### Militia Records (seed)
| militiaCode | fullName | Phone | unitCode |
|---|---|---|---|
| HCM-PHD-T12-0001 | Nguyễn Văn An | 0909123456 | PHU_DINH_KP1 |
| HCM-PHD-T12-0002 | Trần Thị Bình | 0909123457 | PHU_DINH_KP1 |
| HCM-PHD-T12-0003 | Lê Văn Cường | 0909123458 | PHU_DINH_KP1 |

### Test SmartSelect Page (for isolated E2E testing)
Create a test harness page at `/test/smart-select` that renders SmartSelect in isolation:
- With real API (militia search)
- With static options (role enum)
- With mock data (controlled)
