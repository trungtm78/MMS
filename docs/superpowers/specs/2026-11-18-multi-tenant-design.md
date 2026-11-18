# Multi-tenant (multi-company) cho MMS — Design spec

## Context
MMS hiện chỉ phục vụ **một phường** (Phú Định). Rà soát:
- **Backend:** không có tenant/company. ~70 bảng không có `tenant_id`; unique toàn cục (username, email, `units.code`, mã task/SOS/leave, `kpi_periods`/`payroll_periods (year,month)`, `leave_types.code`, weapons serial, `system_settings.key`, `devices.fingerprint`). `system_admin` là admin của chính phường. "UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ" hardcode ở ~15 call site `addGovernmentHeader` (`src/common/services/excel-export.service.ts`). Không có API ghi bảng `units`. Không có kênh gửi email. Socket rooms + `broadcast()` toàn cục; file lưu phẳng.
- **Web + 2 app Flutter:** tên/địa chỉ/liên hệ/logo/badge/tọa độ/SĐT công an hardcode trong i18n/.arb/hằng số/asset; web có **2711 class màu hex trong 63 file** (`[#C62828]` ×617). Không có khái niệm tenant ở client.

**Mục tiêu:** nhiều địa phương (tenant) dùng chung hệ thống, dữ liệu cách ly tuyệt đối và **chứng minh được**; mỗi tenant có thông tin + nhận diện riêng; nhóm **System admin nền tảng** quản lý tenant, license — không chạm dữ liệu nghiệp vụ.

**Chuẩn tham chiếu:** AWS SaaS Prescriptive Guidance (pool model + PostgreSQL RLS, tenant context mỗi lần checkout), Salesforce *Grant Login Access* (hỗ trợ chỉ vào khi tenant cấp quyền có thời hạn, audit đầy đủ), Microsoft Entra *Company branding* (bộ trường branding + giới hạn asset), Odoo *multi-company / Document Layout* (layout báo cáo theo company, màu suy từ logo, xem trước; báo cáo dùng company của chứng từ), Nghị định 13/2023/NĐ-CP (bảo vệ dữ liệu cá nhân → xuất dữ liệu, lưu giữ, xóa khi chấm dứt).

