# QA & Testing

Cross-system testing assets for MMS platform.

## Structure
- `e2e/` - End-to-end tests (Playwright)
- `uat/` - UAT automation tests
- `unit/` - Unit tests
- `integration/` - Integration tests
- `rpa/` - RPA flows (TagUI)
- `test-results/` - Test outputs, screenshots, coverage reports

## Ownership
- Tests specific to one subsystem should live in that subsystem's directory.
- Cross-system integration tests belong here.
- E2E tests covering Web + App flows belong here.
