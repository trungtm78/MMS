# E2E TEST PLAN — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

---

## 1. SCOPE

End-to-end test toàn bộ happy paths từ Flutter UI → BFF (3004) → Core (3001) → PostgreSQL.
Framework: Flutter Integration Test (`integration_test/`)

---

## 2. ENVIRONMENT

```
Flutter App   → http://localhost:3004 (BFF)
BFF           → http://localhost:3001 (Core)
Core DB       → PostgreSQL (local)
Test users    → ca001 / dqtv001 / dqtv002 / dqtv003
```

---

## 3. E2E TEST SUITES

### Suite E2E-001: Full CA Login → Task Create → DQTV Accept Flow

**Actors:** ca001 (CA), dqtv001 (DQTV)
**Steps:**

```
1. CA Login
   - Open app
   - Enter username='ca001', password='123456'
   - Tap [ĐĂNG NHẬP]
   - Assert: navigate to /ca/home
   - Assert: bottom nav has 5 tabs

2. CA Create Task
   - Tap tab [Nhiệm vụ]
   - Assert: CreateTaskScreen visible
   - Select type: 'patrol' (Tuần tra)
   - Enter title: 'E2E Test Task - Tuần tra KP1'
   - Select priority: 'high'
   - Select assignee: dqtv001
   - Tap [GIAO NHIỆM VỤ]
   - Assert: SnackBar 'Đã giao nhiệm vụ thành công'

3. DQTV Login (separate session)
   - Open app as dqtv001
   - Assert: /dqtv/home

4. DQTV Accept Task
   - Tap tab [Nhiệm vụ]
   - Assert: 'E2E Test Task' in list with status 'Chưa tiếp nhận'
   - Tap task card
   - Assert: TaskDetailScreen with [TIẾP NHẬN] button
   - Tap [TIẾP NHẬN]
   - Assert: status changes to 'Đang thực hiện'

5. DQTV Update Progress
   - Drag progress slider to 50%
   - Enter note: 'Đang tuần tra tuyến A'
   - Tap [CẬP NHẬT TIẾN ĐỘ]
   - Assert: progress bar shows 50%

6. DQTV Complete Task
   - Tap [NỘP BÁO CÁO HOÀN THÀNH]
   - Assert: status changes to 'Hoàn thành'
   - Assert: task moves to 'Hoàn thành' tab

7. CA Verify Task Completed
   - CA session: navigate to /ca/home
   - Assert: task shows as completed in home dashboard
```

**Expected total time:** < 3 minutes  
**Pass criteria:** All 7 steps complete without error

---

### Suite E2E-002: GPS Check-in → Location Tracking Flow

**Actors:** dqtv001, ca001  
**Prerequisite:** Mock GPS at in-range coordinates (10.82319, 106.62971)

```
1. DQTV Open CheckIn Screen
   - Navigate to /dqtv/checkin
   - Assert: map displays current location
   - Assert: distance indicator shows < 15m
   - Assert: [CHECK IN] button ENABLED

2. DQTV Check-in
   - Tap [CHECK IN]
   - Assert: POST /attendance/check-in called
   - Assert: ✅ 'Đã check-in: HH:MM' displayed
   - Assert: [CHECK OUT] button appears

3. GPS Update (Foreground)
   - Wait 30 seconds in foreground
   - Assert: POST /gps/update called at least once
   - Assert: gps_latest updated in DB

4. CA View Map
   - CA session: navigate to /ca/map (GPS Tracking)
   - Assert: dqtv001 marker visible on map
   - Assert: marker color = #10B981 (online)
   - Assert: marker position matches DQTV's location

5. Real-time Update
   - DQTV moves (mock GPS update to new position)
   - Assert: CA map updates marker without manual refresh
   - Assert: Socket.IO event 'location_update' triggers marker update

6. DQTV Check-out
   - DQTV: Tap [CHECK OUT] (after 17:00 or test override)
   - Assert: POST /attendance/check-out called
   - Assert: work_hours displayed
   - GPS updates stop
```

---

### Suite E2E-003: Leave Request Approval Flow

**Actors:** dqtv001 (submits via other system), ca001 (approves)  
**Prerequisite:** Seed a pending leave request for dqtv001 in DB

```
1. CA Navigate to Approvals
   - CA: Login, navigate to Leave Requests
   - Assert: pending request from dqtv001 visible

2. CA Approve
   - Tap [DUYỆT] on dqtv001's request
   - Assert: POST /leave-requests/:id/decision { action: 'approved' }
   - Assert: SnackBar 'Đã duyệt đơn nghỉ phép'
   - Assert: request moves to 'Đã duyệt' tab

3. CA Reject Another Request
   - Seed a second pending request
   - Tap [TỪ CHỐI]
   - Assert: Dialog appears with reason field
   - Enter reason: 'Đang trong đợt cao điểm tuần tra'
   - Tap [XÁC NHẬN]
   - Assert: POST with { action: 'rejected', reason: '...' }
   - Assert: request moves to 'Từ chối' tab
```

---

### Suite E2E-004: Work Report Submit Flow

**Actors:** dqtv001

```
1. Navigate to Report Screen
   - /dqtv/report
   - Assert: tabs [Hàng ngày][Sự vụ][Tháng]

2. Submit Daily Report (text only)
   - Select tab 'Hàng ngày'
   - Enter location: 'Khu phố 1, Phú Định'
   - Enter content: 'E2E test report - tuần tra không có bất thường'
   - Tap [GỬI BÁO CÁO]
   - Assert: POST /reports called
   - Assert: report appears in 'Đã gửi' section
   - Assert: status badge 'Chờ duyệt' (#F59E0B)

3. Submit Report with Image
   - Select 1 image (≤ 5MB)
   - Enter content: 'Report with image'
   - Tap [GỬI]
   - Assert: image included in response

4. Verify List
   - GET /reports/my
   - Assert: 2 reports in list
```