## Quyết định đã chốt
| # | Chủ đề | Quyết định |
|---|---|---|
| — | Cách ly | Chung DB + `tenant_id` trên mọi bảng nghiệp vụ + Postgres **RLS** ENABLE+FORCE, fail-closed |
| — | User ↔ tenant | Đúng **1** tenant (cột `tenants.parent_tenant_id` dự phòng cho báo cáo hợp nhất cấp trên — chưa cho đọc chéo) |
| — | Đăng nhập | **Mã tenant + username**; app nhập mã 1 lần rồi nhớ; login hiện branding tenant |
| — | License | Thời hạn · số user hoạt động · module · số thiết bị · **dung lượng lưu trữ** (tăng scope) |
| 1A | Bề mặt platform | Cùng codebase web, `/platform` + `/api/platform` **chỉ trên host riêng** (`PLATFORM_HOST`) qua nginx + allowlist IP + MFA bắt buộc |
| 2A/4A | Mật khẩu tenant admin | Platform **không bao giờ** biết mật khẩu tenant: admin đầu tiên **kích hoạt bằng link email 1 lần**; quên mật khẩu = platform bấm "gửi link đặt lại" |
| 3A | Role | `system_admin` → **`tenant_admin`** ("Quản trị đơn vị"), commit riêng (~146 file) |
| 5A | Màu web | Tailwind token `brand*` = `rgb(var(--brand) / <alpha-value>)`, codemod toàn bộ màu thương hiệu, test chặn hex thương hiệu mới; màu trung tính giữ |
| 6A | Flutter | Package dùng chung `packages/mms_tenant` (path dependency) |
| 7A | Test | Bổ sung toàn bộ 24 nhánh thiếu + 4 regression bắt buộc |
| 8A+D16 | Migration | Index/unique mới tạo `CONCURRENTLY` trước (online); cửa sổ ngắn chỉ gắn constraint `USING INDEX`, FK kép `NOT VALID`, bật RLS; `VALIDATE` online sau; diễn tập trên bản sao dung lượng thật |
| D12 | Platform DB | Role DB riêng **`mms_platform`** + DataSource riêng, không có quyền trên bảng nghiệp vụ; mọi thao tác chạm tenant qua hàm `SECURITY DEFINER` tham số hẹp |
| D13 | Scope bất biến | Query runner ghi scope lúc mượn; lệch → `tenant_scope_mismatch`; cấm `runAs` trong transaction đang mở |
| D14 | Scope toàn request | Store ALS tạo đầu request; `JwtAuthGuard` `adopt` scope cho mọi guard/handler sau; mỗi sự kiện socket chạy trong `runAs(client.data.user.tid)` |
| D15 | Truy cập trước đăng nhập | Hàm hẹp do owner không bị RLS: `auth_tenant_by_code`, `public_tenant_branding`, `maintenance_tenant_ids` |
| D17 | Tương thích | Ma trận phiên bản client×backend, `/meta/client-compat` + header phiên bản, app cũ hiện "cần cập nhật", cutover đăng xuất toàn bộ có thông báo, điểm rollback = backup trước 036 + kịch bản khôi phục đã diễn tập |
| D18 | Đổi đơn vị | Lưu trữ cục bộ tiền tố tenant; đổi = đăng xuất + hủy request/upload/GPS nền + đóng socket + xóa cache; bỏ response có `tid` khác |
| D19 | Khởi tạo tenant | `provision_tenant` idempotent: unit gốc (ward), settings, loại nghỉ, tiêu chí KPI mặc định, license; e2e tới nghiệp vụ thật đầu tiên |
| D20 | Provisioning bền | Tenant + admin `pending_activation` + token hash + `mail_outbox` trong 1 transaction; worker gửi mail retry/backoff; "gửi lại" thay token; idempotency key |
| D21 | Thu hồi runtime | Đổi trạng thái/license → `pg_notify('mms_tenant_state')` → mọi replica đóng socket tenant ≤ 5 s + vô hiệu cache; job bảo trì chạy cả tenant tạm ngưng |
| D22 | Hết hạn license | Sau grace: **chỉ đọc** (chặn ghi), **SOS + thông báo khẩn vẫn chạy**; module tắt áp dụng cả dashboard/báo cáo/thông báo/job qua `isModuleEnabled()` chung |
| D23 | Units | API + màn hình quản lý `units` cho tenant_admin (mã duy nhất trong tenant, cây cha–con, chặn xóa khi còn tham chiếu) |
| C12 | Chứng minh cách ly | Dữ liệu **canary** + **kiểm thử khác biệt** trên mọi kênh, là cổng của M0/M1 (không đợi M5) |
| C13 | Trình tự | **M0 lát cắt dọc** 2 tenant trước khi lan ra ~70 bảng |
| +S1 | Hỗ trợ có đồng ý | Tenant admin cấp **quyền hỗ trợ có thời hạn** (≤ 14 ngày, thu hồi được, mọi thao tác audit, tenant xem được nhật ký) — kiểu Salesforce Grant Login Access; ngoài ra platform không vào được |
| +S2 | RBAC platform | `platform_owner`, `platform_operator` (tenant/branding/license), `platform_auditor` (chỉ xem metadata), `support_agent` (chỉ qua grant) |
| +S3 | Vòng đời tenant | provisioning → pending_activation → active → suspended / read_only → offboarding (**xuất toàn bộ dữ liệu + file**) → archived → purge sau thời hạn lưu giữ (NĐ 13/2023) |
| +S4 | Gói license | Mẫu gói (edition) + ghi đè theo tenant; lịch sử license; cảnh báo 30/14/7/1 ngày cho tenant admin + platform |
| +S5 | Đo lường | Usage theo tenant (user, thiết bị, dung lượng, request) → dashboard platform; dung lượng là chiều license |
| +S6 | Chính sách bảo mật tenant | Mật khẩu, MFA theo role, timeout phiên, allowlist IP cho tenant_admin (tùy chọn) — trong settings tenant |
| +S7 | Audit platform | `platform_audit_logs` append-only, chuỗi hash chống sửa |
| +S8 | Bảo mật kênh | Đưa TODOS MOBILE-01 (mặc định https/wss, fail nếu thiếu env) vào M4 |

## Kiến trúc

```
                ┌──────────── tenant host ─────────────┐   ┌──── PLATFORM_HOST (IP allowlist) ────┐
 Web/App ──────▶│ nginx → /api/v1/... (JWT tenant, tid)│   │ nginx → /api/platform (JWT aud=platform, MFA)
                └───────────────┬───────────────────────┘   └──────────────┬───────────────────────┘
                                ▼                                           ▼
   request ALS store ── JwtAuthGuard.adopt({tenant,tid}) ──┐     PlatformAuthGuard (+ platform RBAC)
   guards: License → Module → Roles → handler              │                │
                                ▼                          │                ▼
   DataSource(mms_app) obtainMasterConnection hook:        │     DataSource(mms_platform): bảng platform_*,
   set_config(app.tenant_id), runner scope bất biến        │     tenants/licenses + hàm SECURITY DEFINER hẹp
                                ▼                          │     (provision_tenant, request_admin_reset, grant mgmt)
   Postgres: RLS tenant_isolation (USING/WITH CHECK) ◀─────┘
   pg_notify: mms_auth_revocation(+tenantId), mms_tenant_state ─▶ mọi replica: đóng socket, xóa cache
   mail_outbox ─▶ MailWorker (SMTP, retry) ─▶ link kích hoạt / đặt lại
```

