# ERD — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

Tất cả bảng nằm trong PostgreSQL chung với Core Backend.
PoliceApp chỉ thêm 1 bảng mới: `work_reports` (migration 010).

---

## ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AUTHENTICATION                              │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────┐ │
│  │    users     │────<│  user_roles  │>────│      roles          │ │
│  │──────────────│     │──────────────│     │─────────────────────│ │
│  │ id (PK)      │     │ user_id (FK) │     │ id (PK)             │ │
│  │ username     │     │ role_id (FK) │     │ code                │ │
│  │ password_hash│     └──────────────┘     │ name                │ │
│  │ full_name    │                          └─────────────────────┘ │
│  │ email        │                                    │              │
│  │ phone        │                          ┌─────────────────────┐ │
│  │ avatar_url   │                          │  role_permissions   │ │
│  │ status       │                          │─────────────────────│ │
│  │ created_at   │                          │ role_id (FK)        │ │
│  │ updated_at   │                          │ permission_id (FK)  │ │
│  └──────────────┘                          └─────────────────────┘ │
│         │                                            │              │
│         │                                  ┌─────────────────────┐ │
│         │                                  │     permissions     │ │
│         │                                  │─────────────────────│ │
│         │                                  │ id (PK)             │ │
│         │                                  │ code                │ │
│         │                                  │ name                │ │
│         │                                  │ module              │ │
│         │                                  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            PROFILES                                  │
│                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────────────┐ │
│  │   militia_profiles   │          │      police_profiles         │ │
│  │──────────────────────│          │──────────────────────────────│ │
│  │ id (PK)              │          │ id (PK)                      │ │
│  │ user_id (FK→users)   │          │ user_id (FK→users)           │ │
│  │ militia_code (UNIQUE)│          │ badge_no (UNIQUE)            │ │
│  │ full_name            │          │ full_name                    │ │
│  │ cccd                 │          │ cccd                         │ │
│  │ dob                  │          │ dob                          │ │
│  │ gender               │          │ gender                       │ │
│  │ phone                │          │ phone                        │ │
│  │ address              │          │ unit_id (FK→units)           │ │
│  │ unit_id (FK→units)   │          │ position                     │ │
│  │ position             │          │ rank                         │ │
│  │ rank                 │          │ appointment_date             │ │
│  │ join_date            │          │ status                       │ │
│  │ status               │          └──────────────────────────────┘ │
│  └──────────────────────┘                                           │
│            │                                                        │
│            └────────────────────┐                                   │
│                                 ▼                                   │
│                       ┌─────────────────┐                          │
│                        │     units       │                          │
│                        │─────────────────│                          │
│                        │ id (PK)         │                          │
│                        │ code (UNIQUE)   │                          │
│                        │ name            │                          │
│                        │ address         │                          │
│                        │ latitude        │                          │
│                        │ longitude       │                          │
│                        │ parent_id (FK)  │                          │
│                        └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            TASKS                                     │
│                                                                     │
│  ┌─────────────────────┐       ┌──────────────────────────────────┐ │
│  │        tasks        │──────<│        task_assignments          │ │
│  │─────────────────────│       │──────────────────────────────────│ │
│  │ id (PK)             │       │ id (PK)                          │ │
│  │ code (UNIQUE)       │       │ task_id (FK→tasks)               │ │
│  │ title               │       │ assignee_id (FK→users)           │ │
│  │ description         │       │ assigned_by (FK→users)           │ │
│  │ type                │       │ status                           │ │
│  │   patrol/guard/     │       │   assigned/accepted/             │ │
│  │   inspection/       │       │   in_progress/completed          │ │
│  │   support/training/ │       │ progress (0-100)                 │ │
│  │   admin/other       │       │ note                             │ │
│  │ priority            │       │ assigned_at                      │ │
│  │   urgent/high/      │       │ completed_at                     │ │
│  │   medium/low        │       └──────────────────────────────────┘ │
│  │ status              │                                            │
│  │ deadline            │                                            │
│  │ location_name       │                                            │
│  │ location_lat        │                                            │
│  │ location_lng        │                                            │
│  │ created_by (FK)     │                                            │
│  │ created_at          │                                            │
│  │ updated_at          │                                            │
│  └─────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         ATTENDANCE & GPS                             │
│                                                                     │
│  ┌──────────────────────────┐     ┌────────────────────────────────┐│
│  │    attendance_records    │     │          gps_points            ││
│  │──────────────────────────│     │────────────────────────────────││
│  │ id (PK)                  │     │ id (PK)                        ││
│  │ user_id (FK→users)       │     │ user_id (FK→users)             ││
│  │ work_date                │     │ lat                            ││
│  │ checkin_at               │     │ lng                            ││
│  │ checkin_lat              │     │ accuracy                       ││
│  │ checkin_lng              │     │ speed                          ││
│  │ checkout_at              │     │ heading                        ││
│  │ checkout_lat             │     │ battery                        ││
│  │ checkout_lng             │     │ recorded_at                    ││
│  │ work_hours               │     └────────────────────────────────┘│
│  │ status                   │                                       │
│  │   checked_in/checked_out/│     ┌────────────────────────────────┐│
│  │   late/early_leave/      │     │          gps_latest            ││
│  │   absent                 │     │────────────────────────────────││
│  │ source                   │     │ user_id (PK, FK→users)         ││
│  │ is_late                  │     │ lat                            ││
│  │ is_early_leave           │     │ lng                            ││
│  └──────────────────────────┘     │ accuracy                       ││
│                                   │ speed                          ││
│                                   │ heading                        ││
│                                   │ battery                        ││
│                                   │ status (online/offline)        ││
│                                   │ last_seen_at                   ││
│                                   └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       LEAVE REQUESTS                                 │
│                                                                     │
│  ┌────────────────────────┐    ┌──────────────────────────────────┐ │
│  │     leave_requests     │    │         leave_types              │ │
│  │────────────────────────│    │──────────────────────────────────│ │
│  │ id (PK)                │    │ id (PK)                          │ │
│  │ code (UNIQUE)          │    │ code (UNIQUE)                    │ │
│  │ requester_id (FK)      │────│ name                             │ │
│  │ leave_type_id (FK)     │    │ max_days_per_year                │ │
│  │ from_date              │    └──────────────────────────────────┘ │
│  │ to_date                │                                         │
│  │ total_days             │                                         │
│  │ reason                 │                                         │
│  │ status                 │                                         │
│  │   pending/approved/    │                                         │
│  │   rejected/cancelled   │                                         │
│  │ approved_by (FK)       │                                         │
│  │ approval_reason        │                                         │
│  │ approved_at            │                                         │
│  └────────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        KPI & ALERTS                                  │
│                                                                     │
│  ┌─────────────────────────┐    ┌──────────────────────────────────┐│
│  │       kpi_scores        │    │            alerts                ││
│  │─────────────────────────│    │──────────────────────────────────││
│  │ id (PK)                 │    │ id (PK)                          ││
│  │ user_id (FK→users)      │    │ category                         ││
│  │ period_year             │    │   attendance/gps/task/kpi/system ││
│  │ period_month            │    │ severity                         ││
│  │ attendance_score        │    │   info/warning/urgent/critical   ││
│  │ task_score              │    │ title                            ││
│  │ discipline_score        │    │ message                          ││
│  │ attitude_score          │    │ target_user_id (FK→users)        ││
│  │ supervisor_score        │    │ status                           ││
│  │ total_score             │    │   active/acknowledged/resolved   ││
│  │ rank                    │    │ is_read                          ││
│  │ rank_in_unit            │    │ resolved_by (FK→users)           ││
│  └─────────────────────────┘    │ resolved_at                      ││
│                                 │ resolve_note                     ││
│                                 │ created_at                       ││
│                                 └──────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATIONS & REPORTS                           │
│                                                                     │
│  ┌───────────────────────────┐    ┌──────────────────────────────┐  │
│  │       notifications       │    │        work_reports          │  │
│  │───────────────────────────│    │  [NEW — migration 010]       │  │
│  │ id (PK)                   │    │──────────────────────────────│  │
│  │ user_id (FK→users)        │    │ id (PK)                      │  │
│  │ type                      │    │ user_id (FK→users)           │  │
│  │   task/leave/kpi/alert/   │    │ report_type                  │  │
│  │   attendance/system       │    │   daily/incident/monthly     │  │
│  │ title                     │    │ content (TEXT)               │  │
│  │ body                      │    │ location (VARCHAR 255)       │  │
│  │ data (JSONB)              │    │ images (JSONB default '[]')  │  │
│  │ is_read                   │    │ status                       │  │
│  │ read_at                   │    │   pending/reviewed           │  │
│  │ created_at                │    │ reviewed_by (FK→users)       │  │
│  └───────────────────────────┘    │ reviewed_at                  │  │
│                                   │ created_at                   │  │
│                                   │ updated_at                   │  │
│                                   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## TABLE DETAILS

