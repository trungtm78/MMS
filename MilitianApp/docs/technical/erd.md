# ERD — MilitianApp Flutter (Data Models)
Task ID: TASK-2026-001
Date: 2026-03-08
Version: v2.0 (Flutter Rewrite)

> Note: ERD này mô tả Dart models dùng trong Flutter app và
> DB migrations cần thêm vào backend cho 2FA/TOTP.

---

## DART MODEL DEFINITIONS

### AuthState (Riverpod + Flutter Secure Storage)
```dart
class AuthState {
  final String? accessToken;
  final String? refreshToken;
  final String? mfaSessionToken;   // temporary, during 2FA flow
  final User? user;
  final bool isAuthenticated;
  final bool mfaSetupRequired;     // first-time setup
  final bool biometricEnabled;
}
```

### User
```dart
class User {
  final String id;
  final String username;
  final String fullName;
  final String? email;
  final String role;               // 'dqtv' | 'police' | 'admin'
  final bool mfaEnabled;
}
```

### MilitiaProfile
```dart
class MilitiaProfile {
  final String id;
  final String userId;
  final String militiaCode;        // HCM-PHD-T12-0001
  final String fullName;
  final String cccd;               // 12 digits
  final String dob;                // ISO date
  final String unitId;
  final String? district;
  final Supervisor? supervisor;
  final String position;
  final String startDate;
  final EmergencyContact? emergencyContact;
}

class Supervisor { final String id; final String fullName; }
class EmergencyContact { final String name; final String relationship; final String phone; }
```

### Task
```dart
class Task {
  final String id;
  final String code;               // NV-2026-001
  final String title;
  final String? description;
  final String type;               // patrol, meeting, report, other
  final TaskPriority priority;     // urgent | high | medium | low
  final TaskStatus status;         // pending | in-progress | completed | overdue
  final DateTime deadline;
  final TaskLocation? location;
  final AssignedBy assignedBy;
  final int progress;              // 0-100
  final List<TaskUpdate> updates;
  final DateTime createdAt;
}

enum TaskPriority { urgent, high, medium, low }
enum TaskStatus { pending, inProgress, completed, overdue }
class TaskLocation { final String? name; final double? lat; final double? lng; }
class AssignedBy { final String id; final String fullName; final String? rank; }
```

### TaskUpdate
```dart
class TaskUpdate {
  final String id;
  final int progress;
  final String? note;
  final String updatedBy;
  final DateTime updatedAt;
}
```

### AttendanceRecord
```dart
class AttendanceRecord {
  final String id;
  final String militiaId;
  final DateTime checkinAt;
  final DateTime? checkoutAt;
  final GpsPoint? checkinLocation;
  final GpsPoint? checkoutLocation;
  final AttendanceStatus status;   // on_time | late | absent | missing_checkout
  final double? totalHours;
}

enum AttendanceStatus { onTime, late, absent, missingCheckout }
class GpsPoint { final double lat; final double lng; final double? accuracy; }
```

### LeaveRequest
```dart
class LeaveRequest {
  final String id;
  final String code;               // NP-2026-001
  final String requesterId;
  final String leaveTypeId;
  final String? leaveTypeName;
  final DateTime fromDate;
  final DateTime toDate;
  final bool isHalfDay;
  final String reason;
  final String? replacementUserId;
  final LeaveStatus status;        // pending | approved | rejected | cancelled
  final String? approverName;
  final String? approvalNote;
  final DateTime createdAt;
}

enum LeaveStatus { pending, approved, rejected, cancelled }
```

### LeaveType
```dart
class LeaveType {
  final String id;
  final String name;
  final int maxDays;
  final int remainingDays;
  final String? note;
}
```

### IncidentReport
```dart
class IncidentReport {
  final String id;
  final String code;               // BC-2026-001
  final String reporterId;
  final IncidentType incidentType;
  final IncidentSeverity severity;
  final String title;
  final String description;
  final GpsPoint? location;
  final int peopleInvolved;
  final bool hasInjury;
  final List<String> actionsToken;
  final IncidentStatus status;
  final DateTime createdAt;
}

enum IncidentType { security, fire, medical, accident, utility, other }
enum IncidentSeverity { low, medium, high, urgent }
enum IncidentStatus { open, acknowledged, resolved }
```