### 1. Ngữ cảnh tenant (backend)
- `src/database/tenancy/tenant-context.ts`: ALS `DbScope = {kind:'tenant',tenantId} | {kind:'maintenance',tenantId}`; store tạo ở middleware đầu request; `adopt` 1 lần; `runAs`; `requireTenantId`.
- `src/database/tenancy/bind-tenant.ts`: bọc `PostgresDriver.obtainMasterConnection` (pin `typeorm@0.3.28`, test phát hiện đổi internals): mỗi checkout `set_config('app.tenant_id', id|'' , false)`; runner ghi scope; mỗi query kiểm scope hiện tại == scope runner, lệch → throw `tenant_scope_mismatch`; lỗi set → `release(e)`.
- HTTP: `TenantScopeMiddleware` tạo store; `JwtAuthGuard` xác thực + `adopt`; `LicenseGuard`, `ModuleGuard`, `RolesGuard` chạy sau trong cùng scope.
- Socket: handshake bắt buộc `tid`; mọi handler bọc `runAs` từ `client.data.user.tid`.
- Khởi động: từ chối nếu user DB là superuser/BYPASSRLS.

### 2. Database
- **Roles:** `mms` owner/migrator; `mms_app` runtime (NOBYPASSRLS, DML bảng tenant); `mms_platform` (chỉ bảng platform + EXECUTE hàm hẹp); owner riêng cho hàm `SECURITY DEFINER` (`SET search_path = public, pg_temp`). Migrate CLI cấp LOGIN/password; `MIGRATION_DATABASE_URL` tách `DB_USER`/`PLATFORM_DB_USER`.
- **036_tenants.sql:** `app_tenant_id()`; `tenants` (code, name, status, lifecycle, `parent_tenant_id`), `tenant_profiles`, `tenant_assets`, `license_editions`, `tenant_licenses` (lịch sử), `tenant_usage_daily`, `support_access_grants`, `platform_admins`, `platform_sessions`, `platform_audit_logs` (hash chain), `account_tokens` (kích hoạt/đặt lại, lưu hash, hết hạn, 1 lần), `mail_outbox`; tenant #1 `phu-dinh` UUID cố định; roles + grants; hàm `auth_tenant_by_code`, `public_tenant_branding`, `maintenance_tenant_ids`, `provision_tenant`, `request_tenant_admin_reset`.
- **036b (không transaction, online):** thêm `tenant_id` (default hằng T1 → đổi default `app_tenant_id()`, không UPDATE → không kích hoạt trigger bất biến 026); `CREATE UNIQUE INDEX CONCURRENTLY` cho mọi unique mới `(tenant_id, …)` và `(tenant_id, id)`; index danh sách `(tenant_id, created_at DESC)`. Runner thêm hỗ trợ migration đánh dấu non-transactional.
- **037 (cửa sổ ngắn, 1 transaction):** constraint `UNIQUE … USING INDEX`; bỏ unique cũ; FK kép `(tenant_id, col)` **NOT VALID** (`ON DELETE SET NULL (col)`); RLS ENABLE+FORCE + policy `tenant_isolation`; hàm notify 035 thêm `tenantId`; `mms_tenant_state` trigger; `TRUNCATE login_attempts`; `system_admin` → `tenant_admin`; assert catalog.
- **038 (online):** `VALIDATE CONSTRAINT` từng FK; assert không còn FK đơn cột giữa bảng tenant.
- Migration 001–035 giữ nguyên (checksum khóa). Code theo unique mới: `ON CONFLICT` ở `sos.service.ts`, `tasks.service.ts`, seeder, `admin.controller.ts`, kpi/payroll `(year,month)`.

### 3. Auth, platform, đường ngoài HTTP
- **Login:** `{tenantCode, username, password}` → `auth_tenant_by_code` (status, license state) → `adopt` → `checkCredentials`. Mã tenant sai trả **giống hệt** sai mật khẩu (cùng thời gian, bcrypt giả). Token có `tid`; refresh `runAs(tid)`; token không `tid` → từ chối.
- **`login_attempts`:** khóa HMAC(tenantCode + `\0` + username).
- **Kích hoạt/đặt lại:** `account_tokens` (hash SHA-256, TTL 24 h, 1 lần, thay token cũ khi gửi lại); trang web đặt mật khẩu theo chính sách tenant; tenant_admin cũng dùng cho user của mình (thay luồng mật khẩu tạm hiện có khi có email).
- **MailService:** `mail_outbox` + worker (nodemailer, SMTP qua env, retry backoff, dead-letter, metric); mẫu email theo branding tenant.
- **Platform:** bảng + JWT riêng (`JWT_PLATFORM_SECRET`, `aud:'platform'`), MFA bắt buộc, RBAC S2, chỉ trên `PLATFORM_HOST`; tạo platform admin đầu bằng CLI `npm run platform:create-admin`.
- **Hỗ trợ có đồng ý (S1):** tenant_admin tạo grant (người hỗ trợ, phạm vi đọc/ghi, hạn ≤ 14 ngày); support_agent đăng nhập tenant qua grant → token tenant có `act:{platformAdminId, grantId}`; banner "Đang được hỗ trợ" cho tenant; audit cả hai phía; thu hồi tức thì qua `mms_tenant_state`.
- **Cron:** `TenantJobRunner.forEachTenant(kind: 'business'|'maintenance')`: business chỉ tenant active (và module bật), maintenance (retention, purge, usage) chạy mọi tenant chưa purge; try/catch từng tenant.
- **Socket:** rooms `t:<tid>:user:<id>`, `t:<tid>:unit:<code>`, `t:<tid>:gps:ward`, `t:<tid>:gps:unit:<code>`, `t:<tid>:conv_<id>`, `t:<tid>` (helper `src/notifications/rooms.ts`); bỏ `broadcast()`; lint cấm `server.emit(`.
- **File:** `UPLOAD_DIR/<tenant_id>/<storage_key>`; script idempotent chuyển file cũ về tenant #1 + đọc fallback 1 release; dung lượng tính vào usage.