### users
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| username | VARCHAR(50) | UNIQUE NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt |
| full_name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | UNIQUE | |
| phone | VARCHAR(20) | | |
| avatar_url | TEXT | | |
| status | VARCHAR(20) | DEFAULT 'active' | active/inactive/suspended |
| mfa_enabled | BOOLEAN | DEFAULT false | |
| mfa_secret | TEXT | | encrypted |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

### militia_profiles
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users, UNIQUE | 1:1 |
| militia_code | VARCHAR(50) | UNIQUE NOT NULL | HCM-PHD-T12-0001 |
| full_name | VARCHAR(255) | NOT NULL | |
| cccd | VARCHAR(20) | UNIQUE | |
| dob | DATE | | |
| gender | VARCHAR(10) | | male/female/other |
| phone | VARCHAR(20) | | |
| address | TEXT | | |
| unit_id | UUID | FK→units | |
| position | VARCHAR(100) | | |
| rank | VARCHAR(50) | | |
| join_date | DATE | | |
| status | VARCHAR(20) | DEFAULT 'active' | |

### police_profiles
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users, UNIQUE | 1:1 |
| badge_no | VARCHAR(50) | UNIQUE NOT NULL | CA-KV-001 |
| full_name | VARCHAR(255) | NOT NULL | |
| cccd | VARCHAR(20) | | |
| dob | DATE | | |
| gender | VARCHAR(10) | | |
| phone | VARCHAR(20) | | |
| unit_id | UUID | FK→units | |
| position | VARCHAR(100) | | Công an khu vực |
| rank | VARCHAR(50) | | Trung úy |
| appointment_date | DATE | | |
| status | VARCHAR(20) | DEFAULT 'active' | |