### NotificationItem
```dart
class NotificationItem {
  final String id;
  final NotificationType type;     // task | attendance | leave | kpi | alert | system | message
  final String title;
  final String body;
  final Map<String, dynamic>? payload;
  final bool isRead;
  final bool isUrgent;
  final DateTime deliveredAt;
  final DateTime? readAt;
  final String? actionUrl;
}

enum NotificationType { task, attendance, leave, kpi, alert, system, message }
```

### Conversation & Message (Chat)
```dart
class Conversation {
  final String id;
  final Participant participant;
  final Message? lastMessage;
  final int unreadCount;
  final DateTime updatedAt;
}

class Participant { final String id; final String fullName; final String role; }

class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final String senderName;
  final String content;
  final List<String> attachmentUrls;
  final bool isRead;
  final DateTime sentAt;
}
```

### GpsState (Location Provider)
```dart
class GpsState {
  final double? lat;
  final double? lng;
  final double? accuracy;
  final GpsStatus status;          // idle | loading | success | error
  final String? error;
}

enum GpsStatus { idle, loading, success, error }
```

---

## BACKEND DATABASE MIGRATIONS (cần thực hiện)

### Migration 001: Add 2FA to users table
```sql
-- Thêm cột 2FA vào bảng users hiện có
ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN mfa_enabled_at TIMESTAMP;
```

### Migration 002: Create recovery_codes table
```sql
CREATE TABLE recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   VARCHAR(64) NOT NULL,    -- bcrypt hash of the code
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_codes_user_id ON recovery_codes(user_id);
CREATE INDEX idx_recovery_codes_used ON recovery_codes(user_id, used);
```

### Migration 003: Create chat tables
```sql
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  sent_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE message_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  file_type   VARCHAR(50),
  file_size   INTEGER,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE message_reads (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
```

---

## BACKEND DATABASE TABLES (existing — reference)

| Flutter Model | Backend Table | Key Mapping |
|---|---|---|
| User | `users` | id, username, full_name, totp_secret, mfa_enabled |
| RecoveryCode | `recovery_codes` | user_id, code_hash, used |
| MilitiaProfile | `militia_profiles` | id, user_id, militia_code, cccd, dob, unit_id |
| Task | `tasks` + `task_assignments` | tasks.id, task_assignments.assignee_id |
| AttendanceRecord | `attendance_records` | militia_id, checkin_at, checkout_at, accuracy |
| LeaveRequest | `leave_requests` + `leave_approvals` | leave_requests.requester_id |
| IncidentReport | `incidents` | reporter_id, severity, message, lat, lng |
| NotificationItem | `notifications` + `notification_receipts` | notification_id, user_id, read_at |
| Conversation | `conversations` + `conversation_participants` | id |
| Message | `messages` | conversation_id, sender_id |

---

## LOCAL DRIFT DATABASE (cache on device)

```dart
// drift_database.dart
@DriftDatabase(tables: [
  TasksTable,
  AttendanceTable,
  NotificationsTable,
  ConversationsTable,
  MessagesTable,
])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  
  @override int get schemaVersion => 1;
}

// Tables for local caching
class TasksTable extends Table {
  TextColumn get id => text()();
  TextColumn get dataJson => text()();
  DateTimeColumn get syncedAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}

class AttendanceTable extends Table {
  TextColumn get id => text()();
  TextColumn get dataJson => text()();
  BoolColumn get synced => boolean().withDefault(const Constant(true))();
  DateTimeColumn get createdAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}

class NotificationsTable extends Table {
  TextColumn get id => text()();
  TextColumn get dataJson => text()();
  BoolColumn get isRead => boolean().withDefault(const Constant(false))();
  DateTimeColumn get receivedAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}
```

---

## DATA FLOW

```
MilitianApp (Flutter)
       │
       ▼ (HTTPS + Bearer JWT)
BFF Express Proxy (MilitianApp/backend — port 3003)
       │
       ▼ (forward to)
Core Backend (core/backend — port 3001)
       │
       ▼
PostgreSQL 18 (localhost:5433, DB: MMS)

WebSocket (real-time chat):
MilitianApp ←→ ws://localhost:3001 (socket.io)

Push Notifications:
Firebase FCM → Mobile OS → MilitianApp
```
