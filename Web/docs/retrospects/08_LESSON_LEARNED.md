# LESSON LEARNED
Task: TASK-2026-001 | Date: 2026-03-08 | Sprint: Web Module - Auth
Task: TASK-SS-2026-001 | Date: 2026-03-09 | Sprint: Web Module - SmartSelect (REWORK cycle)

---

## LL-1 BUGS (BUILD)

### BUG-001: LoginDto bị class-validator strips toàn bộ body
- **Symptom**: Login trả về 401 dù credentials đúng — username/password là null trong controller
- **Root Cause**: `LoginDto` không có `@IsString()` / `@IsNotEmpty()` decorators → `ValidationPipe({ whitelist: true })` loại bỏ tất cả properties không có decorator → `dto.username = undefined` → raw SQL query với `$1 = null`
- **Fix**: Thêm class-validator decorators vào tất cả DTO properties
- **Prevention**: Template DTO mới phải có decorators từ đầu. Tạo unit test cho DTO validation. Thêm vào checklist Phase 1: "Mọi DTO phải có @IsString/@IsNotEmpty"

### BUG-002: Axios named type exports fail trong Vite dev mode
- **Symptom**: Trang trắng, browser console: "axios.js does not provide an export named 'AxiosInstance'"
- **Root Cause**: Vite phân biệt type imports vs value imports. `import { AxiosInstance } from 'axios'` trong ES module context thất bại khi `AxiosInstance` là TypeScript type-only (không có giá trị JS)
- **Fix**: `import type { AxiosInstance, ... } from 'axios'` — dùng `import type` cho type-only imports
- **Prevention**: Mọi type-only imports từ third-party libs nên dùng `import type`. ESLint rule `@typescript-eslint/consistent-type-imports` enforce điều này

### BUG-003: LoginPage không navigate sau khi login thành công
- **Symptom**: Sau khi login 200 OK, app vẫn hiển thị login form. `dashboard-overview` không bao giờ xuất hiện
- **Root Cause**: Route `/login` render `LoginPage` trực tiếp không qua `ProtectedRoute`. Sau khi `setUser()`, React re-render `LoginPage` nhưng không có `Navigate` để redirect
- **Fix**: Thêm `if (isAuthenticated) return <Navigate to="/dashboard" replace />` sau tất cả hooks trong `LoginPage`
- **Prevention**: Mọi page components có auth state phải handle redirect case. Viết E2E test kiểm tra navigation TRƯỚC khi implement (pre-commitment đã có nhưng chưa test navigation)

### BUG-004: Integration test dùng getDataSourceToken() nhưng TypeORM DataSource không resolve
- **Symptom**: `beforeAll` trong integration test crash → 5/8 tests fail (HP paths cần user thực)
- **Root Cause**: Jest `rootDir: 'src'` + NestJS test module có thể không load `.env` đúng cách → DataSource chưa connected khi test user INSERT
- **Fix**: Dùng `pg.Client` trực tiếp để create/cleanup test users, tách khỏi NestJS test module
- **Prevention**: Integration tests nên luôn dùng `pg.Client` thuần cho setup/teardown, không dựa vào NestJS DI

### BUG-005: Admin route không render ForbiddenPage
- **Symptom**: `uat-w001-04` fail — navigate đến `/admin/users` không hiện ForbiddenPage
- **Root Cause**: `App.tsx` chỉ có `/*` catch-all route render `AppShell` + `DashboardPage`. Không có route-level RBAC cho `/admin/*`
- **Fix**: Trong `AppShell`, check `location.pathname.startsWith('/admin')` → wrap với `ProtectedRoute requiredRoles={['system_admin']}`
- **Prevention**: Khi thiết kế router, map rõ từng route group với required roles ngay từ Phase 1

---

## LL-2 ĐIỀU CHỈNH (PLAN)

### ADJ-001: DB Schema thực tế khác hoàn toàn với model ban đầu
- **Spec Gap**: Spec assume `users.role`, `users.is_active`, `refresh_tokens` table — không có trong actual DB
- **Thực tế**: Role qua junction `user_roles → roles`, status qua `users.status`, refresh tokens trong `sessions`
- **Mất bao lâu**: ~2h để khám phá và adapt toàn bộ auth.service.ts + entity files
- **Prevention lần sau**: Phase 0 phải có bước "DB Schema Verification" — chạy query `information_schema.columns` trước khi viết bất kỳ entity nào. Thêm vào 05_MAIN_BUILD_EXECUTE.md: "Before Phase 1: `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`"

### ADJ-002: @types/pg không được cài trong backend
- **Gap**: Backend package.json không có `@types/pg` dù dùng `pg.Client` trong tests
- **Fix**: `npm install --save-dev @types/pg`
- **Prevention**: Luôn install `@types/X` khi install `X` — thêm vào scaffolding template

