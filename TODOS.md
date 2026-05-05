# TODOS

## Flutter / Mobile

> Source: `/codex` review of mobile system (2026-05-05) — 20 findings across MilitianApp + PoliceApp Flutter apps.

---

**Priority:** P0
**Title:** MOBILE-01 — Cleartext HTTP/WS defaults trong api_constants
**Description:** Release defaults là plain `http://` và `ws://`. Nếu env vars miss, auth, refresh tokens, GPS, chat, police live tracking sẽ chạy cleartext.
**Files:** `MilitianApp/mobile/lib/core/constants/api_constants.dart:6,11`, `PoliceApp/mobile/lib/core/constants/api_constants.dart:6,11`
**Fix:** Force `https://` / `wss://` scheme as default. Hard-fail nếu env vars missing thay vì silent fallback.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P0
**Title:** MOBILE-02 — Dio LogInterceptor logs request/response bodies (passwords + tokens)
**Description:** `LogInterceptor` log toàn bộ request và response bodies. Login passwords, access tokens, refresh tokens lộ vào device logs (logcat/Console).
**Files:** `MilitianApp/mobile/lib/core/network/dio_client.dart:29-32`, `PoliceApp/mobile/lib/core/network/dio_client.dart:33-36`
**Fix:** Disable `requestBody`/`responseBody` logging trong release builds. Use `kDebugMode` guard hoặc strip interceptor production.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P0
**Title:** MOBILE-03 — PoliceApp Android thiếu INTERNET, ACCESS_FINE_LOCATION permissions
**Description:** AndroidManifest không khai báo `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` trong khi app dùng Dio/WebSocket/GPS. Tất cả network và GPS sẽ fail trên Android.
**Files:** `PoliceApp/mobile/android/app/src/main/AndroidManifest.xml:1-45`, dùng tại `PoliceApp/mobile/lib/features/attendance/screens/checkin_screen.dart:64-75`, `PoliceApp/mobile/lib/features/gps/screens/gps_tracking_screen.dart:39-61`
**Fix:** Thêm `<uses-permission>` cho INTERNET, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P0
**Title:** MOBILE-04 — WebSocket token leak qua query string
**Description:** Access token gửi qua WebSocket query string (`setQuery({'token': token})`). Token leak qua proxies, server access logs, crash reports.
**Files:** `MilitianApp/mobile/lib/shared/services/websocket_service.dart:56-57`
**Fix:** Move token vào WebSocket Authorization header (Socket.IO `auth` field), KHÔNG đặt vào URL.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-05 — Refresh token race condition
**Description:** Refresh logic race-prone. Khi `_isRefreshing=true`, các 401 khác skip refresh và fail. Refresh dùng cùng intercepted dio nên có thể reattach Authorization cũ.
**Files:** `MilitianApp/mobile/lib/core/network/auth_interceptor.dart:26-58`, `PoliceApp/mobile/lib/core/network/auth_interceptor.dart:23-55`
**Fix:** Queue concurrent 401 requests, await refresh completion, retry với token mới. Dùng raw Dio (no interceptors) cho refresh call.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-06 — Auth bypass (chỉ check token tồn tại, không validate)
**Description:** App treat any stored access token as authenticated. Không check JWT expiry, profile validation, role validation, revoked-token. User với token expired vẫn vào protected screens.
**Files:** `MilitianApp/mobile/lib/features/auth/providers/auth_provider.dart:57-61`, `PoliceApp/mobile/lib/features/auth/providers/auth_provider.dart:61-66`
**Fix:** Decode JWT exp claim → check expiry. Call `/auth/me` on app start để validate token + load fresh role.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-07 — GPS fake tracking + silent data loss
**Description:** GPS upload services post `lat:null, lng:null`, swallow failures, no durable queue. Đây là fake tracking + silent data loss.
**Files:** `MilitianApp/mobile/lib/features/home/services/gps_background_service.dart:29-35`, `PoliceApp/mobile/lib/features/gps/services/gps_upload_service.dart:22-28`
**Fix:** Validate lat/lng trước khi upload (skip nếu null). Add SQLite/Hive offline queue. Retry on next reconnect. Log failures via Crashlytics/Sentry.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-08 — Background GPS không thật (thiếu Android service + iOS UIBackgroundModes)
**Description:** App khai báo "Always" location text nhưng không có Android background/foreground service permission, không có iOS `UIBackgroundModes`. GPS sẽ không chạy khi app background.
**Files:** `MilitianApp/mobile/android/app/src/main/AndroidManifest.xml:5-17`, `MilitianApp/mobile/ios/Runner/Info.plist:47-50`
**Fix:** Add `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (Android), `UIBackgroundModes: [location]` (iOS). Implement foreground service với persistent notification.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-09 — Push notifications không production-grade
**Description:** Militian: không request iOS notification permission, `getToken()` luôn null. Police: hoàn toàn không có push notification service. Background/terminated notifications miss.
**Files:** `MilitianApp/mobile/lib/shared/services/push_notification_service.dart:33-40,85-86`, PoliceApp missing entire service
**Fix:** Request iOS permission via `firebase_messaging` `requestPermission()`. Implement push service trong PoliceApp. Test background/terminated states trên iOS + Android.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-10 — Firebase config dead (Android declares service, Dart đã remove)
**Description:** Firebase đã "removed" trong Dart nhưng Android Manifest vẫn declare `FirebaseMessagingService`. Dead platform config, có thể gây broken startup/build.
**Files:** `MilitianApp/mobile/android/app/src/main/AndroidManifest.xml:41-48`, `MilitianApp/mobile/lib/core/constants/api_constants.dart:66`, `MilitianApp/mobile/lib/shared/services/push_notification_service.dart:19-20`
**Fix:** Decide: (a) Setup Firebase fully (Sender ID, google-services.json, etc.) hoặc (b) Xoá `FirebaseMessagingService` declaration khỏi Manifest.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-11 — WebSocket payload blind cast crash
**Description:** `data as Map<String, dynamic>` blind cast WebSocket payload. 1 malformed event crash entire screen.
**Files:** `PoliceApp/mobile/lib/features/gps/screens/gps_tracking_screen.dart:67`
**Fix:** Use `if (data is Map<String, dynamic>) { ... }` guard. Log + skip malformed events.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P1
**Title:** MOBILE-12 — substring/split crashes trên empty strings
**Description:** `.substring(0, 1)` và `.split(' ').last` crash khi nullable/empty names. 4-5 vị trí.
**Files:** `PoliceApp/mobile/lib/features/gps/screens/gps_tracking_screen.dart:98,169,177,214`, `PoliceApp/mobile/lib/features/dqtv/screens/dqtv_detail_screen.dart:89`
**Fix:** Helper `String initials(String? name)` trả 'DQTV' nếu null/empty, else lấy first char safely.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P2
**Title:** MOBILE-13 — CreateTaskScreen có hardcoded assignees + fake success
**Description:** Member app task creation là placeholder với hardcoded assignees và fake success response. KHÔNG được ship.
**Files:** `MilitianApp/mobile/lib/features/tasks/screens/create_task_screen.dart:5-7,41-47,68-71`
**Fix:** Decide: (a) Implement real API call hoặc (b) Hide screen sau RBAC check (DQTV thường không tạo task).
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P2
**Title:** MOBILE-14 — Auth response force-unwrap crash
**Description:** Force unwrap auth response fields. Backend partial/error-shaped success response sẽ crash thay vì produce controlled auth error.
**Files:** `MilitianApp/mobile/lib/features/auth/repositories/auth_repository_impl.dart:30-32,50-53,70-73,100-103`
**Fix:** Replace `!` với null-safe parsing + throw `AuthException` với clear message.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P2
**Title:** MOBILE-15 — Missing mounted check sau await trong notification screen
**Description:** Calls `setState` sau awaits không có `mounted` check. Dispose during network call sẽ throw.
**Files:** `PoliceApp/mobile/lib/features/notifications/screens/notifications_screen.dart:34-43,60-64`
**Fix:** Wrap setState với `if (!mounted) return;` sau mỗi await.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P2
**Title:** MOBILE-16 — GPS/network errors expose raw exception, no retry, no offline queue
**Description:** GPS/network errors flatten hoặc expose raw exception text. Không có retry strategy, không có offline queue, không có permission-settings recovery path.
**Files:** `MilitianApp/mobile/lib/features/attendance/screens/checkin_screen.dart:34-59,65-94`, `PoliceApp/mobile/lib/features/attendance/screens/checkin_screen.dart:62-80,86-128`
**Fix:** Map exceptions sang user-friendly Vietnamese messages. Add retry button. Open settings nếu permission denied.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P2
**Title:** MOBILE-17 — Socket chỉ disconnect, không dispose
**Description:** Socket được disconnect nhưng không dispose. Reopening screen có thể leave listeners/resources around.
**Files:** `PoliceApp/mobile/lib/features/gps/screens/gps_tracking_screen.dart:31-33`
**Fix:** Replace `socket.disconnect()` với `socket.dispose()` trong `dispose()` method.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P3
**Title:** MOBILE-18 — iOS keychain accessibility quá permissive (first_unlock)
**Description:** iOS token storage dùng `first_unlock`, cho phép token access sau lần unlock đầu tiên dù device đang locked. Quá permissive cho policing/GPS data.
**Files:** `MilitianApp/mobile/lib/core/storage/secure_storage_service.dart:11`, `PoliceApp/mobile/lib/core/storage/secure_storage_service.dart:10`
**Fix:** Change accessibility sang `first_unlock_this_device` hoặc `passcode` cho data nhạy cảm.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P3
**Title:** MOBILE-19 — Code duplication core/ giữa MilitianApp và PoliceApp với behavioral drift
**Description:** Networking/storage/constants/auth-interceptor code duplicate giữa 2 apps với drift: Militian clears all storage on refresh failure, Police clears tokens only. Sẽ tiếp tục produce inconsistent security bugs.
**Files:** `MilitianApp/mobile/lib/core/*`, `PoliceApp/mobile/lib/core/*`
**Fix:** Extract shared package `mms_mobile_core` (path dep trong pubspec). Migrate dần từng module.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

**Priority:** P3
**Title:** MOBILE-20 — Recovery codes route là placeholder (MFA dead screen)
**Description:** Recovery codes route placeholder. MFA setup có thể navigate user vào dead screen sau enrollment.
**Files:** `PoliceApp/mobile/lib/core/router/app_router.dart:79-80,206-218`
**Fix:** Implement RecoveryCodesScreen displaying 10 codes from `/auth/mfa/setup` response. Add "Save to Files" button.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-05)

---

## Web / Backend

**Priority:** P1
**Title:** NestJS FilesModule — file upload endpoint (DONE 2026-04-19)
**Description:** Multer + local `/uploads/` directory + `POST /files/upload` + `GET /files/:id`. Integrated into AppModule. Required for TaskCreateForm file attachments.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-19)
**Status:** DONE

---

**Priority:** P2
**Title:** Recruitment module — frontend + backend
**Description:** `Recruitment.tsx` Refs component ready but no backend endpoint exists. Need `POST /api/v1/militia/recruitment` + approval workflow before frontend can be implemented. Deferred until backend endpoint is added.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-19)
**Status:** DONE — Recruitment module fully implemented v0.2.1.0 (2026-04-30)

---

**Priority:** P1
**Title:** IDOR on GET /leave/:id — missing ownership check
**Description:** Any authenticated user can read any leave request without checking if they own it or have reviewer role. `leave.controller.ts:66` `getLeaveRequest(id)` — no `user` param passed to service. Fix: pass `req.user` and enforce `requester_id = user.sub` for non-reviewer roles in service.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-30)

---

**Priority:** P1
**Title:** Stored XSS in payroll HTML export
**Description:** `payroll.service.ts` `exportHtml()` interpolates `fullName`, `militiaCode`, `unitName` from DB directly into HTML without escaping. A militia profile name like `<script>alert(1)</script>` executes in reviewer's browser. Fix: HTML-escape all DB values before embedding in template.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-30)

---

**Priority:** P1
**Title:** submitReport allows reports on cancelled/completed tasks
**Description:** `tasks.service.ts` `submitReport()` has no status guard — can submit a report on a cancelled task, which then reactivates it to 'completed', bypassing cancellation. Fix: check `task.status === 'in_progress'` before inserting report.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-30)

---

**Priority:** P2
**Title:** Recruitment status transitions — no state machine guard
**Description:** `recruitment.service.ts` `updateApplication()` allows arbitrary status changes without validating allowed transitions (e.g., can skip 'reviewing', revert 'approved' back to 'new'). Add explicit allowed-transitions map.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-30)

---

**Priority:** P2
**Title:** Fix worker process leak in auth integration test
**Description:** `auth.integration.spec.ts` causes a worker process to force-exit after tests. Likely an open timer or DB connection not torn down. Run with `--detectOpenHandles` to find the leak.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

**Priority:** P2
**Title:** GPSTracking page — deferred until NestJS GPS module is implemented
**Description:** `GPSTracking.tsx` not included in this release. NestJS GPS module is empty (no API endpoints). Implement backend GPS endpoints first, then port the frontend.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Stub-Check Findings (2026-05-01)

### P1 — Critical: Inert buttons (no onClick handler)

**Priority:** P1
**Title:** MilitiaList "Thêm DQTV" button — no onClick
**Description:** `Web/frontend/src/components/militia/MilitiaList.tsx:210` — green "Thêm DQTV" (Add Militia Member) primary action button renders with no onClick handler. Clicking does nothing. Wire up to open a create-militia modal or navigate to creation form.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

**Priority:** P1
**Title:** AttendanceReportPage "Xuất Excel" button — no onClick
**Description:** `Web/frontend/src/pages/AttendanceReportPage.tsx:70` — "Xuất Excel" (Export Excel) export button has no onClick handler. Wire up to the CSV/Excel export utility (see `ActivityLogPage.tsx` export pattern).
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

**Priority:** P1
**Title:** MilitiaProfilePage "Chỉnh sửa" button — no onClick
**Description:** `Web/frontend/src/pages/MilitiaProfilePage.tsx:260` — red "Chỉnh sửa" (Edit Profile) primary action button has no onClick handler. Wire up to open edit modal or navigate to edit page.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

### P3 — Medium: Missing backend test specs

**Priority:** P3
**Title:** Web/backend — 24 controllers missing .spec.ts
**Description:** All controllers in `Web/backend/src/` have no spec file: admin, assignments, attendance, auth, chat, dashboard, exemption, files, gps, health, kpi, leave, militia, official-documents, organization, payroll, recruitment, sos, tasks, training, users/profile, users/users, weapons, work-reports controllers.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

**Priority:** P3
**Title:** Web/backend — 5 services missing .spec.ts
**Description:** `app.service.ts`, `chat/chat.service.ts`, `exemption/exemption.service.ts`, `files/files.service.ts`, `official-documents/official-documents.service.ts` — all lack spec files.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

**Priority:** P3
**Title:** core/backend — 12 services missing .spec.ts
**Description:** All services in `core/backend/src/services/` lack spec files: alert, attendance, auth, chat, gps, incident, kpi, leave, notification, report, task, user services.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-05-01)

---

## Phase 4 (Polish)

**Priority:** P3
**Title:** PulseIndicator animated widget (Flutter both apps)
**Description:** Animated online-status pulse indicator for militia cards.
**Noticed on:** feat/mms-phase1-phase2-implementation (2026-04-18)

## Completed (2026-04-19 continued)

- **PayrollPage** — full KPI table + period selector + lock mutation + CSV export (2026-04-19)
- **QuickActionsWidget** — floating FAB + popup with 8 navigation shortcuts (2026-04-19)
- **TaskCreateForm enhanced** — location field + file upload via FilesModule (2026-04-19)
- **PoliceApp: ForgotPasswordScreen** — 4-step OTP recovery flow (2026-04-19)
- **PoliceApp: MyTasksScreen** — already existed in tasks_screen_dqtv.dart (verified)
- **FilesModule (NestJS)** — Multer upload + file serve (2026-04-19)
- **MilitiaList enhanced** — unit/status filters + CSV export + profile navigation (2026-04-19)
- **MilitiaProfilePage** — 6-tab profile view (2026-04-19)
- **Backend: POST /tasks/:id/report** — task report submission endpoint + tests (2026-04-19)
- **Backend: KpiModule POST /kpi/evaluate** — CA evaluation with weighted score + duplicate guard (2026-04-19)
- **Backend: GET /attendance from/to range** — date range filter + backward-compat fallback (2026-04-19)
- **MilitianApp: TaskReportScreen** — audio/photo/GPS report form + pubspec + permissions (2026-04-19)
- **MilitianApp: IncidentReportScreen upgrade** — replaced timer mock with real AudioRecorder/AudioPlayer (2026-04-19)
- **MilitianApp: task report route** — /tasks/:id/report + "Báo cáo" button in TasksListScreen (2026-04-19)
- **PoliceApp: ChiTieuEvaluationScreen** — 5 weighted sliders + recommendation chips + POST /kpi/evaluate (2026-04-19)
- **PoliceApp: AttendanceCalendar widget** — full-month GridView + from/to range API + integrated into CheckInScreen (2026-04-19)
- **SettingsNotificationsPage** — toggle prefs + save (2026-04-19)
- **SettingsChiTieuPage** — KPI target config (2026-04-19)
- **SettingsSystemPage** — read-only admin settings (2026-04-19)
- **TaskReportPage** — bar charts + stat cards (2026-04-19)
- **CustomReportPage** — date range + type selector + CSV export (2026-04-19)
- **ChiTieuDashboardPage** — KPI metric cards + trend line chart (2026-04-19)
- **ActivityLogPage** — paginated audit trail with search (2026-04-19)
- **ApprovalsPage** — approve/reject leave + task requests (2026-04-19)
- **TimesheetPage** — weekly grid attendance view (2026-04-19)
- **DocumentationPage** — accordion help content (2026-04-19)
- **MilitianApp: EvaluateDQTV screen** — 5-star criteria rating (2026-04-19)
- **MilitianApp: CreateTask screen** — task creation form (2026-04-19)
- **MilitianApp: Documentation screen** — ExpansionTile help sections (2026-04-19)
- **App.tsx routes + Sidebar** — all new pages registered (2026-04-19)

## Completed (2026-04-26 — v0.1.1.0)

- **CA→DQTV AssignmentsModule** — explicit 1-to-many assignment table + CRUD API (2026-04-26)
- **AssignmentManagePage** — split-panel admin UI for managing CA→DQTV assignments (2026-04-26)
- **Militia/Task/KPI scope enforcement** — CA officers restricted to assigned DQTV only (2026-04-26)