### 4. Hồ sơ & nhận diện (theo Entra + Odoo)
- `tenant_profiles`: tên chính thức, tên ngắn, tỉnh/thành, địa chỉ, điện thoại, email, fanpage, Zalo, tọa độ bản đồ, danh bạ khẩn cấp (nhiều mục), tiêu đề/slogan header, nội dung footer, **dòng cơ quan báo cáo**, địa danh ngày tháng, tagline đầu báo cáo, chân báo cáo, khổ giấy; màu `primary/secondary/accent` (gợi ý tự suy từ logo, cho ghi đè, kiểm tương phản WCAG AA), màu nền login.
- `tenant_assets` (giới hạn theo kiểu): favicon 32×32, banner logo, square logo + bản nền tối, ảnh nền login ≤ 1920×1080, ảnh header, ảnh footer/badge, logo báo cáo; PNG/JPEG/WebP + SVG đã sanitize (loại script/event/foreignObject/external href); kiểm mime thật, kích thước, dung lượng.
- **Xem trước trực tiếp** khi chỉnh branding (login, header, footer, báo cáo mẫu).
- **API công khai** (cache + ETag, rate limit): `GET /public/tenants/:code/branding`, `/assets/:kind`; mã không tồn tại/ngưng → 404 chung.
- **Báo cáo:** mọi `addGovernmentHeader` lấy cơ quan/địa danh/logo từ **tenant của chứng từ**.
- `/auth/me` trả `tenant {code, name, modules, license {state, expiresAt}, readOnly}`.

### 5. License
- `license_editions` (mẫu gói) + `tenant_licenses` (bản ghi hiện hành + lịch sử, ghi đè): `valid_from`, `expires_at` (Asia/Ho_Chi_Minh), `grace_days`, `max_active_users`, `max_devices`, `storage_quota_mb`, `enabled_modules`.
- Catalogue module + **đồ thị phụ thuộc** (`src/common/licensing/modules.ts`); lõi luôn bật; `isModuleEnabled(tenant, module)` dùng chung cho guard, dashboard, báo cáo, thông báo, socket, job.
- Ép buộc: hết hạn → sau grace **read_only** (mọi ghi 403 `license_read_only`, trừ SOS + thông báo khẩn); trước hạn 30/14/7/1 ngày cảnh báo + header `X-License-Expires-In`; user → 409 `license_user_limit` (đếm dưới khóa hàng license, chống race); thiết bị → 409 `license_device_limit`; dung lượng → 413 `license_storage_quota`; module → 403 `module_not_licensed`. Cache theo tenant, vô hiệu qua `mms_tenant_state`.

### 6. Giao diện
- **Web platform** (`PLATFORM_HOST`): tenant list + usage, wizard tạo tenant (thông tin, branding, gói license, email tenant admin → gửi link), editor branding + xem trước, license + lịch sử, vòng đời (tạm ngưng/kích hoạt/offboarding/xuất dữ liệu), gửi link đặt lại, nhật ký platform, quản lý platform admin + RBAC.
- **Web tenant:** login có mã đơn vị (nhớ; tùy chọn suy từ subdomain), `TenantProvider` → CSS vars + favicon + logo; `Header`/`GlobalFooter`/`GPSTrackingPage` từ profile; i18n nội suy `{{tenantName}}`; token màu `brand*` (5A); menu theo module; banner license/chỉ đọc/đang được hỗ trợ; trang **Quản lý đơn vị** (D23), **Quyền hỗ trợ** (S1), **Chính sách bảo mật** (S6); trang kích hoạt/đặt lại mật khẩu.
- **Apps (qua `packages/mms_tenant`):** màn hình mã đơn vị, branding cache offline + theme, đổi đơn vị theo D18, xử lý `license_read_only`/`module_not_licensed`/"cần cập nhật" (D17), SOS dùng danh bạ khẩn của tenant, check-in dùng tọa độ tenant, gỡ literal "Phú Định"; MOBILE-01 (S8).

