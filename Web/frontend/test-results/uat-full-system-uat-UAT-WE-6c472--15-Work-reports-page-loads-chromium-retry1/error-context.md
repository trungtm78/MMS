# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e7]: M
      - heading "Hệ thống MMS" [level=1] [ref=e8]
      - paragraph [ref=e9]: Quản lý Dân Quân Tự Vệ
    - form "Đăng nhập" [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: Tên đăng nhập
        - textbox "Tên đăng nhập" [ref=e13]:
          - /placeholder: Nhập tên đăng nhập
          - text: dqtv001
      - generic [ref=e14]:
        - generic [ref=e15]: Mật khẩu
        - textbox "Mật khẩu" [ref=e16]:
          - /placeholder: Nhập mật khẩu
          - text: Test@1234
      - generic [ref=e17]:
        - checkbox "Ghi nhớ tôi (7 ngày)" [ref=e18]
        - generic [ref=e19]: Ghi nhớ tôi (7 ngày)
      - alert [ref=e20]: Tên đăng nhập hoặc mật khẩu không đúng.
      - button "Đăng nhập" [ref=e21]
  - region "Notifications alt+T"
```