### tasks
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| code | VARCHAR(20) | UNIQUE NOT NULL | NV-YYYYMM-NNNN |
| title | VARCHAR(255) | NOT NULL | |
| description | TEXT | | |
| type | VARCHAR(30) | NOT NULL | patrol/guard/inspection/support/training/admin/other |
| priority | VARCHAR(20) | NOT NULL | urgent/high/medium/low |
| status | VARCHAR(30) | DEFAULT 'pending' | pending/assigned/in_progress/completed/cancelled/overdue |
| deadline | TIMESTAMPTZ | | |
| location_name | VARCHAR(255) | | |
| location_lat | NUMERIC(10,7) | | |
| location_lng | NUMERIC(10,7) | | |
| created_by | UUID | FK→users | CA tạo |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

### task_assignments
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| task_id | UUID | FK→tasks | |
| assignee_id | UUID | FK→users | DQTV |
| assigned_by | UUID | FK→users | CA |
| status | VARCHAR(30) | DEFAULT 'assigned' | assigned/accepted/in_progress/completed |
| progress | INTEGER | DEFAULT 0 | 0-100 |
| note | TEXT | | |
| assigned_at | TIMESTAMPTZ | DEFAULT NOW() | |
| completed_at | TIMESTAMPTZ | | |

### attendance_records
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| work_date | DATE | NOT NULL | UNIQUE per user per day |
| checkin_at | TIMESTAMPTZ | | |
| checkin_lat | NUMERIC(10,7) | | |
| checkin_lng | NUMERIC(10,7) | | |
| checkout_at | TIMESTAMPTZ | | |
| checkout_lat | NUMERIC(10,7) | | |
| checkout_lng | NUMERIC(10,7) | | |
| work_hours | NUMERIC(5,2) | | auto-calculated |
| status | VARCHAR(20) | DEFAULT 'checked_in' | checked_in/checked_out/late/early_leave/absent |
| source | VARCHAR(20) | DEFAULT 'mobile' | |
| is_late | BOOLEAN | DEFAULT false | |
| is_early_leave | BOOLEAN | DEFAULT false | |

