import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_vi.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('vi')];

  /// App name: window/task-switcher title (MaterialApp.onGenerateTitle).
  ///
  /// In vi, this message translates to:
  /// **'Dân Quân Tự Vệ'**
  String get appTitle;

  /// Generic cancel action for dialogs and in-progress flows.
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get commonCancelButton;

  /// Bottom navigation: home tab label.
  ///
  /// In vi, this message translates to:
  /// **'Trang chủ'**
  String get shellNavHome;

  /// Bottom navigation: attendance check-in tab label.
  ///
  /// In vi, this message translates to:
  /// **'Điểm danh'**
  String get shellNavCheckin;

  /// Bottom navigation: tasks tab label.
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ'**
  String get shellNavTasks;

  /// Bottom navigation: notifications tab label.
  ///
  /// In vi, this message translates to:
  /// **'Thông báo'**
  String get shellNavNotifications;

  /// Bottom navigation: profile tab label.
  ///
  /// In vi, this message translates to:
  /// **'Hồ sơ'**
  String get shellNavProfile;

  /// Screen-reader label of the app logo on the sign-in screens.
  ///
  /// In vi, this message translates to:
  /// **'Biểu trưng Dân quân tự vệ'**
  String get appLogoLabel;

  /// Sign-in screens: system name under the app name.
  ///
  /// In vi, this message translates to:
  /// **'Hệ thống quản lý Dân quân tự vệ'**
  String get authLoginSubtitle;

  /// Sign-in screens: owning authority under the system name.
  ///
  /// In vi, this message translates to:
  /// **'UBND Phường Phú Định - TP. Hồ Chí Minh'**
  String get authLoginUnit;

  /// Login screen: heading of the sign-in card.
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP'**
  String get authLoginCardTitle;

  /// Login screen: username field label.
  ///
  /// In vi, this message translates to:
  /// **'Tên đăng nhập'**
  String get authLoginUsernameLabel;

  /// Login screen: username field hint.
  ///
  /// In vi, this message translates to:
  /// **'Nhập tên đăng nhập'**
  String get authLoginUsernameHint;

  /// Login screen: password field label.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu'**
  String get authLoginPasswordLabel;

  /// Login screen: password field hint.
  ///
  /// In vi, this message translates to:
  /// **'Nhập mật khẩu'**
  String get authLoginPasswordHint;

  /// Login screen: submit button.
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP'**
  String get authLoginSubmitButton;

  /// Login screen: sign in with fingerprint/face button.
  ///
  /// In vi, this message translates to:
  /// **'Đăng nhập bằng sinh trắc học'**
  String get authLoginBiometricButton;

  /// System biometric prompt reason shown when signing in with biometrics.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực để đăng nhập'**
  String get authLoginBiometricReason;

  /// Login screen notice: the stored session ended (refresh refused, revoked or reused).
  ///
  /// In vi, this message translates to:
  /// **'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.'**
  String get authLoginNoticeSessionEnded;

  /// Login screen notice: the password was changed, which ends every session.
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu thành công, vui lòng đăng nhập lại.'**
  String get authLoginNoticePasswordChanged;

  /// Login screen: tooltip of the eye button while the password is hidden.
  ///
  /// In vi, this message translates to:
  /// **'Hiện mật khẩu'**
  String get authLoginShowPassword;

  /// Login screen: tooltip of the eye button while the password is shown.
  ///
  /// In vi, this message translates to:
  /// **'Ẩn mật khẩu'**
  String get authLoginHidePassword;

  /// Login screen: link to the forgot-password screen.
  ///
  /// In vi, this message translates to:
  /// **'Quên mật khẩu?'**
  String get authLoginForgotPassword;

  /// Sign-in screens: app version under the card.
  ///
  /// In vi, this message translates to:
  /// **'Phiên bản {version}'**
  String authLoginVersion(String version);

  /// Forgot-password screen: card title (shown in capitals).
  ///
  /// In vi, this message translates to:
  /// **'Khôi phục mật khẩu'**
  String get authForgotPasswordTitle;

  /// Forgot-password screen: there is no recovery route, an administrator resets passwords.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ chưa hỗ trợ khôi phục mật khẩu qua ứng dụng. Vui lòng liên hệ quản trị viên để được đặt lại mật khẩu.'**
  String get authForgotPasswordUnsupported;

  /// Forgot-password screen: back to the login screen.
  ///
  /// In vi, this message translates to:
  /// **'Quay lại đăng nhập'**
  String get authForgotPasswordBack;

  /// Second-factor sign-in screen title.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp'**
  String get authOtpTitle;

  /// Second-factor sign-in: instruction when the authenticator code method is selected.
  ///
  /// In vi, this message translates to:
  /// **'Nhập mã OTP từ ứng dụng xác thực'**
  String get authOtpInstructionTotp;

  /// Second-factor sign-in: instruction when the recovery code method is selected.
  ///
  /// In vi, this message translates to:
  /// **'Nhập một mã khôi phục đã lưu khi bật xác thực 2 lớp'**
  String get authOtpInstructionRecoveryCode;

  /// Second-factor sign-in: verify button.
  ///
  /// In vi, this message translates to:
  /// **'XÁC NHẬN'**
  String get authOtpVerifyButton;

  /// Snackbar after signing in with a recovery code: unused recovery codes left.
  ///
  /// In vi, this message translates to:
  /// **'{count, plural, other{Còn {count} mã khôi phục chưa dùng.}}'**
  String authOtpRecoveryCodesRemaining(int count);

  /// Second-factor method selector: authenticator app code.
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP'**
  String get authMfaMethodTotp;

  /// Second-factor method selector: one-time recovery code.
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục'**
  String get authMfaMethodRecoveryCode;

  /// Hint of a 6-digit authenticator code field.
  ///
  /// In vi, this message translates to:
  /// **'Nhập 6 chữ số'**
  String get authMfaOtpHint;

  /// Hint of a recovery code field: the code format (five characters, hyphen, five characters).
  ///
  /// In vi, this message translates to:
  /// **'XXXXX-XXXXX'**
  String get authMfaRecoveryCodeHint;

  /// Second-factor screens: start a new sign-in once the challenge is gone.
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP LẠI'**
  String get authMfaRestartLoginButton;

  /// Enrolment during sign-in: screen title.
  ///
  /// In vi, this message translates to:
  /// **'Cài đặt xác thực 2 lớp'**
  String get authMfaEnrollTitle;

  /// Enrolment during sign-in: why it is required and what to do.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản của bạn cần bật xác thực 2 lớp trước khi đăng nhập. Cài ứng dụng xác thực trên điện thoại rồi làm theo 2 bước dưới đây.'**
  String get authMfaEnrollIntro;

  /// Enrolment during sign-in: retry loading the enrolment after an error.
  ///
  /// In vi, this message translates to:
  /// **'THỬ LẠI'**
  String get authMfaEnrollRetryButton;

  /// Authenticator enrolment panel: step 1.
  ///
  /// In vi, this message translates to:
  /// **'1. Quét mã QR bằng ứng dụng xác thực (Microsoft Authenticator, Google Authenticator...)'**
  String get authMfaPanelStepScan;

  /// Accessibility label of the enrolment QR code.
  ///
  /// In vi, this message translates to:
  /// **'Mã QR thiết lập xác thực 2 lớp'**
  String get authMfaPanelQrSemantics;

  /// Authenticator enrolment panel: open the authenticator app with the setup link.
  ///
  /// In vi, this message translates to:
  /// **'Mở ứng dụng xác thực'**
  String get authMfaPanelOpenAuthenticator;

  /// Snackbar when no app handles the otpauth:// link.
  ///
  /// In vi, this message translates to:
  /// **'Không mở được ứng dụng xác thực. Hãy quét mã QR hoặc nhập khóa bí mật.'**
  String get authMfaPanelLaunchFailed;

  /// Authenticator enrolment panel: label above the secret for manual entry.
  ///
  /// In vi, this message translates to:
  /// **'Hoặc nhập khóa bí mật vào ứng dụng:'**
  String get authMfaPanelSecretIntro;

  /// Tooltip of the copy-secret button.
  ///
  /// In vi, this message translates to:
  /// **'Sao chép khóa bí mật'**
  String get authMfaPanelCopySecretTooltip;

  /// Snackbar after the secret was copied.
  ///
  /// In vi, this message translates to:
  /// **'Đã sao chép khóa bí mật'**
  String get authMfaPanelSecretCopied;

  /// Authenticator enrolment panel: deadline of the enrolment challenge.
  ///
  /// In vi, this message translates to:
  /// **'Hoàn tất trước {time}'**
  String authMfaPanelExpiresAt(String time);

  /// Authenticator enrolment panel: step 2.
  ///
  /// In vi, this message translates to:
  /// **'2. Nhập mã 6 chữ số đang hiển thị trong ứng dụng'**
  String get authMfaPanelStepCode;

  /// Authenticator enrolment panel: confirm the first code.
  ///
  /// In vi, this message translates to:
  /// **'XÁC NHẬN'**
  String get authMfaPanelConfirmButton;

  /// Recovery codes screen title.
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục'**
  String get authRecoveryCodesTitle;

  /// Recovery codes screen: shown once, keep them safe.
  ///
  /// In vi, this message translates to:
  /// **'Các mã này chỉ hiển thị một lần. Hãy lưu ở nơi an toàn: mỗi mã dùng được 1 lần để đăng nhập khi bạn không có ứng dụng xác thực.'**
  String get authRecoveryCodesWarning;

  /// Recovery codes screen: copy every code.
  ///
  /// In vi, this message translates to:
  /// **'Sao chép tất cả'**
  String get authRecoveryCodesCopyAll;

  /// Snackbar after the recovery codes were copied.
  ///
  /// In vi, this message translates to:
  /// **'Đã sao chép mã khôi phục'**
  String get authRecoveryCodesCopied;

  /// Recovery codes screen: share the codes.
  ///
  /// In vi, this message translates to:
  /// **'Chia sẻ'**
  String get authRecoveryCodesShare;

  /// Text shared with the recovery codes, one code per line.
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục xác thực 2 lớp (mỗi mã dùng được 1 lần):\n{codes}'**
  String authRecoveryCodesShareText(String codes);

  /// Subject of the shared recovery codes.
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục xác thực 2 lớp'**
  String get authRecoveryCodesShareSubject;

  /// Snackbar when sharing failed.
  ///
  /// In vi, this message translates to:
  /// **'Không chia sẻ được. Hãy sao chép các mã.'**
  String get authRecoveryCodesShareFailed;

  /// Recovery codes screen: checkbox confirming the codes were saved.
  ///
  /// In vi, this message translates to:
  /// **'Tôi đã lưu các mã ở nơi an toàn'**
  String get authRecoveryCodesAcknowledge;

  /// Recovery codes screen: continue once the codes were saved.
  ///
  /// In vi, this message translates to:
  /// **'Tiếp tục'**
  String get authRecoveryCodesContinue;

  /// Snackbar when the held session could not be started and no reason is known.
  ///
  /// In vi, this message translates to:
  /// **'Không thể hoàn tất đăng nhập. Vui lòng đăng nhập lại.'**
  String get authRecoveryCodesCompleteFailed;

  /// Profile tab title.
  ///
  /// In vi, this message translates to:
  /// **'Cá Nhân'**
  String get profileScreenTitle;

  /// Profile card: presence status.
  ///
  /// In vi, this message translates to:
  /// **'Đang hoạt động'**
  String get profileScreenStatusActive;

  /// Profile quick stat: years of service label.
  ///
  /// In vi, this message translates to:
  /// **'Thâm niên'**
  String get profileScreenStatSeniorityLabel;

  /// Profile quick stat: years of service value (placeholder figure until the backend provides it).
  ///
  /// In vi, this message translates to:
  /// **'2 năm 3 tháng'**
  String get profileScreenStatSeniorityValue;

  /// Profile quick stat: KPI score label.
  ///
  /// In vi, this message translates to:
  /// **'Điểm chỉ tiêu'**
  String get profileScreenStatKpiLabel;

  /// Profile quick stat: ranking label.
  ///
  /// In vi, this message translates to:
  /// **'Xếp hạng'**
  String get profileScreenStatRankLabel;

  /// Profile: personal information card title.
  ///
  /// In vi, this message translates to:
  /// **'Thông tin cá nhân'**
  String get profileScreenPersonalInfoTitle;

  /// Profile: phone number label.
  ///
  /// In vi, this message translates to:
  /// **'Số điện thoại'**
  String get profileScreenPhoneLabel;

  /// Profile: email label.
  ///
  /// In vi, this message translates to:
  /// **'Email'**
  String get profileScreenEmailLabel;

  /// Profile: unit label.
  ///
  /// In vi, this message translates to:
  /// **'Đơn vị'**
  String get profileScreenUnitLabel;

  /// Profile: work information card title.
  ///
  /// In vi, this message translates to:
  /// **'Thông tin công tác'**
  String get profileScreenWorkInfoTitle;

  /// Profile: assigned neighbourhood label.
  ///
  /// In vi, this message translates to:
  /// **'Khu phố'**
  String get profileScreenNeighborhoodLabel;

  /// Profile: assigned neighbourhood value (placeholder until the backend provides it).
  ///
  /// In vi, this message translates to:
  /// **'Khu phố 1'**
  String get profileScreenNeighborhoodValue;

  /// Profile: area police officer label.
  ///
  /// In vi, this message translates to:
  /// **'Công An KV'**
  String get profileScreenAreaPoliceLabel;

  /// Profile: area police officer value (placeholder until the backend provides it).
  ///
  /// In vi, this message translates to:
  /// **'Trung úy Võ Văn Tân'**
  String get profileScreenAreaPoliceValue;

  /// Profile: date joined the militia label.
  ///
  /// In vi, this message translates to:
  /// **'Ngày vào lực lượng'**
  String get profileScreenJoinedLabel;

  /// Profile: position grade label.
  ///
  /// In vi, this message translates to:
  /// **'Ngạch công tác'**
  String get profileScreenPositionLabel;

  /// Profile quick action: request leave.
  ///
  /// In vi, this message translates to:
  /// **'Đăng ký nghỉ phép'**
  String get profileScreenQuickLeaveRequest;

  /// Profile quick action: submitted leave requests.
  ///
  /// In vi, this message translates to:
  /// **'Đơn đã gửi'**
  String get profileScreenQuickMyRequests;

  /// Profile quick action: work history.
  ///
  /// In vi, this message translates to:
  /// **'Lịch sử công tác'**
  String get profileScreenQuickWorkHistory;

  /// Profile quick action: support hotline.
  ///
  /// In vi, this message translates to:
  /// **'Hotline hỗ trợ'**
  String get profileScreenQuickHotline;

  /// Profile menu: settings.
  ///
  /// In vi, this message translates to:
  /// **'Cài đặt'**
  String get profileScreenMenuSettings;

  /// Profile menu: security and two-factor authentication.
  ///
  /// In vi, this message translates to:
  /// **'Bảo mật / Xác thực 2 lớp'**
  String get profileScreenMenuSecurity;

  /// Profile menu: about the app.
  ///
  /// In vi, this message translates to:
  /// **'Về ứng dụng'**
  String get profileScreenMenuAbout;

  /// Profile menu: support.
  ///
  /// In vi, this message translates to:
  /// **'Hỗ trợ'**
  String get profileScreenMenuSupport;

  /// Profile: sign out.
  ///
  /// In vi, this message translates to:
  /// **'Đăng xuất'**
  String get profileScreenLogout;

  /// Settings screen title.
  ///
  /// In vi, this message translates to:
  /// **'Cài đặt'**
  String get profileSettingsTitle;

  /// Settings: security section header.
  ///
  /// In vi, this message translates to:
  /// **'Bảo mật'**
  String get profileSettingsSectionSecurity;

  /// Settings: biometric sign-in switch.
  ///
  /// In vi, this message translates to:
  /// **'Đăng nhập sinh trắc học'**
  String get profileSettingsBiometricTitle;

  /// Settings: biometric sign-in switch subtitle.
  ///
  /// In vi, this message translates to:
  /// **'Dùng vân tay / Face ID'**
  String get profileSettingsBiometricSubtitle;

  /// Settings: change password entry.
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu'**
  String get profileSettingsChangePasswordTitle;

  /// Settings: change password entry subtitle.
  ///
  /// In vi, this message translates to:
  /// **'Thay đổi mật khẩu đăng nhập'**
  String get profileSettingsChangePasswordSubtitle;

  /// Settings: notifications section header.
  ///
  /// In vi, this message translates to:
  /// **'Thông báo'**
  String get profileSettingsSectionNotifications;

  /// Settings: push notifications switch.
  ///
  /// In vi, this message translates to:
  /// **'Thông báo đẩy'**
  String get profileSettingsPushTitle;

  /// Settings: push notifications switch subtitle while on.
  ///
  /// In vi, this message translates to:
  /// **'Nhận thông báo đẩy'**
  String get profileSettingsPushOn;

  /// Settings: push notifications switch subtitle while off.
  ///
  /// In vi, this message translates to:
  /// **'Thông báo đẩy đã tắt'**
  String get profileSettingsPushOff;

  /// Change password screen title.
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu'**
  String get profileChangePasswordTitle;

  /// Change password screen: the backend password rule and the sign-out that follows.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới gồm ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt, không trùng 5 mật khẩu gần nhất. Đổi xong, mọi phiên đăng nhập kết thúc và bạn cần đăng nhập lại.'**
  String get profileChangePasswordRules;

  /// Change password: current password field label.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu hiện tại'**
  String get profileChangePasswordCurrentLabel;

  /// Change password: new password field label.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới'**
  String get profileChangePasswordNewLabel;

  /// Change password: confirm new password field label.
  ///
  /// In vi, this message translates to:
  /// **'Xác nhận mật khẩu mới'**
  String get profileChangePasswordConfirmLabel;

  /// Change password: submit button.
  ///
  /// In vi, this message translates to:
  /// **'ĐỔI MẬT KHẨU'**
  String get profileChangePasswordSubmitButton;

  /// Change password: the confirmation differs from the new password.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu xác nhận không khớp.'**
  String get profileChangePasswordMismatch;

  /// Change password: the new password equals the current one.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới phải khác mật khẩu hiện tại.'**
  String get profileChangePasswordSameAsCurrent;

  /// Security screen title.
  ///
  /// In vi, this message translates to:
  /// **'Bảo mật'**
  String get profileSecurityTitle;

  /// Security screen: two-factor authentication heading.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp'**
  String get profileSecurityHeading;

  /// Security screen: what two-factor authentication means for the user.
  ///
  /// In vi, this message translates to:
  /// **'Mỗi lần đăng nhập, ngoài mật khẩu bạn nhập thêm mã 6 chữ số từ ứng dụng xác thực.'**
  String get profileSecurityIntro;

  /// Security screen: reload the status after an error.
  ///
  /// In vi, this message translates to:
  /// **'THỬ LẠI'**
  String get profileSecurityRetryButton;

  /// Security screen: two-factor authentication is off.
  ///
  /// In vi, this message translates to:
  /// **'Chưa bật xác thực 2 lớp'**
  String get profileSecurityStatusDisabled;

  /// Security screen: two-factor authentication is on.
  ///
  /// In vi, this message translates to:
  /// **'Đã bật xác thực 2 lớp'**
  String get profileSecurityStatusEnabled;

  /// Security screen: date two-factor authentication was enabled.
  ///
  /// In vi, this message translates to:
  /// **'Ngày bật: {date}'**
  String profileSecurityEnabledOn(String date);

  /// Security screen: unused recovery codes left.
  ///
  /// In vi, this message translates to:
  /// **'{count, plural, other{Còn {count} mã khôi phục}}'**
  String profileSecurityRecoveryCodesRemaining(int count);

  /// Security screen: two or fewer recovery codes left.
  ///
  /// In vi, this message translates to:
  /// **'Sắp hết mã khôi phục. Hãy tạo lại bộ mã mới.'**
  String get profileSecurityRecoveryCodesLow;

  /// Security screen: the user's role requires two-factor authentication.
  ///
  /// In vi, this message translates to:
  /// **'Vai trò của bạn bắt buộc dùng xác thực 2 lớp.'**
  String get profileSecurityRequiredNote;

  /// Security screen: start enabling two-factor authentication.
  ///
  /// In vi, this message translates to:
  /// **'BẬT XÁC THỰC 2 LỚP'**
  String get profileSecurityEnableButton;

  /// Security screen: restart an enrolment that can no longer continue.
  ///
  /// In vi, this message translates to:
  /// **'BẮT ĐẦU LẠI'**
  String get profileSecurityRestartSetupButton;

  /// Security screen: create a new set of recovery codes.
  ///
  /// In vi, this message translates to:
  /// **'Tạo lại mã khôi phục'**
  String get profileSecurityRegenerateButton;

  /// Security screen: disable two-factor authentication.
  ///
  /// In vi, this message translates to:
  /// **'Tắt xác thực 2 lớp'**
  String get profileSecurityDisableButton;

  /// Snackbar after two-factor authentication was disabled.
  ///
  /// In vi, this message translates to:
  /// **'Đã tắt xác thực 2 lớp'**
  String get profileSecurityDisabledSnack;

  /// Regenerate recovery codes dialog title.
  ///
  /// In vi, this message translates to:
  /// **'Tạo lại mã khôi phục'**
  String get profileSecurityRegenerateDialogTitle;

  /// Regenerate recovery codes dialog: asks for a code and warns the old codes stop working.
  ///
  /// In vi, this message translates to:
  /// **'Nhập mã 6 chữ số trong ứng dụng xác thực. Các mã khôi phục cũ sẽ không dùng được nữa.'**
  String get profileSecurityRegenerateDialogDescription;

  /// Regenerate recovery codes dialog: confirm button.
  ///
  /// In vi, this message translates to:
  /// **'TẠO LẠI'**
  String get profileSecurityRegenerateDialogConfirm;

  /// Disable two-factor authentication dialog title.
  ///
  /// In vi, this message translates to:
  /// **'Tắt xác thực 2 lớp'**
  String get profileSecurityDisableDialogTitle;

  /// Disable two-factor authentication dialog: which codes are accepted.
  ///
  /// In vi, this message translates to:
  /// **'Xác nhận bằng mã trong ứng dụng xác thực hoặc một mã khôi phục.'**
  String get profileSecurityDisableDialogDescription;

  /// Disable two-factor authentication dialog: confirm button.
  ///
  /// In vi, this message translates to:
  /// **'TẮT'**
  String get profileSecurityDisableDialogConfirm;

  /// Form validation: a required field is empty.
  ///
  /// In vi, this message translates to:
  /// **'Trường này không được để trống.'**
  String get validationRequired;

  /// Form validation: username shorter than 3 characters.
  ///
  /// In vi, this message translates to:
  /// **'Tên đăng nhập tối thiểu 3 ký tự.'**
  String get validationUsernameTooShort;

  /// Form validation: sign-in password shorter than 6 characters.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu tối thiểu 6 ký tự.'**
  String get validationPasswordTooShort;

  /// Form validation: new password breaks the backend rule (8+ characters, upper, lower, digit, special).
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.'**
  String get validationNewPasswordComplexity;

  /// Form validation: authenticator code is not exactly 6 digits.
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP phải gồm đúng 6 chữ số.'**
  String get validationOtpFormat;

  /// Form validation: recovery code field is empty.
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập mã khôi phục.'**
  String get validationRecoveryCodeRequired;

  /// Form validation: not a Vietnamese phone number.
  ///
  /// In vi, this message translates to:
  /// **'Số điện thoại không hợp lệ.'**
  String get validationPhoneInvalid;

  /// Backend code invalid_credentials (auth.service.ts), and any 401 of a sign-in step.
  ///
  /// In vi, this message translates to:
  /// **'Sai tên đăng nhập hoặc mật khẩu.'**
  String get errorAuthInvalidCredentials;

  /// Backend code account_disabled.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'**
  String get errorAuthAccountDisabled;

  /// Backend code account_locked.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản bị tạm khóa 30 phút do đăng nhập sai nhiều lần.'**
  String get errorAuthAccountLocked;

  /// Backend code no_role_assigned.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.'**
  String get errorAuthNoRoleAssigned;

  /// Backend code invalid_otp.
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP không hợp lệ hoặc đã hết hạn.'**
  String get errorAuthInvalidOtp;

  /// Backend code session_expired, and the fallback for a 401 outside sign-in.
  ///
  /// In vi, this message translates to:
  /// **'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'**
  String get errorAuthSessionExpired;

  /// A 403 of a sign-in step without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản không được phép đăng nhập. Vui lòng liên hệ quản trị viên.'**
  String get errorAuthLoginForbidden;

  /// App check: a successful sign-in answer lacks the access or refresh token.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về thiếu token đăng nhập'**
  String get errorAuthMissingTokens;

  /// App check: the account has no DQTV role, so it may not use this app.
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản không có quyền dùng ứng dụng này'**
  String get errorAuthRoleNotAllowed;

  /// App check: two-factor authentication is on but the answer carried no recovery codes.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ không trả về mã khôi phục. Vui lòng tạo lại mã khôi phục.'**
  String get errorAuthRecoveryCodesMissing;

  /// Backend code invalid_code (mfa.service.ts rejectCode).
  ///
  /// In vi, this message translates to:
  /// **'Mã xác thực không đúng.'**
  String get errorMfaInvalidCode;

  /// Backend code invalid_code with details.attemptsRemaining: wrong code and the attempts left.
  ///
  /// In vi, this message translates to:
  /// **'{count, plural, other{Mã xác thực không đúng. Còn {count} lần thử.}}'**
  String errorMfaInvalidCodeAttempts(int count);

  /// Backend code mfa_token_invalid: the second-factor challenge expired or was used.
  ///
  /// In vi, this message translates to:
  /// **'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.'**
  String get errorMfaTokenInvalid;

  /// Backend code mfa_attempts_exceeded.
  ///
  /// In vi, this message translates to:
  /// **'Bạn đã nhập sai quá số lần cho phép. Vui lòng đăng nhập lại.'**
  String get errorMfaAttemptsExceeded;

  /// Backend code mfa_locked.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp bị tạm khóa 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.'**
  String get errorMfaLocked;

  /// Backend code mfa_already_enabled.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp đã được bật cho tài khoản này.'**
  String get errorMfaAlreadyEnabled;

  /// Backend code mfa_not_enabled.
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp chưa được bật.'**
  String get errorMfaNotEnabled;

  /// Backend code mfa_required_by_role.
  ///
  /// In vi, this message translates to:
  /// **'Vai trò của bạn bắt buộc dùng xác thực 2 lớp nên không thể tắt.'**
  String get errorMfaRequiredByRole;

  /// Backend code mfa_setup_not_started.
  ///
  /// In vi, this message translates to:
  /// **'Chưa bắt đầu thiết lập xác thực 2 lớp. Vui lòng thử lại.'**
  String get errorMfaSetupNotStarted;

  /// Backend code mfa_reauthentication_required (POST /auth/refresh after MFA was enabled).
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản đã bật xác thực 2 lớp. Vui lòng đăng nhập lại.'**
  String get errorMfaReauthenticationRequired;

  /// Backend codes session_revoked, refresh_token_reused, refresh_token_revoked, invalid_refresh_token.
  ///
  /// In vi, this message translates to:
  /// **'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.'**
  String get errorSessionEnded;

  /// Backend code notification_not_found.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy thông báo.'**
  String get errorNotificationNotFound;

  /// Backend code not_a_participant.
  ///
  /// In vi, this message translates to:
  /// **'Bạn không phải thành viên của cuộc trò chuyện này.'**
  String get errorChatNotAParticipant;

  /// Backend code message_too_long (chat.service.ts MAX_MESSAGE_LENGTH 4000).
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn tối đa 4000 ký tự.'**
  String get errorChatMessageTooLong;

  /// Backend code message_content_required.
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn không được để trống.'**
  String get errorChatMessageContentRequired;

  /// Backend code invalid_conversation_id.
  ///
  /// In vi, this message translates to:
  /// **'Mã cuộc trò chuyện không hợp lệ.'**
  String get errorChatInvalidConversationId;

  /// Backend code direct_conversation_requires_one_participant.
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện trực tiếp cần đúng một người tham gia.'**
  String get errorChatDirectRequiresOneParticipant;

  /// Backend code participant_not_found.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy người tham gia.'**
  String get errorChatParticipantNotFound;

  /// Backend code not_joined.
  ///
  /// In vi, this message translates to:
  /// **'Bạn chưa tham gia phòng trò chuyện này.'**
  String get errorChatNotJoined;

  /// A chat socket acknowledgement refused with a code the app does not know.
  ///
  /// In vi, this message translates to:
  /// **'Không thể tham gia cuộc trò chuyện ({code}).'**
  String errorChatJoinFailed(String code);

  /// Backend code invalid_date.
  ///
  /// In vi, this message translates to:
  /// **'Ngày không hợp lệ.'**
  String get errorDateInvalid;

  /// Backend code leave_request_not_found.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy đơn nghỉ phép.'**
  String get errorLeaveRequestNotFound;

  /// Backend code not_your_leave_request.
  ///
  /// In vi, this message translates to:
  /// **'Bạn chỉ có thể hủy đơn của chính mình.'**
  String get errorLeaveNotYourRequest;

  /// Backend code leave_request_not_pending.
  ///
  /// In vi, this message translates to:
  /// **'Đơn đã được xử lý, không còn ở trạng thái chờ duyệt.'**
  String get errorLeaveRequestNotPending;

  /// Backend code task_not_found.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy nhiệm vụ.'**
  String get errorTaskNotFound;

  /// Backend code not_task_assignee.
  ///
  /// In vi, this message translates to:
  /// **'Bạn không được giao nhiệm vụ này.'**
  String get errorTaskNotAssignee;

  /// Backend code password_complexity (users.service.ts).
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.'**
  String get errorPasswordComplexity;

  /// Backend code password_reuse.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất.'**
  String get errorPasswordReuse;

  /// Backend code invalid_credentials answered by POST /users/me/change-password: the current password is wrong.
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu hiện tại không đúng.'**
  String get errorPasswordCurrentWrong;

  /// A 400 validation_failed: the first class-validator message from the backend (English).
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu không hợp lệ: {message}'**
  String errorValidationFailed(String message);

  /// Fallback for a 400 without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.'**
  String get errorStatusBadRequest;

  /// Fallback for a 403 without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Bạn không có quyền thực hiện thao tác này.'**
  String get errorStatusForbidden;

  /// Fallback for a 404 without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy dữ liệu.'**
  String get errorStatusNotFound;

  /// Fallback for a 409 without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.'**
  String get errorStatusConflict;

  /// Fallback for a 422 without a known code.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu không hợp lệ.'**
  String get errorStatusUnprocessable;

  /// Fallback for a 429 without a known code (ThrottlerGuard).
  ///
  /// In vi, this message translates to:
  /// **'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.'**
  String get errorStatusTooManyRequests;

  /// Fallback for any 5xx.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ đang gặp sự cố. Thử lại sau.'**
  String get errorStatusServer;

  /// Fallback for any other HTTP error status.
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi xảy ra ({status}).'**
  String errorStatusOther(int status);

  /// Connect, send or receive timeout.
  ///
  /// In vi, this message translates to:
  /// **'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.'**
  String get errorNetworkTimeout;

  /// The server could not be reached.
  ///
  /// In vi, this message translates to:
  /// **'Không kết nối được máy chủ. Kiểm tra mạng của bạn.'**
  String get errorNetworkConnection;

  /// The server certificate was refused.
  ///
  /// In vi, this message translates to:
  /// **'Lỗi chứng chỉ máy chủ. Liên hệ quản trị.'**
  String get errorNetworkBadCertificate;

  /// The request was cancelled.
  ///
  /// In vi, this message translates to:
  /// **'Yêu cầu đã bị huỷ.'**
  String get errorNetworkCancelled;

  /// The request failed in a way the HTTP client could not classify.
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi không xác định. Vui lòng thử lại.'**
  String get errorNetworkUnknown;

  /// Location permission refused.
  ///
  /// In vi, this message translates to:
  /// **'Ứng dụng chưa được cấp quyền vị trí. Vào Cài đặt để cấp quyền.'**
  String get errorLocationPermissionDenied;

  /// Location services are switched off on the device.
  ///
  /// In vi, this message translates to:
  /// **'Dịch vụ vị trí đang tắt. Hãy bật GPS trên thiết bị.'**
  String get errorLocationServiceDisabled;

  /// Any other failure.
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi xảy ra. Vui lòng thử lại.'**
  String get errorUnexpected;

  /// Title of an untitled direct conversation whose other person has no name in the answer (the ward police officer the militia member usually writes to).
  ///
  /// In vi, this message translates to:
  /// **'CA KV'**
  String get chatConversationUntitledDirect;

  /// Title of an untitled group conversation without named members.
  ///
  /// In vi, this message translates to:
  /// **'Nhóm trò chuyện'**
  String get chatConversationUntitledGroup;

  /// Title of an untitled group: the first member names, then how many more members there are.
  ///
  /// In vi, this message translates to:
  /// **'{names} +{count}'**
  String chatConversationGroupMembersMore(String names, int count);

  /// Conversation list screen: app bar title.
  ///
  /// In vi, this message translates to:
  /// **'Nhắn tin'**
  String get chatConversationsScreenTitle;

  /// Conversation list screen: shown when the user has no conversation.
  ///
  /// In vi, this message translates to:
  /// **'Chưa có cuộc trò chuyện'**
  String get chatConversationsScreenEmpty;

  /// Conversation list screen: button that loads the list again after a failure.
  ///
  /// In vi, this message translates to:
  /// **'Thử lại'**
  String get chatConversationsScreenRetryButton;

  /// Conversation list screen: tooltip of the button that starts a new conversation.
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện mới'**
  String get chatConversationsScreenNewTooltip;

  /// Chat screen: app bar title when the screen was opened without the conversation title.
  ///
  /// In vi, this message translates to:
  /// **'CA KV'**
  String get chatScreenTitleFallback;

  /// Chat screen: button that loads the message history again after a failure.
  ///
  /// In vi, this message translates to:
  /// **'Thử lại'**
  String get chatScreenRetryButton;

  /// Chat screen: hint of the message input.
  ///
  /// In vi, this message translates to:
  /// **'Nhập tin nhắn...'**
  String get chatScreenMessageHint;

  /// Chat screen: shown while another participant is typing.
  ///
  /// In vi, this message translates to:
  /// **'Đang nhập...'**
  String get chatScreenTypingIndicator;

  /// New conversation screen: app bar title.
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện mới'**
  String get chatNewConversationScreenTitle;

  /// New conversation screen: segment for a direct (one-to-one) conversation.
  ///
  /// In vi, this message translates to:
  /// **'Trực tiếp'**
  String get chatNewConversationDirectSegment;

  /// New conversation screen: segment for a group conversation.
  ///
  /// In vi, this message translates to:
  /// **'Nhóm'**
  String get chatNewConversationGroupSegment;

  /// New conversation screen: instruction in direct mode.
  ///
  /// In vi, this message translates to:
  /// **'Chọn đúng một người để trò chuyện'**
  String get chatNewConversationDirectHint;

  /// New conversation screen: instruction in group mode.
  ///
  /// In vi, this message translates to:
  /// **'Chọn một hoặc nhiều người tham gia'**
  String get chatNewConversationGroupHint;

  /// New conversation screen: label of the optional group title field.
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề nhóm (tùy chọn)'**
  String get chatNewConversationGroupTitleLabel;

  /// New conversation screen: hint of the people search field.
  ///
  /// In vi, this message translates to:
  /// **'Tìm theo tên hoặc tên đăng nhập...'**
  String get chatNewConversationSearchHint;

  /// New conversation screen: shown until the search has the shortest query GET /users/search accepts.
  ///
  /// In vi, this message translates to:
  /// **'{count, plural, other{Nhập ít nhất {count} ký tự để tìm người tham gia}}'**
  String chatNewConversationSearchTooShort(int count);

  /// New conversation screen: the search found nobody.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy người phù hợp'**
  String get chatNewConversationNoResults;

  /// New conversation screen: button that creates (or opens the existing) conversation.
  ///
  /// In vi, this message translates to:
  /// **'TẠO'**
  String get chatNewConversationCreateButton;

  /// Local check: a message without text is not sent.
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn không được để trống.'**
  String get chatIssueMessageEmpty;

  /// Local check: a message over the server's length limit is not sent.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Tin nhắn tối đa {max} ký tự.}}'**
  String chatIssueMessageTooLong(int max);

  /// Local check: a direct conversation needs exactly one other person.
  ///
  /// In vi, this message translates to:
  /// **'Chọn đúng một người để trò chuyện trực tiếp.'**
  String get chatIssueDirectNeedsOneParticipant;

  /// Local check: a group needs at least one other person.
  ///
  /// In vi, this message translates to:
  /// **'Chọn ít nhất một người tham gia nhóm.'**
  String get chatIssueGroupNeedsParticipants;

  /// Local check: a group title over the server's length limit.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Tiêu đề tối đa {max} ký tự.}}'**
  String chatIssueTitleTooLong(int max);

  /// Local check: a people search over the length GET /users/search accepts.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Từ khóa tìm kiếm tối đa {max} ký tự.}}'**
  String chatIssueSearchQueryTooLong(int max);

  /// The conversation list answer could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu cuộc trò chuyện không đúng định dạng.'**
  String get chatIssueMalformedConversationList;

  /// The message history answer could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu tin nhắn không đúng định dạng.'**
  String get chatIssueMalformedMessageList;

  /// The answer to a sent message could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về tin nhắn không hợp lệ.'**
  String get chatIssueMalformedMessage;

  /// The answer to creating a conversation could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về cuộc trò chuyện không hợp lệ.'**
  String get chatIssueMalformedConversation;

  /// The people search answer could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Không tìm được người tham gia.'**
  String get chatIssueMalformedSearchResults;

  /// Backend code search_query_too_short (users/users.service.ts searchUsers).
  ///
  /// In vi, this message translates to:
  /// **'Từ khóa tìm kiếm cần ít nhất 2 ký tự.'**
  String get errorUserSearchQueryTooShort;

  /// Notifications screen: header title.
  ///
  /// In vi, this message translates to:
  /// **'Thông Báo'**
  String get notificationsScreenTitle;

  /// Notifications screen: header subtitle with the number of unread notifications.
  ///
  /// In vi, this message translates to:
  /// **'{count, plural, other{{count} tin chưa đọc}}'**
  String notificationsScreenUnreadCount(int count);

  /// Notifications screen: header subtitle when every notification is read.
  ///
  /// In vi, this message translates to:
  /// **'Không có tin mới'**
  String get notificationsScreenNoUnread;

  /// Notifications screen: button that marks every notification read.
  ///
  /// In vi, this message translates to:
  /// **'Đọc hết'**
  String get notificationsScreenMarkAllRead;

  /// Notifications screen: tab with every notification.
  ///
  /// In vi, this message translates to:
  /// **'Tất cả'**
  String get notificationsScreenTabAll;

  /// Notifications screen: tab with task notifications.
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ'**
  String get notificationsScreenTabTask;

  /// Notifications screen: tab with attendance notifications.
  ///
  /// In vi, this message translates to:
  /// **'Chấm công'**
  String get notificationsScreenTabAttendance;

  /// Notifications screen: tab with system notifications (info, alert, system).
  ///
  /// In vi, this message translates to:
  /// **'Hệ thống'**
  String get notificationsScreenTabSystem;

  /// Notifications screen: a tab label followed by its number of unread notifications.
  ///
  /// In vi, this message translates to:
  /// **'{label} ({count})'**
  String notificationsScreenTabWithCount(String label, int count);

  /// Notifications screen: the list could not be loaded, with why.
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải thông báo: {reason}'**
  String notificationsScreenLoadError(String reason);

  /// Notifications screen: button that loads the list again after a failure.
  ///
  /// In vi, this message translates to:
  /// **'Thử lại'**
  String get notificationsScreenRetryButton;

  /// Notifications screen: button that loads the next page, with how many are shown of the total.
  ///
  /// In vi, this message translates to:
  /// **'Tải thêm ({shown}/{total})'**
  String notificationsScreenLoadMore(int shown, int total);

  /// Notifications screen: title of the empty state.
  ///
  /// In vi, this message translates to:
  /// **'Không có thông báo'**
  String get notificationsScreenEmptyTitle;

  /// Notifications screen: subtitle of the empty state.
  ///
  /// In vi, this message translates to:
  /// **'Bạn đã xem hết thông báo'**
  String get notificationsScreenEmptySubtitle;

  /// Notifications screen: badge on an SOS notification.
  ///
  /// In vi, this message translates to:
  /// **'Khẩn cấp'**
  String get notificationsScreenUrgentBadge;

  /// Notifications screen: the notification list answer could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu thông báo không đúng định dạng.'**
  String get notificationsScreenMalformed;

  /// Backend code file_required (files/files.controller.ts: POST /files/upload without a file part).
  ///
  /// In vi, this message translates to:
  /// **'Chưa có tệp để tải lên.'**
  String get errorFileRequired;

  /// Backend code file_empty (files/content-checking-storage.ts), also the local check before uploading an empty file.
  ///
  /// In vi, this message translates to:
  /// **'Tệp rỗng, không thể tải lên.'**
  String get errorFileEmpty;

  /// Backend code file_field_invalid (files/upload.interceptor.ts: unexpected, repeated or oversized multipart fields).
  ///
  /// In vi, this message translates to:
  /// **'Yêu cầu tải tệp không hợp lệ.'**
  String get errorFileFieldInvalid;

  /// Backend code multipart_malformed (files/upload.interceptor.ts: the multipart body could not be read).
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu tải tệp bị lỗi. Vui lòng thử lại.'**
  String get errorFileMultipartMalformed;

  /// Backend code file_too_large (413, files/upload.interceptor.ts, MAX_UPLOAD_BYTES 10 MB), also the local check before uploading.
  ///
  /// In vi, this message translates to:
  /// **'Tệp vượt quá dung lượng cho phép (10 MB).'**
  String get errorFileTooLarge;

  /// Backend code file_type_not_allowed (415 on upload: the content is not an allowed type such as JPEG, PNG, WebP, GIF, PDF, DOCX or XLSX; 400 when a non-image is attached where only photos belong).
  ///
  /// In vi, this message translates to:
  /// **'Loại tệp không được hỗ trợ.'**
  String get errorFileTypeNotAllowed;

  /// Backend code file_not_found (404 GET /files/:id; 400 when attaching an unknown or someone else's upload).
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy tệp hoặc bạn không có quyền xem tệp này.'**
  String get errorFileNotFound;

  /// Backend code duplicate_file_ids (files/files.service.ts attach).
  ///
  /// In vi, this message translates to:
  /// **'Một tệp được đính kèm nhiều lần.'**
  String get errorFileDuplicateIds;

  /// Backend code file_purpose_mismatch (files/files.service.ts attach: uploaded for another kind of record).
  ///
  /// In vi, this message translates to:
  /// **'Tệp được tải lên cho mục đích khác nên không thể đính kèm.'**
  String get errorFilePurposeMismatch;

  /// Backend code file_already_attached (409, files/files.service.ts attach).
  ///
  /// In vi, this message translates to:
  /// **'Tệp đã được đính kèm vào hồ sơ khác.'**
  String get errorFileAlreadyAttached;

  /// Local: the picked photo could not be read from the device.
  ///
  /// In vi, this message translates to:
  /// **'Không đọc được ảnh đã chọn.'**
  String get filesIssueUnreadable;

  /// Local: the upload answer could not be read.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về tệp không hợp lệ.'**
  String get filesIssueMalformedResponse;

  /// Local: camera or photo library permission refused.
  ///
  /// In vi, this message translates to:
  /// **'Ứng dụng chưa được cấp quyền dùng máy ảnh hoặc thư viện ảnh. Vào Cài đặt để cấp quyền.'**
  String get filesIssuePhotoAccessDenied;

  /// Local: the photo picker failed.
  ///
  /// In vi, this message translates to:
  /// **'Không chọn được ảnh. Vui lòng thử lại.'**
  String get filesIssuePhotoPickFailed;

  /// Photo attachments: button that takes a photo with the camera.
  ///
  /// In vi, this message translates to:
  /// **'Chụp ảnh'**
  String get filesPickCamera;

  /// Photo attachments: button that picks photos from the photo library.
  ///
  /// In vi, this message translates to:
  /// **'Thư viện'**
  String get filesPickGallery;

  /// Photo attachments: photos attached against the limit.
  ///
  /// In vi, this message translates to:
  /// **'{count}/{max} ảnh'**
  String filesAttachmentsCount(int count, int max);

  /// Photo attachments: some picked photos were left out because the limit was reached.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Chỉ đính kèm tối đa {max} ảnh.}}'**
  String filesAttachmentsLimitReached(int max);

  /// Photo attachments: accessibility label of a photo still uploading.
  ///
  /// In vi, this message translates to:
  /// **'Đang tải ảnh lên'**
  String get filesUploading;

  /// Photo attachments: tooltip of the button that uploads a failed photo again.
  ///
  /// In vi, this message translates to:
  /// **'Tải ảnh lên lại'**
  String get filesUploadRetry;

  /// Photo attachments: tooltip of the button that removes a photo.
  ///
  /// In vi, this message translates to:
  /// **'Bỏ ảnh'**
  String get filesAttachmentRemove;

  /// Photo attachments: why one photo could not be uploaded.
  ///
  /// In vi, this message translates to:
  /// **'{name}: {reason}'**
  String filesUploadFailedItem(String name, String reason);

  /// Stored image: accessibility label while it downloads.
  ///
  /// In vi, this message translates to:
  /// **'Đang tải ảnh'**
  String get filesImageLoading;

  /// Stored or picked image: the content could not be shown as an image.
  ///
  /// In vi, this message translates to:
  /// **'Không hiển thị được ảnh'**
  String get filesImageUnreadable;

  /// Work report screen: header title.
  ///
  /// In vi, this message translates to:
  /// **'Báo Cáo Công Việc'**
  String get incidentReportScreenTitle;

  /// Work report screen: header subtitle.
  ///
  /// In vi, this message translates to:
  /// **'Gửi báo cáo công việc, gọi SOS'**
  String get incidentReportScreenSubtitle;

  /// Work report screen: emergency call button.
  ///
  /// In vi, this message translates to:
  /// **'🚨 GỌI KHẨN CẤP SOS'**
  String get incidentReportSosButton;

  /// Work report screen: title of the emergency call confirmation.
  ///
  /// In vi, this message translates to:
  /// **'GỌI KHẨN CẤP SOS?'**
  String get incidentReportSosDialogTitle;

  /// Work report screen: question of the emergency call confirmation.
  ///
  /// In vi, this message translates to:
  /// **'Bạn có chắc chắn muốn gọi điện khẩn cấp đến Công An Khu Vực?'**
  String get incidentReportSosDialogContent;

  /// Work report screen: confirm button of the emergency call confirmation.
  ///
  /// In vi, this message translates to:
  /// **'Gọi ngay'**
  String get incidentReportSosDialogConfirm;

  /// Work report screen: title of the required work selection.
  ///
  /// In vi, this message translates to:
  /// **'Chọn công việc *'**
  String get incidentReportTaskSection;

  /// Work report screen: hint of the work dropdown.
  ///
  /// In vi, this message translates to:
  /// **'Chọn công việc'**
  String get incidentReportTaskHint;

  /// Work report screen: work option, also sent as the report title.
  ///
  /// In vi, this message translates to:
  /// **'Tuần tra khu vực chợ Bến Thành'**
  String get incidentReportTaskMarketPatrol;

  /// Work report screen: work option, also sent as the report title.
  ///
  /// In vi, this message translates to:
  /// **'Kiểm tra an ninh khu dân cư KP1'**
  String get incidentReportTaskResidentialCheck;

  /// Work report screen: work option, also sent as the report title.
  ///
  /// In vi, this message translates to:
  /// **'Hỗ trợ điều tiết giao thông'**
  String get incidentReportTaskTrafficControl;

  /// Work report screen: work option, also sent as the report title.
  ///
  /// In vi, this message translates to:
  /// **'Tuyên truyền phòng cháy chữa cháy'**
  String get incidentReportTaskFireSafety;

  /// Work report screen: option whose report title the user types.
  ///
  /// In vi, this message translates to:
  /// **'Khác (Tự nhập tiêu đề)'**
  String get incidentReportTaskOther;

  /// Work report screen: hint of the typed report title.
  ///
  /// In vi, this message translates to:
  /// **'Nhập tiêu đề báo cáo...'**
  String get incidentReportCustomTitleHint;

  /// Work report screen: title of the photo attachments section.
  ///
  /// In vi, this message translates to:
  /// **'Ảnh đính kèm'**
  String get incidentReportPhotosSection;

  /// Work report screen: voice recordings cannot be attached (no audio upload type on the server).
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ chưa hỗ trợ ghi âm cho báo cáo.'**
  String get incidentReportVoiceUnsupported;

  /// Work report screen: title of the required description.
  ///
  /// In vi, this message translates to:
  /// **'Mô tả chi tiết *'**
  String get incidentReportDescriptionSection;

  /// Work report screen: hint of the description.
  ///
  /// In vi, this message translates to:
  /// **'Nhập thông tin chi tiết về công việc...'**
  String get incidentReportDescriptionHint;

  /// Work report screen: title of the required location.
  ///
  /// In vi, this message translates to:
  /// **'Vị trí thực hiện *'**
  String get incidentReportLocationSection;

  /// Work report screen: hint of the location.
  ///
  /// In vi, this message translates to:
  /// **'Nhập địa chỉ...'**
  String get incidentReportLocationHint;

  /// Work report screen: the location filled in from GPS coordinates.
  ///
  /// In vi, this message translates to:
  /// **'{latitude}, {longitude} (GPS)'**
  String incidentReportGpsValue(String latitude, String longitude);

  /// Work report screen: the GPS position could not be read, with why.
  ///
  /// In vi, this message translates to:
  /// **'Không lấy được vị trí GPS: {reason} Vui lòng nhập địa chỉ.'**
  String incidentReportGpsFailed(String reason);

  /// Work report screen: submit button.
  ///
  /// In vi, this message translates to:
  /// **'Gửi Báo Cáo'**
  String get incidentReportSubmitButton;

  /// Work report screen: title shown after the report was sent.
  ///
  /// In vi, this message translates to:
  /// **'Gửi Báo Cáo Thành Công!'**
  String get incidentReportSuccessTitle;

  /// Work report screen: subtitle shown after the report was sent.
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo của bạn đã được ghi nhận'**
  String get incidentReportSuccessSubtitle;

  /// Work report screen: the report waits for its photos to finish uploading.
  ///
  /// In vi, this message translates to:
  /// **'Ảnh đang được tải lên. Vui lòng đợi rồi gửi báo cáo.'**
  String get incidentReportPhotosUploading;

  /// Work report screen: a photo failed to upload, so the report is not sent yet.
  ///
  /// In vi, this message translates to:
  /// **'Có ảnh chưa tải lên được. Tải lên lại hoặc bỏ ảnh đó rồi gửi báo cáo.'**
  String get incidentReportPhotosFailed;

  /// Work report screen: a 400 without a code the error table knows.
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo chưa hợp lệ. Vui lòng kiểm tra tiêu đề, mô tả và vị trí rồi gửi lại.'**
  String get incidentReportInvalid;

  /// Work report screen: a 400 validation_failed with the first class-validator message (English).
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo chưa hợp lệ: {detail}'**
  String incidentReportInvalidDetail(String detail);

  /// Work report screen: a 5xx answer to the report.
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ đang gặp sự cố, báo cáo chưa được gửi. Vui lòng thử lại sau.'**
  String get incidentReportServerError;

  /// Local check: the report has no title.
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chọn hoặc nhập tiêu đề báo cáo.'**
  String get incidentReportIssueTitleRequired;

  /// Local check: the title is over the server's limit.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Tiêu đề tối đa {max} ký tự.}}'**
  String incidentReportIssueTitleTooLong(int max);

  /// Local check: the report has no description.
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập mô tả chi tiết.'**
  String get incidentReportIssueContentRequired;

  /// Local check: the description is over the server's limit.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Mô tả tối đa {max} ký tự.}}'**
  String incidentReportIssueContentTooLong(int max);

  /// Local check: the report has no location.
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập vị trí thực hiện.'**
  String get incidentReportIssueLocationRequired;

  /// Local check: the location is over the server's limit.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Vị trí tối đa {max} ký tự.}}'**
  String incidentReportIssueLocationTooLong(int max);

  /// Local check: more attachments than the server accepts.
  ///
  /// In vi, this message translates to:
  /// **'{max, plural, other{Báo cáo đính kèm tối đa {max} ảnh.}}'**
  String incidentReportIssueTooManyAttachments(int max);

  /// Local check: the same upload is attached twice.
  ///
  /// In vi, this message translates to:
  /// **'Một ảnh được đính kèm nhiều lần.'**
  String get incidentReportIssueDuplicateAttachments;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['vi'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'vi':
      return AppLocalizationsVi();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