## Lộ trình (mỗi milestone: TDD → review → codex → verify gate → commit; PR riêng)
0. **M0 – Lát cắt dọc (chứng minh ranh giới):** tenancy core + roles DB + RLS trên nhóm bảng đại diện (users, units, militia_profiles, tasks, task_assignments, files, notifications, audit_logs), 2 tenant; chứng minh HTTP, transaction, query runner, guard chain, socket, cron, file path, export; canary + differential trên lát cắt. **Cổng:** pass toàn bộ trước khi lan rộng.
1. **M1 – Lan toàn schema + đăng nhập:** 036/036b/037/038 cho mọi bảng, unique per-tenant, đổi `tenant_admin` (commit riêng), login mã tenant, sockets/cron/files toàn bộ, compat matrix + `/meta/client-compat`, 3 client nhập mã đơn vị; quét cách ly đầy đủ là cổng của M1.
2. **M2 – Platform + provisioning + license:** `mms_platform`, PLATFORM_HOST, RBAC, MailService/outbox, kích hoạt/đặt lại, `provision_tenant`, units API, license 5 chiều + read_only + editions, usage, grant hỗ trợ, `mms_tenant_state`.
3. **M3 – Hồ sơ, branding, báo cáo, web:** profile/assets/sanitize/public API, báo cáo theo tenant, codemod màu 5A, TenantProvider, trang tenant mới, khu vực platform UI. Chạy `/plan-design-review` cho UI platform + branding trước khi dựng.
4. **M4 – Apps:** `packages/mms_tenant`, tích hợp 2 app, D18, MOBILE-01.
5. **M5 – Vòng đời + UAT:** offboarding/xuất dữ liệu/archive/purge, diễn tập migration trên bản sao + rollback, UAT 2 tenant trên web + 2 app, tài liệu triển khai (roles DB, env, PLATFORM_HOST, SMTP, chuyển file, cutover).


## M0 as built: deviations from this spec (recorded 2026-11-18)
M0 (branch `feat/multi-tenant`) is implemented and its gate evidence is in `PROGRESS.md`. Where the build differs from the text above, the build is the source of truth; M1 starts from this list. (Written in English like the code and the other docs; the rest of this spec is Vietnamese.)

