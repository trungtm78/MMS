# Deploy demo MMS (bản `master`, một đơn vị: Phường Phú Định)

Bản demo này là `master` (commit `6a35be6`, PR #11). Đây **chưa phải** bản multi-tenant.
Dữ liệu demo là dữ liệu giả (30 hồ sơ, 24 tài khoản, nhiệm vụ, chấm công, nghỉ phép, SOS…).

## 0. Cần có trên server
- Linux (Ubuntu 22.04+), 2 vCPU, 4 GB RAM, 20 GB trống, Docker Engine + plugin `docker compose` (v2).
- Cổng 80 mở. Cổng 443 chỉ cần khi có tên miền + chứng chỉ (xem mục 6).
- Gói này (thư mục `deploy-demo/`: `mms_demo.dump`, `aes_cccd.key`, `bootstrap-env.sh`) copy lên server.

## 1. Lấy mã nguồn đúng bản
```bash
git clone <URL-repo> mms && cd mms
git checkout 6a35be6          # hoặc: git checkout master
cp -r /đường/dẫn/deploy-demo ./deploy-demo   # nếu chưa nằm trong repo
```

## 2. Tạo file cấu hình (secret ngẫu nhiên)
```bash
./deploy-demo/bootstrap-env.sh http://IP-HOẶC-TÊN-MIỀN-CỦA-SERVER
```
Script ghi `.env` và `.env.docker` (quyền 600), tạo JWT/MFA/DB/Redis ngẫu nhiên, **dùng lại**
`AES_CCCD_KEY` trong `aes_cccd.key` vì CCCD trong dữ liệu demo đã mã hóa bằng khóa này.
Không commit hai file này. Không dùng khóa AES này cho dữ liệu thật.

## 3. Build ảnh (không cần registry)
```bash
docker build -t local/mms-backend:demo  Web/backend
docker build -t local/mms-frontend:demo Web/frontend
mkdir -p nginx/ssl
```

## 4. Nạp dữ liệu demo rồi chạy
```bash
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U mms -d mms_db --no-owner --no-acl < deploy-demo/mms_demo.dump
docker compose -f docker-compose.prod.yml up -d
```
Dữ liệu demo đang ở migration 034. Khi backend khởi động, nó tự áp migration 035 còn thiếu
(`RUN_MIGRATIONS` mặc định bật). Xem log: `docker compose -f docker-compose.prod.yml logs -f backend`.

## 5. Kiểm tra
```bash
curl -s http://localhost/api/v1/mms_core/health        # {"status":"ok",...}
```
Mở `http://IP-SERVER/` rồi đăng nhập:

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản trị hệ thống | `admin` | `Admin@123` |
| Các tài khoản khác | `ca.phuong`, `ca.kv1`, `ca.kv2`, `canbo.kp1`, `ubnd.phudinh`, `vanphong`, `dqtv01`…`dqtv24` | `Demo@123` |

Đổi mật khẩu `admin` nếu server mở ra Internet. Tài khoản demo chỉ dùng trên máy demo.

## 6. Lưu ý
- **App điện thoại:** app mặc định gọi `https`/`wss`. Với demo chạy HTTP thuần, app sẽ không kết nối
  được; cần tên miền + chứng chỉ (Let's Encrypt qua Caddy/nginx của host đặt trước compose), rồi sửa
  `nginx/conf.d/mms.conf` và `TRUST_PROXY` cùng lúc (xem chú thích đầu file đó). Chạy web trước.
- **Tệp đính kèm** của dữ liệu demo (ảnh, tài liệu) không nằm trong gói: các dòng tham chiếu còn,
  nhưng tải về sẽ lỗi 404. Tạo tệp mới trong demo thì dùng bình thường.
- **Giới hạn tốc độ đăng nhập:** 5 lần/5 phút/IP. Sai nhiều lần sẽ bị khóa tạm.
- **Sao lưu:** `docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U mms -d mms_db -Fc > backup.dump`.
- **Gỡ:** `docker compose -f docker-compose.prod.yml down -v` (xóa cả dữ liệu).
- Khi bản multi-tenant xong sẽ có gói deploy riêng (có bước backup, migrate theo `Web/backend/docs/migrations.md`).