---

### Suite E2E-005: Alert Resolution Flow

**Actors:** ca001  
**Prerequisite:** Seed an active alert in DB

```
1. CA View Alerts
   - Navigate to /ca/alerts
   - Assert: GET /alerts?status=active
   - Assert: alert with severity badge displayed

2. CA Resolve Alert
   - Tap [XỬ LÝ] on alert
   - Assert: Dialog with note field
   - Enter note: 'Đã liên hệ DQTV, xác nhận có lý do'
   - Tap [XÁC NHẬN]
   - Assert: POST /alerts/:id/resolve
   - Assert: alert moves to 'Đã xử lý' tab

3. Verify Home Dashboard
   - Navigate to /ca/home
   - Assert: alert count decremented
```

---

### Suite E2E-006: Token Refresh Flow

**Prerequisite:** Expired access token in secure storage

```
1. Setup: Store expired access token manually
2. Perform any authenticated action (GET /users/me)
3. Assert: AuthInterceptor intercepts 401
4. Assert: POST /auth/refresh called automatically
5. Assert: New access token stored
6. Assert: Original request retried and succeeds
7. Assert: User sees no interruption
```

---

## 4. TEST CONFIGURATION

### flutter_test_config.dart
```dart
// integration_test/test_config.dart
const testBaseUrl = 'http://10.0.2.2:3004'; // Android emulator → localhost
const caUsername = 'ca001';
const caPassword = '123456';
const dqtvUsername = 'dqtv001';
const dqtvPassword = '123456';

// Mock GPS coordinates
const inRangeLat = 10.82319;
const inRangeLng = 106.62971;
const outOfRangeLat = 10.82328;
const outOfRangeLng = 106.62972;
```

### Run commands
```bash
# Single suite
flutter test integration_test/e2e_001_task_flow_test.dart

# All E2E
flutter test integration_test/

# With device
flutter test integration_test/ -d emulator-5554
```

---

## 5. TEST FILE STRUCTURE

```
integration_test/
├── test_config.dart
├── helpers/
│   ├── auth_helper.dart       ← login/logout helpers
│   ├── db_helper.dart         ← seed/cleanup test data
│   └── mock_gps_helper.dart   ← mock GPS coordinates
├── e2e_001_task_flow_test.dart
├── e2e_002_gps_checkin_test.dart
├── e2e_003_leave_approval_test.dart
├── e2e_004_report_submit_test.dart
├── e2e_005_alert_resolve_test.dart
└── e2e_006_token_refresh_test.dart
```

---

## 6. BOUNDARY VALUE TESTS

| Test | Input | Expected |
|---|---|---|
| GPS-BV-01 | distance = 0m | Check-in ENABLED |
| GPS-BV-02 | distance = 14.9m | Check-in ENABLED |
| GPS-BV-03 | distance = 15.0m | Check-in ENABLED |
| GPS-BV-04 | distance = 15.1m | Check-in DISABLED |
| GPS-BV-05 | distance = 100m | Check-in DISABLED |
| TIME-BV-01 | checkin at 08:29 | status = checked_in |
| TIME-BV-02 | checkin at 08:30 | status = checked_in (not late) |
| TIME-BV-03 | checkin at 08:31 | status = late |
| TIME-BV-04 | checkout at 16:59 | status = early_leave |
| TIME-BV-05 | checkout at 17:00 | status = checked_out (not early) |
| TIME-BV-06 | checkout at 17:01 | status = checked_out |
| IMG-BV-01 | 5 images, each 4.9MB | Upload OK |
| IMG-BV-02 | 5 images, 1 is 5.0MB | Upload OK |
| IMG-BV-03 | 5 images, 1 is 5.1MB | Reject: "Ảnh quá lớn" |
| IMG-BV-04 | 6th image attempt | Reject: "Tối đa 5 ảnh" |

---

## 7. ACCEPTANCE CRITERIA MAPPING

| User Story | E2E Suite | Test Scenarios |
|---|---|---|
| US-001 Login | E2E-006 | TS-001-01..08 |
| US-002 View Dashboard | E2E-001 | TS-009-01 |
| US-003 View DQTV | — | TS-008-01..04 |
| US-004 Create Task | E2E-001 | TS-004-01..04 |
| US-005 GPS Tracking | E2E-002 | TS-003-01..05 |
| US-006 Approve Leave | E2E-003 | TS-005-01..04 |
| US-007 Team Reports | — | TS-009-01..02 |
| US-008 Alerts | E2E-005 | TS-007-01..03 |
| US-009 CA Profile | — | UI manual |
| US-010 DQTV Dashboard | E2E-002 | TS-002-01 |
| US-011 My Tasks | E2E-001 | TS-004-05..08 |
| US-012 Check-in | E2E-002 | TS-002-01..09 |
| US-013 Work Report | E2E-004 | TS-006-01..06 |
| US-014 View KPI | — | TS (implicit) |
| US-015 DQTV Profile | — | UI manual |
| US-016 GPS Update | E2E-002 | TS-003-03 |
| US-017 Notifications | — | TS-011-01..03 |
| US-018 Token Refresh | E2E-006 | TS-010-01..02 |
| US-019 Error Handling | — | TS-012-01..04 |