---

## LL-3 TECH DECISIONS (BUILD)

### TD-001: In-memory lockout thay vì DB
- **Quyết định**: Dùng `Map<string, {count, lockUntil}>` trong process memory thay vì lưu vào `system_settings` table
- **Lý do**: DB không có `failed_login_attempts` column; in-memory đủ cho dev/test; tránh N+1 query mỗi login attempt
- **Trade-off**: Lockout reset khi server restart; không share state giữa multiple instances
- **Khi nào dùng lại**: Dev/single-instance production. Multi-instance → cần Redis

### TD-002: pg.Client trực tiếp trong E2E/Integration setup
- **Quyết định**: Không dùng NestJS app hay TypeORM để create/cleanup test users
- **Lý do**: Tránh bootstrap overhead; tránh circular dependency với DI container; predictable behavior
- **Trade-off**: Hai connection pools (NestJS + pg.Client); phải sync schema manually
- **Khi nào dùng lại**: Tất cả integration/E2E tests cần DB fixtures

### TD-003: `import type` cho Axios
- **Quyết định**: Tách type imports khỏi value imports cho Axios
- **Lý do**: Vite không bundle TypeScript types — chỉ values. Type-only imports cần `import type`
- **Rule**: Áp dụng `@typescript-eslint/consistent-type-imports: error` từ nay

### TD-004: globalSetup/globalTeardown cho E2E test users
- **Quyết định**: Playwright globalSetup tạo test users trước khi browser launch; globalTeardown xóa sau
- **Lý do**: Tách data lifecycle khỏi test logic; mỗi test run có fresh users với known passwords
- **Trade-off**: Phụ thuộc vào DB availability trong setup; users cleanup ngay cả khi test fails
- **Pattern tốt**: Dùng prefix `e2e_` cho test usernames để dễ identify và cleanup

---

## LL-4 WHAT-TO-DO-DIFFERENTLY

### BUILD perspective
1. **DTO validation first**: Mọi DTO phải có class-validator decorators TRƯỚC khi viết service logic — sẽ tránh được BUG-001 hoàn toàn
2. **Vite import hygiene**: Template file `api/client.ts` phải có `import type` cho type-only imports ngay từ đầu
3. **Post-login navigation test sớm hơn**: BUG-003 chỉ phát hiện khi chạy E2E. Có thể detect sớm hơn với integration test kiểm tra redirect behavior

### PLAN perspective
1. **DB Schema Verification step**: Thêm vào pipeline: "Phase 0.1: Verify DB schema trước khi spec entities". Chạy `\dt` và `\d tablename` cho mỗi table cần dùng
2. **Spec phải map thực tế DB**: Spec không nên giả định column names — lấy từ DB thực tế
3. **Router design trong spec**: UI spec phải include route → role mapping rõ ràng

### HUMAN perspective  
1. **Cung cấp DB schema export sớm hơn**: Nên export `information_schema` trước khi bắt đầu build
2. **Test user credentials trong spec**: Nên có list seeded users với passwords trong spec ban đầu để E2E test không phải tạo user mới

---

# LESSON LEARNED — TASK-SS-2026-001 (SmartSelect + REWORK)
Date: 2026-03-09

## LL-1 BUGS (BUILD)

### BUG-SS-001: Quick-create selected chip không hiện sau khi tạo mới
- **Symptom**: Sau khi submit Quick-Create form, SmartSelect không hiển thị chip của record mới tạo
- **Root Cause**: `selectedOption` được derive từ `options.find(id)` — nhưng newly-created record chưa có trong `militiaOptions` (chỉ fetch khi search query thay đổi)
- **Fix**: Duy trì `extraOptions` state tích lũy các quick-created options, merge với fetched options (dedup by id)
- **Prevention**: Mọi component "select + create" pattern phải có separate state cho newly-created items

### BUG-SS-002: attendance_already_recorded — E2E ATT-E2E-02 flaky vì duplicate date
- **Symptom**: ATT-E2E-02 fail sau lần chạy đầu vì date `2026-03-08` đã có record từ lần trước
- **Root Cause**: Test hardcode ngày cố định + backend có uniqueness guard (militia_id + work_date). Teardown không xóa attendance records.
- **Fix tạm**: Pre-existing flakiness, không fix trong sprint này
- **Prevention lần sau**: Dùng dynamic date (`new Date().toISOString().slice(0,10)`) hoặc thêm cleanup attendance records vào global-teardown.ts