### gps_latest
| Column | Type | Constraint | Notes |
|---|---|---|---|
| user_id | UUID | PK, FK→users | 1 row per user |
| lat | NUMERIC(10,7) | NOT NULL | |
| lng | NUMERIC(10,7) | NOT NULL | |
| accuracy | NUMERIC(6,2) | | meters |
| speed | NUMERIC(6,2) | | m/s |
| heading | NUMERIC(6,2) | | degrees |
| battery | INTEGER | | 0-100 |
| status | VARCHAR(20) | DEFAULT 'online' | online/offline |
| last_seen_at | TIMESTAMPTZ | DEFAULT NOW() | |

Status online: last_seen_at < NOW() - 2 minutes
Status offline: last_seen_at >= NOW() - 2 minutes

### leave_requests
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| code | VARCHAR(30) | UNIQUE NOT NULL | LEAVE-YYYYMM-NNN |
| requester_id | UUID | FK→users | DQTV |
| leave_type_id | UUID | FK→leave_types | |
| from_date | DATE | NOT NULL | |
| to_date | DATE | NOT NULL | |
| total_days | INTEGER | NOT NULL | |
| reason | TEXT | NOT NULL | |
| status | VARCHAR(20) | DEFAULT 'pending' | pending/approved/rejected/cancelled |
| approved_by | UUID | FK→users | CA |
| approval_reason | TEXT | | |
| approved_at | TIMESTAMPTZ | | |

### kpi_scores
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users | |
| period_year | INTEGER | NOT NULL | |
| period_month | INTEGER | NOT NULL | 1-12 |
| attendance_score | NUMERIC(5,2) | | |
| task_score | NUMERIC(5,2) | | |
| discipline_score | NUMERIC(5,2) | | |
| attitude_score | NUMERIC(5,2) | | |
| supervisor_score | NUMERIC(5,2) | | |
| total_score | NUMERIC(5,2) | | |
| rank | INTEGER | | rank overall |
| rank_in_unit | INTEGER | | rank within unit |

### alerts
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK | |
| category | VARCHAR(30) | NOT NULL | attendance/gps/task/kpi/system |
| severity | VARCHAR(20) | NOT NULL | info/warning/urgent/critical |
| title | VARCHAR(255) | NOT NULL | |
| message | TEXT | NOT NULL | |
| target_user_id | UUID | FK→users | DQTV liên quan |
| status | VARCHAR(20) | DEFAULT 'active' | active/acknowledged/resolved |
| is_read | BOOLEAN | DEFAULT false | |
| resolved_by | UUID | FK→users | CA xử lý |
| resolved_at | TIMESTAMPTZ | | |
| resolve_note | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

### work_reports (NEW — migration 010)
| Column | Type | Constraint | Notes |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | |
| user_id | UUID | NOT NULL FK→users ON DELETE CASCADE | DQTV gửi |
| report_type | VARCHAR(30) | NOT NULL CHECK IN ('daily','incident','monthly') | |
| content | TEXT | NOT NULL | |
| location | VARCHAR(255) | | tên địa điểm |
| images | JSONB | DEFAULT '[]' | mảng base64 URLs |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' CHECK IN ('pending','reviewed') | |
| reviewed_by | UUID | FK→users ON DELETE SET NULL | CA review |
| reviewed_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Indexes:** idx_work_reports_user(user_id), idx_work_reports_type(report_type), idx_work_reports_status(status), idx_work_reports_created(created_at)

---

## KEY RELATIONSHIPS

| Relationship | Type | Notes |
|---|---|---|
| users → militia_profiles | 1:1 | DQTV profile |
| users → police_profiles | 1:1 | CA profile |
| users → user_roles | 1:N | role assignments |
| roles → role_permissions | 1:N | permission assignments |
| users → tasks (created_by) | 1:N | CA tạo task |
| tasks → task_assignments | 1:N | task giao cho nhiều DQTV |
| users → task_assignments (assignee) | 1:N | DQTV nhận nhiều task |
| users → attendance_records | 1:N | 1 record per day |
| users → gps_latest | 1:1 | snapshot vị trí cuối cùng |
| users → gps_points | 1:N | lịch sử GPS |
| users → leave_requests (requester) | 1:N | DQTV gửi đơn |
| users → leave_requests (approved_by) | 1:N | CA duyệt đơn |
| users → kpi_scores | 1:N | 1 record per month |
| users → alerts (target) | 1:N | cảnh báo về DQTV |
| users → work_reports | 1:N | DQTV gửi báo cáo |
| militia_profiles → units | N:1 | DQTV thuộc khu phố |
| police_profiles → units | N:1 | CA phụ trách phường |
