# MMS - Hệ thống Quản lý Dân Quân Tự Vệ

Hệ thống quản lý Dân Quân Tự Vệ đa nền tảng gồm 3 phân hệ:

- **Web** - Trung tâm quản trị, điều hành toàn hệ thống
- **MilitianApp** - Ứng dụng di động cho Dân Quân Tự Vệ
- **PoliceApp** - Ứng dụng di động cho Cán bộ Công An

## Kiến trúc

```
MMS/
├── core/           # Shared code, API, docs
├── Web/            # Web admin panel
├── MilitianApp/    # Mobile app for militia
├── PoliceApp/      # Mobile app for police
└── qa/             # Testing & QA
```

## Công nghệ

- **Database:** PostgreSQL 18
- **Web Frontend:** React/Vite
- **Mobile:** Flutter
- **Backend:** Node.js (shared core)
- **API:** REST API (`/api/v1/mms_core`)

## Cấu hình Database (Dev)

```
Host: localhost
Port: 5433
Database: MMS_Core
User: postgres
Password: postgres
```

## Bắt đầu

Xem [project_context.md](./project_context.md) để biết chi tiết cấu trúc dự án.

## Tài liệu

- [Business Flow](./core/docs/business/01_BUSINESS_FLOW.md)
- [User Stories](./core/docs/user-stories/US_LIST.md)
- [API Specification](./core/docs/technical/api_specification.md)
- [Database Schema](./core/docs/technical/erd.md)

## License

Private - Internal Use Only
