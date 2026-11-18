# MMS Design System

## Mobile auth screens (App Công An, App Dân Quân Tự Vệ)

The signed-out screens of both Flutter apps (login and forgot password) share one layout.
The only differences between the two apps are the logo (`AppLogo.asset`) and the app name (`appTitle`).

**Where the code lives.** Each app has the same building blocks in `lib/shared/widgets/auth_layout.dart`:
`AuthBackground`, `AuthBrandHeader`, `AuthCard`, `AuthFieldLabel`, `authInputDecoration`, `authLinkStyle`, `AuthBanner`, `AuthPrimaryButton`, `AuthFooter`.
If you change one app's copy, make the same change in the other app, then rerun both apps' login and forgot-password widget tests.

**Visual direction.** Formal and official, in the style of a state agency: the yellow gradient, a red name and a white card.
There is one accent colour (red). Green and navy are kept for check-in and status elements elsewhere in the apps.

| Element | Spec (tokens from `core/constants/app_colors.dart`, identical in both apps) |
|---|---|
| Background | `headerGradient` (#FBBF24 → #FDE047 → #FEF08A, top-left → bottom-right). It fills the whole screen. Content is centred vertically and scrolls, with 24 px padding. |
| Logo | `AppLogo(height: 120)`, `BoxFit.contain`, shown whole (no circle crop, no shadow). |
| App name | `appTitle` in capitals, 26 px, w900, `primary` #DC2626, letter-spacing 1.2. |
| System name | `authLoginSubtitle` "Hệ thống quản lý Dân quân tự vệ", 14 px, w600, `textDark` #1E293B. |
| Authority | `authLoginUnit` "UBND Phường Phú Định - TP. Hồ Chí Minh", 12 px, `textSecondary` #64748B. |
| Card | `surface` white, radius 20, 1.5 px border `cardBorder` #FDE047, shadow black 10% (blur 24, offset 0/8), padding 24. |
| Card title | "ĐĂNG NHẬP" / "KHÔI PHỤC MẬT KHẨU", 18 px, w800, `textPrimary` #0F172A, letter-spacing 1, centred. |
| Banner | Inside the card, above the fields, radius 12, 1.5 px border. Session notice: `cardBlueLight` fill with `navy` border and text (key `login_notice`). Error: `errorBg` fill with `primary` border and text (key `login_error`). Screen readers announce it (live region). Errors never use a SnackBar. |
| Field label | Above the field, 13 px, w600, `textDark`. |
| Field | Filled `background` #F8FAFC, radius 12, border 1 px `divider` #E2E8F0, focused border 2 px `primary`, error border `error`. Prefix icon `textSecondary`. The password eye has a "Hiện/Ẩn mật khẩu" tooltip. |
| Link | "Quên mật khẩu?", right-aligned, `primary`, 13 px, w600. |
| Primary button | Solid `primary`, full width, height 52, radius 12, white text 16 px w800 with letter-spacing 1. A 22 px spinner replaces the text while loading. |
| Secondary (DQTV biometric sign-in) | Outlined `navy` 1.5 px, height 48, radius 12. Shown only when biometrics are enabled. |
| Footer | "Phiên bản {version}", 12 px, `textSecondary`, under the card. |

**Forgot password.** The backend has no recovery route; passwords are reset by an administrator.
The screen shows the header, a card with an admin icon, the explanation, a "Quay lại đăng nhập" button and the footer.
The button returns to the screen that opened it, or to `/login` when the screen was opened directly.