### BUG-SS-003: militia quick-create NOT NULL violations (cccd, dob, join_date)
- **Symptom**: POST /militia/quick-create → 500 Internal Server Error
- **Root Cause**: `militia_profiles` có 3 NOT NULL columns không được spec mention: `cccd VARCHAR(12)`, `dob DATE`, `join_date DATE`
- **Fix**: Thêm defaults vào `MilitiaService.quickCreate()`: cccd='000000000000', dob=now, join_date=now
- **Prevention**: Phase 0 DB schema verification phải detect NOT NULL columns của từng table sẽ INSERT vào

### BUG-SS-004: Quick-create form state via refs unstable — đến từ inline JSX recreate
- **Symptom**: Refs trong quick-create form detach mỗi lần parent re-render → form values không cập nhật
- **Root Cause**: Content prop của SmartSelect (`<QuickCreateMilitiaForm ref={...}>`) tạo element mới mỗi render → React unmounts + remounts
- **Fix**: Convert to controlled state (`qcName`, `qcCode`, `qcUnit`) ở TaskCreateForm level, pass down as props
- **Prevention**: Tránh inline render functions trong props khi component cần stable refs

## LL-2 ĐIỀU CHỈNH (PLAN)

### ADJ-SS-001: REWORK vì branch coverage check bị bỏ qua lúc initial review
- **Gap**: Lần đầu build, `useSmartSelect.ts` branch coverage = 75% nhưng report tổng cao (96%) che khuất issue
- **Mất bao lâu**: +1 sprint cycle (REWORK) để fix
- **Prevention**: Phase 2 phải check per-file branch coverage, không chỉ overall. Thêm vào checklist: "grep từng file HIGH component, verify branch ≥ 90%"

### ADJ-SS-002: AC-5..9 của US-SS-03 không có E2E skeleton từ Phase 0.5
- **Gap**: Phase 0.5 tạo E2E skeleton nhưng chỉ cover AC-1..4. AC-5..9 bị bỏ sót
- **Mất bao lâu**: Thêm SS-E2E-23..27 trong REWORK sprint
- **Prevention**: Phase 0.5 skeleton phải map 1:1 với MỌI AC trong US spec, không chỉ các AC "dễ" hiểu nhất

## LL-3 TECH DECISIONS (BUILD)

### TD-SS-001: SmartSelect dùng Radix Dialog cho Quick-Create Modal
- **Quyết định**: Dùng `@radix-ui/react-dialog` thay vì custom modal
- **Lý do**: Accessibility built-in (focus trap, aria-modal, Escape close); consistent với Radix UI design system đang dùng
- **Trade-off**: Bundle size tăng nhẹ; dialog positioning phụ thuộc Radix Portal
- **Khi nào dùng lại**: Mọi modal/dialog trong MMS Web

### TD-SS-002: useSmartSelect hook tách riêng khỏi SmartSelect component
- **Quyết định**: Tách state machine (keyboard nav, dropdown, debounce) vào hook riêng
- **Lý do**: Testability — hook có thể test với renderHook() không cần render full component
- **Kết quả**: 24 unit tests cho hook, 12 cho component — isolation tốt
- **Khi nào dùng lại**: Mọi complex interactive component

### TD-SS-003: Unaccent search via PostgreSQL extension
- **Quyết định**: `CREATE EXTENSION IF NOT EXISTS unaccent` trong service, dùng `unaccent($1)` trong WHERE clause
- **Lý do**: Native DB-level normalization, không cần JS preprocessing; hỗ trợ tiếng Việt đầy đủ
- **Trade-off**: Extension phải có trên production Postgres; không portable sang SQLite
- **Khi nào dùng lại**: Mọi full-text search với tiếng Việt trong MMS

## LL-4 WHAT-TO-DO-DIFFERENTLY

### BUILD perspective
1. **Phase 0.5 skeleton phải cover 100% ACs**: Không chỉ happy path — mọi AC phải có skeleton test TRƯỚC khi code
2. **Per-file branch coverage check**: Sau Phase 2, chạy `vitest --coverage` và inspect từng HIGH-priority file, không chỉ overall number
3. **Dynamic test dates**: Hardcoded dates trong E2E tests gây flakiness nếu chạy nhiều lần. Luôn dùng `new Date()` + offset

### PLAN perspective
1. **Screenshot naming phải được spec từ Phase 0**: Convention `{feature}-step{NN}-{desc}.png` phải documented trong task brief, không chỉ trong review checklist
2. **AC completeness check ở Phase 0.5**: Trước khi viết skeleton, đếm số ACs trong spec, confirm số tests ≥ số ACs

### HUMAN perspective
1. **Confirm screenshot naming convention trước khi build**: Ít nhất 1 ví dụ cụ thể trong task brief giúp tránh V-003 hoàn toàn
2. **Mark attendance test data cleanup**: Nếu backend có uniqueness guards, spec nên note rõ test isolation strategy
