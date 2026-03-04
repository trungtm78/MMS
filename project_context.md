# PROJECT CONTEXT

Task ID: TASK-2026-001
Version: v1.0
Date: 2026-03-04

## Mission
- Build a DQTV management platform with 3 subsystems: `Web`, `MilitianApp`, `PoliceApp`.
- `Web` is the central control plane and can execute operations equivalent to mobile apps based on role.
- `MilitianApp` is for militia users.
- `PoliceApp` is for police users.

## Workspace layout

### Root structure
```
C:/MMS
├─ project_context.md
├─ CHANGELOG.md
├─ Promt_Lib/
├─ core/
├─ Web/
├─ MilitianApp/
├─ PoliceApp/
└─ qa/
```

### Shared core (C:/MMS/core)
- `core/frontend/` - shared UI kit, client SDK
- `core/backend/` - shared API, contracts, backend libs
- `core/docs/` - shared documentation (business, technical, testing)
- `core/api/` - OpenAPI/Postman for mms_core
- `core/schemas/` - shared DTO, validation schemas
- `core/libs/` - shared packages
- `core/scripts/` - shared scripts (migrations, seed, utilities)

### Web subsystem (C:/MMS/Web)
- `Web/frontend/` - Web UI source
- `Web/backend/` - Web backend source
- `Web/docs/` - Web-specific documentation
- `Web/Refs/` - Design references

### MilitianApp subsystem (C:/MMS/MilitianApp)
- `MilitianApp/frontend/` - Mobile app source (Flutter)
- `MilitianApp/backend/` - BFF, adapters, mobile-specific services
- `MilitianApp/docs/` - App-specific documentation
- `MilitianApp/Refs/` - Design references

### PoliceApp subsystem (C:/MMS/PoliceApp)
- `PoliceApp/frontend/` - Mobile app source (Flutter)
- `PoliceApp/backend/` - BFF, adapters, mobile-specific services
- `PoliceApp/docs/` - App-specific documentation
- `PoliceApp/Refs/` - Design references

### QA/Testing (C:/MMS/qa)
- `qa/e2e/` - end-to-end tests
- `qa/uat/` - UAT tests
- `qa/unit/` - unit tests
- `qa/integration/` - integration tests
- `qa/rpa/` - RPA flows
- `qa/test-results/` - test outputs and screenshots

## Shared core contract
- Shared API namespace/service: `mms_core`
- Shared API base path: `/api/v1/mms_core`

## Database baseline (dev)
- Engine: PostgreSQL 18
- Host: `localhost`
- Port: `5433`
- Database: `MMS_Core`
- Credentials: `postgres/postgres` (dev only)

## Architecture principles
- One backend + one central database for all channels.
- RBAC + unit scope enforcement on UI and API.
- Event-driven notifications and alerts for near real-time synchronization.
- Immutable audit logging for sensitive operations.
- Device/session security for both web and mobile clients.

## Primary document index (shared)
- `C:/MMS/core/docs/business/01_BUSINESS_FLOW.md`
- `C:/MMS/core/docs/user-stories/US_LIST.md`
- `C:/MMS/core/docs/technical/02_SPEC_v1.0.md`
- `C:/MMS/core/docs/technical/api_specification.md`
- `C:/MMS/core/docs/technical/erd.md`
- `C:/MMS/core/docs/technical/ui_spec.md`
- `C:/MMS/core/docs/testing/03_UAT_CASES.md`
- `C:/MMS/core/docs/testing/03_TEST_SCENARIOS.md`
- `C:/MMS/core/docs/testing/04_E2E_TEST_PLAN.md`