| # | Spec said | M0 built | Why / what follows |
|---|---|---|---|
| 1 | `036`, `036b` (online, non-transactional), `037`, `038` | `036_tenants.sql` and `037_tenant_slice_rls.sql` only, each one transaction; no `036b`, no `038` | The slice is nine small tables, so no online index build was needed. **M1 migrations are `038` and later**; the online/`CONCURRENTLY` runner mode arrives with M1. 037 also sets the legacy database default `app.tenant_id` (spec silent), removed in M1 by `ALTER DATABASE <db> RESET app.tenant_id` |
| 2 | `DbScope = {kind:'tenant'} \| {kind:'maintenance'}`; `forEachTenant(kind)` | `TenantScope = { tenantId }`, a single kind; jobs use the same scope as requests; `forEachTenant(job)` has no `kind`, lists every non-archived tenant (`maintenance_tenant_ids()`), isolates failures per tenant | The business/maintenance split depends on tenant lifecycle and licence states (M2). **Callers branch on `isTenancyEnforced()`**: legacy mode runs the job once, unscoped |
| 3 | "Khởi động: từ chối nếu user DB là superuser/BYPASSRLS" | Done, and more: `src/database/tenancy/boot-guards.ts` has `assertNoLegacyTenantDefault` and `assertRuntimeRoleEnforcesRls`; `TENANCY_MODE=legacy\|enforced` (default `legacy`, anything else fails startup); `TenancyConfigError` is fail-fast (`toRetry` excludes it); `installExtensions: false` | A forgotten legacy default would make a request with no scope read the first tenant (fail-open): a Task 3 review finding. Consequence: `DB_USER=mms` of the sample env files is refused under `enforced`. See `Web/backend/docs/tenancy.md` |
| 4 | Login: resolve the tenant code, then `adopt`, then check credentials | The tenant is resolved **inside** the lockout reservation (`validateUser` after `begin()`), so an unknown tenant code takes a lockout slot like a wrong password and runs the dummy bcrypt (a blank code under `enforced` is a 400 before any slot) | Resolving first made the lockout counter a tenant-existence oracle (Task 5 review). Lockout keys are still per username, not `HMAC(tenantCode + \0 + username)`: **per-tenant keys are M1** |
| 5 | `UPLOAD_DIR/<tenant_id>/<storage_key>`; idempotent move script; one-release read fallback | The layout is as specified in `enforced` mode (flat in `legacy`). **No move script and no read fallback**: files already on disk in the flat layout answer 404 under `enforced` and the purge cannot remove them. `files.storage_key` stays globally unique | The move script is an M1 item; production stays in `legacy` mode until it exists |
| 6 | Rooms `t:<tid>:...`; remove `broadcast()`; lint bans `server.emit(` | Rooms are `t:<tid>:...` in `enforced` and `t:legacy:...` in `legacy`; every socket joins `t:<tid>` (or `t:legacy`); `broadcast()` is gone (`emitToTenant` replaces it); **no lint rule was added** (nothing in `src` calls `server.emit(` today) | Room names change in legacy mode too, so during a rolling deploy old and new replicas do not exchange room events through the Redis adapter (transient). A lint rule banning `server.emit(` is an M1 item |
| 7 | `mms_auth_revocation(+tenantId)`; `pg_notify` payload carries the tenant | **The revocation payload still carries no tenant** (the revocation feed is untouched). `closeRevoked` picks the user's sockets among all local sockets; `closeInvalid` groups sockets by tenant and validates each group under its scope | Carrying the tenant in the announcement is M1 |
| 8 | Tables: users, units, militia_profiles, tasks, task_assignments, files, notifications, audit_logs | Nine tables: those eight plus `notification_receipts`. Natural keys unique per tenant on `users`, `units`, `militia_profiles`, `tasks` | `notification_receipts` joins the slice so notification reads are isolated end to end. Chat tables (`conversations`, `messages`, `conversation_participants`) have no tenant column in M0: chat isolation rests on globally unique user ids plus the participant check (M1 adds the column). `/notifications` `total` still counts receipts by `user_id` only |
| 9 | Roles: `mms` migrator/owner, `mms_app`, `mms_platform`, a separate owner for `SECURITY DEFINER` functions; `MIGRATION_DATABASE_URL`; migrate CLI grants LOGIN/password | Roles `mms_app` and `mms_platform` are created `NOLOGIN` by 036; the operator runs `ALTER ROLE mms_app LOGIN PASSWORD '...'`. The two `SECURITY DEFINER` functions (`auth_tenant_by_code`, `maintenance_tenant_ids`) are owned by the role that runs the migration; `public_tenant_branding`, `provision_tenant` and `request_tenant_admin_reset` are not built. The existing `DATABASE_URL` is the migrator connection; **no `MIGRATION_DATABASE_URL` variable exists**. `mms_platform` has no login and no DataSource | The migrator must be a superuser or BYPASSRLS role (037's `ALTER DATABASE SET`; FORCE would lock a plain owner out). A dedicated function owner, the platform DataSource and the remaining functions belong to M2 |
| 10 | Verification: "FK sang tenant khác → 23503"; "insert không scope → 23502" | **Cross-tenant references are not closed in M0**: single-column foreign keys are checked as the table owner and bypass RLS, so a tenant can point a row at another tenant's row id. Closed in M1 by composite `(tenant_id, id)` foreign keys; the first M1 task is the failing reproduction test. An insert without a scope by `mms_app` fails `42501` (RLS WITH CHECK precedes NOT NULL); `23502` holds for a superuser | M1 gate |
| 11 | Not specified in detail: error mapping, MFA flows, tenant-status checks on live sessions (D21 revokes via `mms_tenant_state`, M2) | `TenantScopeError` (no scope, mismatch) is not mapped to an HTTP status (500). MFA, recovery and password-reset flows do not work under `enforced` (challenge tokens carry no `tid`). Suspended or offboarding tenants keep their existing sessions (the guard and refresh do not re-check tenant status; only sign-in does) | M1 queue in `PROGRESS.md` |
| 12 | Test file `test/rls.e2e-spec.ts` | `test/tenancy-rls.e2e-spec.ts`, `test/tenancy-binding.e2e-spec.ts`, `test/tenancy-slice.e2e-spec.ts` (+ `tenancy-database-helper`), support in `test/support/{tenancy,enforced-env,eventually}.ts` | The canary/differential proof is the slice suite, which is the M0 gate |

## File trọng yếu
- Mới: `Web/backend/src/database/tenancy/{tenant-context,bind-tenant,tenant-scope.middleware,tenant-job-runner}.ts`, `migrations/036_tenants.sql`, `036b_tenant_columns_online.sql`, `037_tenant_isolation.sql`, `038_validate_tenant_fks.sql`, `src/platform/**`, `src/tenants/**` (profile, assets, public, provisioning, lifecycle, export), `src/common/licensing/**`, `src/mail/**`, `src/support-access/**`, `src/units/**` (ghi), `src/notifications/rooms.ts`.
- Sửa: `src/app.module.ts`, `src/database/typeorm.options.ts`, `src/database/migrations/{migration-runner,migration-config,migrate.cli}.ts`, `src/auth/{auth.service,login-attempts.service,auth-revocation-feed}.ts`, `src/common/guards/*`, `src/notifications/notifications.gateway.ts`, `src/sos/sos.service.ts`, `src/files/files.service.ts`, scheduler services, `src/admin/*`, `src/common/constants/roles.ts`, mọi call site `addGovernmentHeader`, `nginx/conf.d/mms.conf`, compose files, `.env*.example`.
- Web: `tailwind.config.*`, `src/components/auth/LoginPage.tsx`, `src/components/layout/{Header,GlobalFooter}.tsx`, `src/contexts/{AuthProvider,TenantProvider}.tsx`, `src/routes/pageRoutes.ts`, `src/lib/roles.ts`, `src/pages/platform/**`, `src/pages/{units,support-access,security-policy,activate}/**`, i18n `vi/*.json`, 63 file màu (codemod).
- Flutter: `packages/mms_tenant/**` (mới), `pubspec.yaml` 2 app, `lib/shared/widgets/auth_layout.dart`, `lib/features/auth/**`, `lib/core/network/*`, `lib/core/constants/api_constants.dart`.
- Test hạ tầng: `test/support/{app-env,db}.ts`, jest globalSetup tạo roles DB.

## What already exists (tái sử dụng)
| Có sẵn | Dùng thế nào |
|---|---|
| `resolveMemberReach`/`unitGrantOf` (`src/common/access/member-scope.ts`) | Giữ nguyên làm phân quyền **trong** tenant |
| Revocation feed + migration 035 | Mở rộng payload `tenantId`; mẫu cho `mms_tenant_state` |
| `AuthStateService.invalidateUser`, `sessions` | Dùng cho cutover, suspend, thu hồi grant |
| `FilesService` | Lưu `tenant_assets`, đo dung lượng |
| `addGovernmentHeader` | Nhận cơ quan/địa danh/logo từ profile |
| Migration runner + shape-guard | Thêm chế độ non-transactional; schema guard tenant |
| `withRefreshLock`, `TokenRefresher` | Giữ; thêm `tid` + xử lý mã lỗi mới |
| `outbox_events` (bảng chưa dùng) | Cân nhắc làm `mail_outbox` (nếu cấu trúc phù hợp, tránh bảng thừa) |

## NOT in scope
- Một user thuộc nhiều tenant / chuyển công ty (đã chốt 1 tenant; `parent_tenant_id` chỉ dự phòng).
- Báo cáo hợp nhất đọc chéo nhiều tenant (cấp quận/thành) — cần quyết định pháp lý riêng; ghi TODO.
- Đổi tên/icon launcher app theo tenant (tĩnh khi build, một bản app cho mọi tenant).
- Thanh toán/hóa đơn tự động cho license (license do platform cấp tay).
- Schema-per-tenant / DB-per-tenant (đã chọn pool + RLS).

## Failure modes
| Đường mới | Lỗi thực tế | Test | Xử lý | Người dùng thấy |
|---|---|---|---|---|
| Hook checkout | set_config lỗi giữa chừng | ✓ | release(e), hủy client | 500 + retry |
| Scope runner | `runAs` trong transaction mở | ✓ | throw mismatch | lỗi dev, không lọt dữ liệu |
| Login mã tenant | dò mã tenant | ✓ | phản hồi đồng nhất + rate limit | "Sai thông tin đăng nhập" |
| Mail outbox | SMTP chết | ✓ | retry/backoff, dead-letter, gửi lại | admin "chờ kích hoạt" |
| Token kích hoạt | dùng lại / hết hạn | ✓ | từ chối | thông báo xin link mới |
| License đồng thời | 2 tạo user ở đúng hạn mức | ✓ | khóa hàng license | 1 thành công, 1 nhận 409 rõ |
| Suspend | socket còn mở | ✓ | pg_notify ≤ 5 s | phiên đóng có thông báo |
| Cron | 1 tenant lỗi | ✓ | try/catch từng tenant + log | tenant khác không ảnh hưởng |
| Asset SVG | chứa script | ✓ | sanitize/từ chối | lỗi rõ khi upload |
| Migration 037 | khóa lâu | diễn tập | index online trước | cửa sổ ngắn đã báo trước |
| Đổi đơn vị | response muộn tenant cũ | ✓ | bỏ theo `tid` | không lẫn dữ liệu |
**Critical gaps (không test + không xử lý + im lặng): 0.**

## Kiểm chứng
- **DB (`test/rls.e2e-spec.ts`, kết nối `mms_app`):** không scope → mọi bảng tenant 0 dòng (lặp catalog); insert không scope → 23502; ghi `tenant_id` khác → 42501; FK sang tenant khác → 23503; `mms_platform` không SELECT được bảng nghiệp vụ; mỗi hàm SECURITY DEFINER chỉ trả cột cho phép.
- **Hook/scope:** 200 lời gọi xen kẽ với pool `max=2` qua `query`/`transaction`/repository/query runner; `runAs` trong transaction mở → `tenant_scope_mismatch`; guard sau `JwtAuthGuard` đọc được DB; handler socket có scope.
- **Schema guard CI:** mọi bảng ngoài `GLOBAL_TABLES` có `tenant_id NOT NULL DEFAULT app_tenant_id()`, RLS enable+force, policy đúng mẫu, không FK đơn cột, unique chứa `tenant_id`.
- **Cách ly (canary + differential, cổng M0/M1):** tenant B có chuỗi canary `CANARY-B-<uuid>` trong mọi cột text + file + tên; mọi route (DiscoveryService, tham số body/query/path) gọi bằng tenant A: không phản hồi JSON, Excel export, file tải về, payload socket/thông báo nào chứa canary; chạy 2 lần (B rỗng / B đầy) → phản hồi của A giống hệt (bỏ timestamp) ⇒ bắt được rò số đếm/tổng hợp; id của B → 403/404, dữ liệu B không đổi; route mới chưa map tham số → test fail.
- **Migration:** 035 → 036/036b/037/038 trên dữ liệu seed (gồm bảng bất biến 026) + DB mới; 036b chạy song song với ghi (không chặn); diễn tập trên bản sao + rollback.
- **Platform/auth:** token tenant gọi platform → 401, ngược lại → 401; `/api/platform` từ host tenant → 404; MFA bắt buộc; RBAC từng vai trò; grant hỗ trợ (hết hạn, thu hồi, audit hai phía, banner).
- **Provisioning:** tạo tenant → outbox → email → kích hoạt → đăng nhập → tạo user → tạo nhiệm vụ/nghỉ phép; SMTP lỗi/timeout/retry/gửi lại; idempotency key.
- **License:** mốc `expires_at` giờ VN, trước/sau grace, read_only nhưng SOS chạy, cảnh báo 30/14/7/1, user/thiết bị/dung lượng/module (guard + dashboard + báo cáo + socket + job), cache vô hiệu ≤ 5 s.
- **Branding:** SVG độc → loại; mime/kích thước; tương phản AA → 400; public 404 khi ngưng; ETag 304; báo cáo dùng tenant của chứng từ.
- **Regression (bắt buộc):** Excel tenant #1 vẫn đúng "UBND PHƯỜNG PHÚ ĐỊNH — BAN CHỈ HUY QUÂN SỰ"; audit_logs vẫn ghi (có tenant); socket trong tenant vẫn nhận sự kiện; token cũ không `tid` → về login gọn.
- **Client:** web (mã nhớ, CSS vars, favicon, menu theo module, banner, test chặn hex thương hiệu, trang kích hoạt); `packages/mms_tenant` (màn hình mã, cache offline, đổi đơn vị D18, "cần cập nhật"); 2 app tích hợp.
- **Toàn bộ suite hiện có** (backend unit + 12 e2e, web vitest, 2 app flutter test) xanh với `mms_app`.
- **UAT:** 2 tenant branding khác nhau trên web + 2 app (emulator), platform không xem được dữ liệu nghiệp vụ, offboarding xuất đủ dữ liệu.

## Worktree parallelization
| Bước | Module | Phụ thuộc |
|---|---|---|
| M0 lát cắt | backend database/tenancy, migrations, test | — |
| M1 lan schema | backend toàn bộ | M0 |
| M2 platform/license | backend platform, licensing, mail | M1 |
| M3a branding backend | backend tenants, excel-export | M1 |
| M3b codemod màu web | web components/pages | — (độc lập, bắt đầu ngay) |
| M3c web tenant/platform UI | web | M2, M3a, M3b |
| M4 `packages/mms_tenant` + apps | Flutter | M1 (API login), M3a (branding API) |
| M5 lifecycle + UAT | tất cả | M2–M4 |

Lane A: M0 → M1 → M2 (tuần tự, cùng backend). Lane B: M3b (song song từ đầu). Lane C: M3a sau M1 (song song với M2, khác module nhưng cùng `src/common` → phối hợp). Lane D: M4 sau M1+M3a. Rồi M3c, M5. **Xung đột:** M2 và M3a cùng chạm `src/common/` và `app.module.ts` → merge cẩn thận hoặc tuần tự phần đó.

## Implementation Tasks
- [ ] **T1 (P1)** — tenancy — ALS store toàn request + hook checkout + scope runner bất biến *(D13, D14)* — Verify: test hook/scope
- [ ] **T2 (P1)** — db — roles `mms_app`/`mms_platform`/owner hàm + hàm hẹp *(D12, D15)* — Verify: rls.e2e
- [ ] **T3 (P1)** — db — 036/036b online/037/038 + runner non-transactional *(8A, D16)* — Verify: migrations e2e + diễn tập
- [ ] **T4 (P1)** — test — canary + differential sweep là cổng M0/M1 *(C12)*
- [ ] **T5 (P1)** — auth — login mã tenant, `tid`, lockout theo tenant, compat matrix *(D17)*
- [ ] **T6 (P1)** — platform — PLATFORM_HOST + IP allowlist + MFA + RBAC *(1A, S2)*
- [ ] **T7 (P1)** — provisioning — outbox + mail worker + kích hoạt/đặt lại *(2A, 4A, D20)*
- [ ] **T8 (P1)** — license — 5 chiều, read_only giữ SOS, đồ thị module, cache + pg_notify *(D21, D22, S4)*
- [ ] **T9 (P2)** — role — đổi `tenant_admin` commit riêng *(3A)*
- [ ] **T10 (P2)** — web — codemod token màu *(5A)*
- [ ] **T11 (P2)** — flutter — `packages/mms_tenant` + D18 + MOBILE-01 *(6A, D18, S8)*
- [ ] **T12 (P2)** — tenants — provision_tenant + units CRUD *(D19, D23)*
- [ ] **T13 (P2)** — support — grant hỗ trợ có thời hạn *(S1)*
- [ ] **T14 (P2)** — lifecycle — offboarding/xuất dữ liệu/purge + usage *(S3, S5)*
- [ ] **T15 (P2)** — audit — platform audit hash chain *(S7)*

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 13 findings (outside voice), 13 absorbed into plan |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues + 1 extra finding, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — (scheduled in M3 before UI build) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** 13 plan-level findings (platform DB boundary, scope binding, guard order, pre-auth access, migration locking, compatibility, tenant switch, bootstrap data, durable provisioning, runtime revocation, module dependencies + SOS, isolation proof breadth, vertical slice) — all resolved as decisions D12–D22, C12, C13.
- **CROSS-MODEL:** Disagreed on 8A (NOT VALID alone is not online) → resolved by D16 (online index build first). Agreed on RLS pool model, platform isolation goal, test breadth.
- **VERDICT:** ENG CLEARED — ready to implement (start with M0 vertical slice).

NO UNRESOLVED DECISIONS
