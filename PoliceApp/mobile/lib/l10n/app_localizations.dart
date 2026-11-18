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

  /// App name: window/task title and the login screen heading
  ///
  /// In vi, this message translates to:
  /// **'Công An'**
  String get appTitle;

  /// Screen-reader label of the app logo (the Công an nhân dân badge)
  ///
  /// In vi, this message translates to:
  /// **'Huy hiệu Công an nhân dân Việt Nam'**
  String get appLogoLabel;

  /// Button that repeats a failed load
  ///
  /// In vi, this message translates to:
  /// **'Thử lại'**
  String get commonRetry;

  /// Login screen notice after the session was ended without signing out (refresh refused, revoked)
  ///
  /// In vi, this message translates to:
  /// **'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.'**
  String get authLoginNoticeSessionEnded;

  /// Login screen notice after the user changed their password, which ends every session
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu thành công, vui lòng đăng nhập lại.'**
  String get authLoginNoticePasswordChanged;

  /// Backend code invalid_credentials: wrong username or password
  ///
  /// In vi, this message translates to:
  /// **'Sai tên đăng nhập hoặc mật khẩu.'**
  String get errorInvalidCredentials;

  /// Backend code account_disabled
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'**
  String get errorAccountDisabled;

  /// Backend code account_locked
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản bị tạm khóa 30 phút do đăng nhập sai nhiều lần.'**
  String get errorAccountLocked;

  /// Backend code no_role_assigned
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.'**
  String get errorNoRoleAssigned;

  /// Backend code invalid_otp
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP không hợp lệ hoặc đã hết hạn.'**
  String get errorInvalidOtp;

  /// Backend code session_expired and any other HTTP 401
  ///
  /// In vi, this message translates to:
  /// **'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'**
  String get errorSessionExpired;

  /// Refresh refused with mfa_reauthentication_required: sign in again through MFA
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản đã bật xác thực 2 lớp. Vui lòng đăng nhập lại.'**
  String get errorMfaReauthenticationRequired;

  /// Backend code password_complexity; also the local check of a new password
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.'**
  String get errorPasswordComplexity;

  /// Backend code password_reuse
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất.'**
  String get errorPasswordReuse;

  /// Backend code invalid_code without an attempt count
  ///
  /// In vi, this message translates to:
  /// **'Mã xác thực không đúng.'**
  String get errorInvalidCode;

  /// Backend code invalid_code with details.attemptsRemaining
  ///
  /// In vi, this message translates to:
  /// **'Mã xác thực không đúng. Còn {count} lần thử.'**
  String errorInvalidCodeAttemptsRemaining(int count);

  /// Backend code mfa_token_invalid
  ///
  /// In vi, this message translates to:
  /// **'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.'**
  String get errorMfaTokenInvalid;

  /// Backend code mfa_attempts_exceeded
  ///
  /// In vi, this message translates to:
  /// **'Bạn đã nhập sai quá số lần cho phép. Vui lòng đăng nhập lại.'**
  String get errorMfaAttemptsExceeded;

  /// Backend code mfa_locked
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp bị tạm khóa 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.'**
  String get errorMfaLocked;

  /// Backend code mfa_already_enabled
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp đã được bật cho tài khoản này.'**
  String get errorMfaAlreadyEnabled;

  /// Backend code mfa_not_enabled
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 lớp chưa được bật.'**
  String get errorMfaNotEnabled;

  /// Backend code mfa_required_by_role
  ///
  /// In vi, this message translates to:
  /// **'Vai trò của bạn bắt buộc dùng xác thực 2 lớp nên không thể tắt.'**
  String get errorMfaRequiredByRole;

  /// Backend code mfa_setup_not_started
  ///
  /// In vi, this message translates to:
  /// **'Chưa bắt đầu thiết lập xác thực 2 lớp. Vui lòng thử lại.'**
  String get errorMfaSetupNotStarted;

  /// Backend code notification_not_found
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy thông báo.'**
  String get errorNotificationNotFound;

  /// Backend code work_report_already_reviewed
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo này đã được duyệt trước đó.'**
  String get errorWorkReportAlreadyReviewed;

  /// Backend code cannot_review_own_report
  ///
  /// In vi, this message translates to:
  /// **'Bạn không thể tự duyệt báo cáo của mình.'**
  String get errorCannotReviewOwnReport;

  /// Backend code work_report_not_found
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy báo cáo hoặc bạn không có quyền xem.'**
  String get errorWorkReportNotFound;

  /// Backend code only_ca_can_review
  ///
  /// In vi, this message translates to:
  /// **'Chỉ cán bộ Công an mới được duyệt báo cáo.'**
  String get errorOnlyCaCanReview;

  /// Backend code not_a_participant (REST and socket ack)
  ///
  /// In vi, this message translates to:
  /// **'Bạn không phải thành viên của cuộc trò chuyện này.'**
  String get errorNotAParticipant;

  /// Backend code message_too_long; ChatService.MAX_MESSAGE_LENGTH is 4000 (Web/backend/src/chat/chat.service.ts)
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn tối đa 4000 ký tự.'**
  String get errorMessageTooLong;

  /// Backend code message_content_required
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn không được để trống.'**
  String get errorMessageContentRequired;

  /// Backend code invalid_conversation_id
  ///
  /// In vi, this message translates to:
  /// **'Mã cuộc trò chuyện không hợp lệ.'**
  String get errorInvalidConversationId;

  /// Backend code direct_conversation_requires_one_participant
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện trực tiếp cần đúng một người tham gia.'**
  String get errorDirectConversationRequiresOneParticipant;

  /// Backend code participant_not_found
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy người tham gia.'**
  String get errorParticipantNotFound;

  /// Socket ack not_joined
  ///
  /// In vi, this message translates to:
  /// **'Bạn chưa tham gia phòng trò chuyện này.'**
  String get errorNotJoined;

  /// Backend code leave_request_not_pending
  ///
  /// In vi, this message translates to:
  /// **'Đơn nghỉ phép đã được xử lý trước đó.'**
  String get errorLeaveRequestNotPending;

  /// Backend code insufficient_leave_balance
  ///
  /// In vi, this message translates to:
  /// **'Người đề nghị không còn đủ số ngày phép.'**
  String get errorInsufficientLeaveBalance;

  /// Backend code cannot_review_own_request
  ///
  /// In vi, this message translates to:
  /// **'Bạn không thể tự duyệt đơn nghỉ phép của mình.'**
  String get errorCannotReviewOwnRequest;

  /// Backend code leave_request_not_found
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy đơn nghỉ phép hoặc đơn ngoài phạm vi quản lý.'**
  String get errorLeaveRequestNotFound;

  /// Backend code insufficient_role_to_review
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản của bạn không có quyền duyệt đơn nghỉ phép.'**
  String get errorInsufficientRoleToReview;

  /// Backend code insufficient_role_to_view_approvals
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản của bạn không có quyền xem danh sách phê duyệt.'**
  String get errorInsufficientRoleToViewApprovals;

  /// Backend code invalid_date
  ///
  /// In vi, this message translates to:
  /// **'Ngày không hợp lệ.'**
  String get errorInvalidDate;

  /// HTTP 400 without a known code
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.'**
  String get errorBadRequest;

  /// HTTP 403 without a known code
  ///
  /// In vi, this message translates to:
  /// **'Bạn không có quyền thực hiện thao tác này.'**
  String get errorForbidden;

  /// HTTP 404 without a known code
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy dữ liệu.'**
  String get errorNotFound;

  /// HTTP 409 without a known code
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.'**
  String get errorConflict;

  /// HTTP 422 without a known code
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu không hợp lệ.'**
  String get errorUnprocessable;

  /// HTTP 429 (throttler, code E006)
  ///
  /// In vi, this message translates to:
  /// **'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.'**
  String get errorTooManyRequests;

  /// HTTP 5xx
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ đang gặp sự cố. Thử lại sau.'**
  String get errorServer;

  /// Any other HTTP error status
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi xảy ra ({status}).'**
  String errorHttpStatus(int status);

  /// validation_failed: the first message the backend listed
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu không hợp lệ: {detail}'**
  String errorValidationDetail(String detail);

  /// No connection to the server
  ///
  /// In vi, this message translates to:
  /// **'Không kết nối được máy chủ. Kiểm tra mạng của bạn.'**
  String get errorNetwork;

  /// Connect, send or receive timeout
  ///
  /// In vi, this message translates to:
  /// **'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.'**
  String get errorTimeout;

  /// TLS certificate rejected
  ///
  /// In vi, this message translates to:
  /// **'Lỗi chứng chỉ máy chủ. Liên hệ quản trị.'**
  String get errorBadCertificate;

  /// Request cancelled
  ///
  /// In vi, this message translates to:
  /// **'Yêu cầu đã bị huỷ.'**
  String get errorCancelled;

  /// Transport error of unknown kind
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi không xác định. Vui lòng thử lại.'**
  String get errorUnexpected;

  /// Any other failure
  ///
  /// In vi, this message translates to:
  /// **'Có lỗi xảy ra. Vui lòng thử lại.'**
  String get errorUnknown;

  /// The server answered with data the app cannot read
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về dữ liệu không đúng định dạng.'**
  String get errorBadResponse;

  /// Location permission denied
  ///
  /// In vi, this message translates to:
  /// **'Ứng dụng chưa được cấp quyền vị trí. Vào Cài đặt để cấp quyền.'**
  String get errorLocationPermission;

  /// Location service switched off
  ///
  /// In vi, this message translates to:
  /// **'Dịch vụ vị trí đang tắt. Hãy bật GPS trên thiết bị.'**
  String get errorLocationDisabled;

  /// Sign-in refused with a 403 whose code has no text
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản không được phép đăng nhập. Vui lòng liên hệ quản trị viên.'**
  String get errorLoginForbidden;

  /// The session could not be started after the recovery codes
  ///
  /// In vi, this message translates to:
  /// **'Không thể bắt đầu phiên đăng nhập. Vui lòng đăng nhập lại.'**
  String get errorSessionStartFailed;

  /// A sign-in response without both tokens
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ trả về thiếu token đăng nhập'**
  String get errorMissingTokens;

  /// The account has no CA or DQTV role
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản không có quyền dùng ứng dụng này'**
  String get errorRoleNotAllowed;

  /// Password change refused with invalid_credentials: the current password is wrong
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu hiện tại không đúng.'**
  String get errorCurrentPasswordInvalid;

  /// Local check: an OTP is six digits
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP phải gồm 6 chữ số.'**
  String get errorOtpFormat;

  /// Local check: the recovery code field is empty
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập mã khôi phục.'**
  String get errorRecoveryCodeRequired;

  /// chat:join refused with an error the app does not know
  ///
  /// In vi, this message translates to:
  /// **'Không thể tham gia cuộc trò chuyện ({code}).'**
  String errorChatJoinFailed(String code);

  /// Local check: a direct chat has exactly one other person
  ///
  /// In vi, this message translates to:
  /// **'Chọn đúng một người để trò chuyện trực tiếp.'**
  String get errorDirectRequiresOne;

  /// Local check: a group needs at least one other person
  ///
  /// In vi, this message translates to:
  /// **'Chọn ít nhất một người tham gia nhóm.'**
  String get errorGroupRequiresParticipant;

  /// Local check: conversation title length
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề tối đa {max} ký tự.'**
  String errorTitleTooLong(int max);

  /// Both participant searches failed without a server answer
  ///
  /// In vi, this message translates to:
  /// **'Không tìm được người tham gia.'**
  String get errorParticipantSearchFailed;

  /// Confirm button of forms and dialogs
  ///
  /// In vi, this message translates to:
  /// **'XÁC NHẬN'**
  String get commonConfirm;

  /// Cancel button of dialogs
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get commonCancel;

  /// Login screen subtitle under the app name
  ///
  /// In vi, this message translates to:
  /// **'Hệ thống quản lý Dân quân tự vệ'**
  String get authLoginSubtitle;

  /// Sign-in screens: owning authority under the system name
  ///
  /// In vi, this message translates to:
  /// **'UBND Phường Phú Định - TP. Hồ Chí Minh'**
  String get authLoginUnit;

  /// Login screen: heading of the sign-in card
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP'**
  String get authLoginCardTitle;

  /// Login screen username field label
  ///
  /// In vi, this message translates to:
  /// **'Tên đăng nhập'**
  String get authLoginUsernameLabel;

  /// Login screen username field example
  ///
  /// In vi, this message translates to:
  /// **'ca001 hoặc dqtv001'**
  String get authLoginUsernameHint;

  /// Login screen: username left empty
  ///
  /// In vi, this message translates to:
  /// **'Tên đăng nhập không được để trống'**
  String get authLoginUsernameRequired;

  /// Login screen password field label
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu'**
  String get authLoginPasswordLabel;

  /// Login screen password field placeholder dots
  ///
  /// In vi, this message translates to:
  /// **'••••••'**
  String get authLoginPasswordHint;

  /// Login screen: password left empty
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu không được để trống'**
  String get authLoginPasswordRequired;

  /// Tooltip of the button that reveals the password
  ///
  /// In vi, this message translates to:
  /// **'Hiện mật khẩu'**
  String get authLoginShowPassword;

  /// Tooltip of the button that hides the password
  ///
  /// In vi, this message translates to:
  /// **'Ẩn mật khẩu'**
  String get authLoginHidePassword;

  /// Login screen link to password recovery
  ///
  /// In vi, this message translates to:
  /// **'Quên mật khẩu?'**
  String get authLoginForgotPassword;

  /// Login screen submit button
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP'**
  String get authLoginSubmit;

  /// App version under the login form
  ///
  /// In vi, this message translates to:
  /// **'Phiên bản {version}'**
  String authLoginVersion(String version);

  /// Second-factor sign-in screen title
  ///
  /// In vi, this message translates to:
  /// **'Xác thực 2 bước'**
  String get authOtpTitle;

  /// Second-factor method: one-time code from the authenticator app
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP'**
  String get authOtpMethodTotp;

  /// Second-factor method: a one-time recovery code
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục'**
  String get authOtpMethodRecoveryCode;

  /// Second-factor screen instruction for the OTP method
  ///
  /// In vi, this message translates to:
  /// **'Nhập mã OTP 6 số từ ứng dụng xác thực của bạn'**
  String get authOtpInstructionTotp;

  /// Second-factor screen instruction for the recovery code method
  ///
  /// In vi, this message translates to:
  /// **'Nhập một mã khôi phục chưa dùng (dạng XXXXX-XXXXX)'**
  String get authOtpInstructionRecoveryCode;

  /// Placeholder of a six-digit OTP field
  ///
  /// In vi, this message translates to:
  /// **'000000'**
  String get authOtpCodeHint;

  /// Placeholder of a recovery code field
  ///
  /// In vi, this message translates to:
  /// **'XXXXX-XXXXX'**
  String get authRecoveryCodeHint;

  /// After signing in with a recovery code: how many are left
  ///
  /// In vi, this message translates to:
  /// **'Còn {count} mã khôi phục chưa dùng.'**
  String authOtpRecoveryCodesRemaining(int count);

  /// Button back to the login screen when an MFA challenge is over
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG NHẬP LẠI'**
  String get authRestartLogin;

  /// MFA enrolment during sign-in: screen title
  ///
  /// In vi, this message translates to:
  /// **'Thiết lập xác thực 2 lớp'**
  String get authMfaSetupTitle;

  /// MFA enrolment during sign-in: why it is needed
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản của bạn bắt buộc dùng xác thực 2 lớp trước khi đăng nhập.'**
  String get authMfaSetupRequiredNotice;

  /// MFA enrolment step 1
  ///
  /// In vi, this message translates to:
  /// **'1. Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator...)'**
  String get authEnrollStepScan;

  /// Button opening the otpauth link in the authenticator app
  ///
  /// In vi, this message translates to:
  /// **'Mở ứng dụng xác thực'**
  String get authEnrollOpenAuthenticator;

  /// Label before the TOTP secret for manual entry
  ///
  /// In vi, this message translates to:
  /// **'Hoặc nhập khóa bí mật:'**
  String get authEnrollSecretLabel;

  /// Tooltip of the copy-secret button
  ///
  /// In vi, this message translates to:
  /// **'Sao chép khóa bí mật'**
  String get authEnrollCopySecretTooltip;

  /// Snackbar after copying the TOTP secret
  ///
  /// In vi, this message translates to:
  /// **'Đã sao chép khóa bí mật'**
  String get authEnrollSecretCopied;

  /// Snackbar when no app opens the otpauth link
  ///
  /// In vi, this message translates to:
  /// **'Không mở được ứng dụng xác thực. Hãy quét mã QR hoặc nhập khóa bí mật.'**
  String get authEnrollOpenAuthenticatorFailed;

  /// When the enrolment challenge expires (HH:mm)
  ///
  /// In vi, this message translates to:
  /// **'Mã thiết lập hết hạn lúc {time}'**
  String authEnrollExpiresAt(String time);

  /// MFA enrolment step 2
  ///
  /// In vi, this message translates to:
  /// **'2. Nhập mã 6 số ứng dụng hiển thị'**
  String get authEnrollStepCode;

  /// Recovery codes screen title
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục'**
  String get authRecoveryCodesTitle;

  /// Recovery codes screen: save them, shown once
  ///
  /// In vi, this message translates to:
  /// **'Lưu {count} mã sau ở nơi an toàn. Các mã chỉ hiển thị một lần.'**
  String authRecoveryCodesSaveInstruction(int count);

  /// Recovery codes screen: what a code is for
  ///
  /// In vi, this message translates to:
  /// **'Mỗi mã dùng được một lần, thay cho mã OTP khi bạn không có điện thoại xác thực.'**
  String get authRecoveryCodesUsageNote;

  /// Button copying every recovery code
  ///
  /// In vi, this message translates to:
  /// **'Sao chép tất cả'**
  String get authRecoveryCodesCopyAll;

  /// Snackbar after copying the recovery codes
  ///
  /// In vi, this message translates to:
  /// **'Đã sao chép tất cả mã khôi phục'**
  String get authRecoveryCodesCopied;

  /// Button opening the system share sheet for the recovery codes
  ///
  /// In vi, this message translates to:
  /// **'Chia sẻ'**
  String get authRecoveryCodesShare;

  /// Subject when sharing the recovery codes (e-mail apps)
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục MMS'**
  String get authRecoveryCodesShareSubject;

  /// Snackbar when sharing the recovery codes failed
  ///
  /// In vi, this message translates to:
  /// **'Không chia sẻ được. Hãy dùng \"Sao chép tất cả\".'**
  String get authRecoveryCodesShareFailed;

  /// Checkbox confirming the recovery codes were saved
  ///
  /// In vi, this message translates to:
  /// **'Tôi đã lưu các mã ở nơi an toàn'**
  String get authRecoveryCodesSavedConfirm;

  /// Button leaving the recovery codes screen
  ///
  /// In vi, this message translates to:
  /// **'Tiếp tục'**
  String get authRecoveryCodesContinue;

  /// Security screen title
  ///
  /// In vi, this message translates to:
  /// **'Bảo mật'**
  String get authSecurityTitle;

  /// Security screen: the MFA status could not be read
  ///
  /// In vi, this message translates to:
  /// **'Không tải được trạng thái bảo mật'**
  String get authSecurityLoadFailed;

  /// Security screen: MFA is on
  ///
  /// In vi, this message translates to:
  /// **'Đã bật xác thực 2 lớp'**
  String get authSecurityMfaEnabled;

  /// Security screen: MFA is off
  ///
  /// In vi, this message translates to:
  /// **'Chưa bật xác thực 2 lớp'**
  String get authSecurityMfaDisabled;

  /// Security screen: MFA enrolment date (dd/MM/yyyy)
  ///
  /// In vi, this message translates to:
  /// **'Bật từ ngày {date}'**
  String authSecurityEnabledSince(String date);

  /// Security screen: a role of the user makes MFA mandatory
  ///
  /// In vi, this message translates to:
  /// **'Vai trò của bạn bắt buộc dùng xác thực 2 lớp.'**
  String get authSecurityMfaRequiredByRole;

  /// Security screen: start MFA enrolment
  ///
  /// In vi, this message translates to:
  /// **'BẬT XÁC THỰC 2 LỚP'**
  String get authSecurityEnableMfa;

  /// Security screen: restart an MFA enrolment that cannot continue
  ///
  /// In vi, this message translates to:
  /// **'BẮT ĐẦU LẠI'**
  String get authSecurityRestartSetup;

  /// Security screen: unused recovery codes
  ///
  /// In vi, this message translates to:
  /// **'Còn {count} mã khôi phục'**
  String authSecurityRecoveryCodesRemaining(int count);

  /// Security screen: regenerate recovery codes
  ///
  /// In vi, this message translates to:
  /// **'TẠO LẠI MÃ KHÔI PHỤC'**
  String get authSecurityRegenerateCodes;

  /// Security screen: turn MFA off
  ///
  /// In vi, this message translates to:
  /// **'TẮT XÁC THỰC 2 LỚP'**
  String get authSecurityDisableMfa;

  /// Snackbar after turning MFA off
  ///
  /// In vi, this message translates to:
  /// **'Đã tắt xác thực 2 lớp'**
  String get authSecurityMfaDisabledDone;

  /// Security screen: open the password change
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu'**
  String get authSecurityChangePassword;

  /// Security screen: changing the password ends every session
  ///
  /// In vi, this message translates to:
  /// **'Mọi phiên đăng nhập sẽ kết thúc sau khi đổi'**
  String get authSecurityChangePasswordHint;

  /// Code dialog title before regenerating recovery codes
  ///
  /// In vi, this message translates to:
  /// **'Tạo lại mã khôi phục'**
  String get authSecurityRegenerateDialogTitle;

  /// Code dialog title before turning MFA off
  ///
  /// In vi, this message translates to:
  /// **'Tắt xác thực 2 lớp'**
  String get authSecurityDisableDialogTitle;

  /// Code dialog field label for an OTP
  ///
  /// In vi, this message translates to:
  /// **'Mã OTP 6 số'**
  String get authCodeDialogTotpLabel;

  /// Code dialog field label for a recovery code
  ///
  /// In vi, this message translates to:
  /// **'Mã khôi phục (XXXXX-XXXXX)'**
  String get authCodeDialogRecoveryLabel;

  /// Password change screen title
  ///
  /// In vi, this message translates to:
  /// **'Đổi mật khẩu'**
  String get authChangePasswordTitle;

  /// Password change screen: every session ends afterwards
  ///
  /// In vi, this message translates to:
  /// **'Sau khi đổi mật khẩu, mọi phiên đăng nhập sẽ kết thúc và bạn cần đăng nhập lại.'**
  String get authChangePasswordNote;

  /// Password change: current password field
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu hiện tại'**
  String get authChangePasswordCurrentLabel;

  /// Password change: current password left empty
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập mật khẩu hiện tại'**
  String get authChangePasswordCurrentRequired;

  /// Password change: tooltip revealing the passwords
  ///
  /// In vi, this message translates to:
  /// **'Hiện mật khẩu'**
  String get authChangePasswordShow;

  /// Password change: tooltip hiding the passwords
  ///
  /// In vi, this message translates to:
  /// **'Ẩn mật khẩu'**
  String get authChangePasswordHide;

  /// Password change: new password field
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới'**
  String get authChangePasswordNewLabel;

  /// Password change: the new password equals the current one
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu mới phải khác mật khẩu hiện tại'**
  String get authChangePasswordMustDiffer;

  /// Password change: repeat the new password
  ///
  /// In vi, this message translates to:
  /// **'Nhập lại mật khẩu mới'**
  String get authChangePasswordConfirmLabel;

  /// Password change: the repeated password differs
  ///
  /// In vi, this message translates to:
  /// **'Mật khẩu xác nhận không khớp'**
  String get authChangePasswordMismatch;

  /// Password change submit button
  ///
  /// In vi, this message translates to:
  /// **'ĐỔI MẬT KHẨU'**
  String get authChangePasswordSubmit;

  /// Forgot-password screen: card title (shown in capitals)
  ///
  /// In vi, this message translates to:
  /// **'Khôi phục mật khẩu'**
  String get authForgotPasswordTitle;

  /// No password recovery route: an administrator resets passwords
  ///
  /// In vi, this message translates to:
  /// **'Máy chủ chưa hỗ trợ khôi phục mật khẩu qua ứng dụng. Vui lòng liên hệ quản trị viên để được đặt lại mật khẩu.'**
  String get authForgotPasswordUnsupported;

  /// Forgot-password screen: back to login
  ///
  /// In vi, this message translates to:
  /// **'Quay lại đăng nhập'**
  String get authForgotPasswordBack;

  /// Task priority code low
  ///
  /// In vi, this message translates to:
  /// **'Thấp'**
  String get tasksPriorityLow;

  /// Task priority code medium
  ///
  /// In vi, this message translates to:
  /// **'Trung bình'**
  String get tasksPriorityMedium;

  /// Task priority code high
  ///
  /// In vi, this message translates to:
  /// **'Cao'**
  String get tasksPriorityHigh;

  /// Task priority code urgent
  ///
  /// In vi, this message translates to:
  /// **'Khẩn cấp'**
  String get tasksPriorityUrgent;

  /// Task status code pending (same wording as the task lists)
  ///
  /// In vi, this message translates to:
  /// **'Chờ giao'**
  String get tasksStatusPending;

  /// Task status code assigned
  ///
  /// In vi, this message translates to:
  /// **'Chưa tiếp nhận'**
  String get tasksStatusAssigned;

  /// Task status code in_progress
  ///
  /// In vi, this message translates to:
  /// **'Đang thực hiện'**
  String get tasksStatusInProgress;

  /// Task status code completed
  ///
  /// In vi, this message translates to:
  /// **'Hoàn thành'**
  String get tasksStatusCompleted;

  /// Task status code overdue
  ///
  /// In vi, this message translates to:
  /// **'Trễ hạn'**
  String get tasksStatusOverdue;

  /// Task status code cancelled
  ///
  /// In vi, this message translates to:
  /// **'Đã hủy'**
  String get tasksStatusCancelled;

  /// Create task screen title
  ///
  /// In vi, this message translates to:
  /// **'Giao nhiệm vụ'**
  String get tasksCreateTitle;

  /// Create task: title field label (required)
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề nhiệm vụ *'**
  String get tasksCreateTitleLabel;

  /// Create task: title field hint
  ///
  /// In vi, this message translates to:
  /// **'Nhập tiêu đề...'**
  String get tasksCreateTitleHint;

  /// Create task: validator message when the title is empty
  ///
  /// In vi, this message translates to:
  /// **'Bắt buộc nhập tiêu đề'**
  String get tasksCreateTitleRequired;

  /// Create task: description field label
  ///
  /// In vi, this message translates to:
  /// **'Mô tả'**
  String get tasksCreateDescriptionLabel;

  /// Create task: description field hint
  ///
  /// In vi, this message translates to:
  /// **'Mô tả chi tiết nhiệm vụ...'**
  String get tasksCreateDescriptionHint;

  /// Create task: location name field label
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm'**
  String get tasksCreateLocationLabel;

  /// Create task: location name field hint
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm thực hiện...'**
  String get tasksCreateLocationHint;

  /// Create task: the attached device coordinates, each already formatted with 5 decimals
  ///
  /// In vi, this message translates to:
  /// **'Tọa độ: {lat}, {lng}'**
  String tasksCreateCoordinates(String lat, String lng);

  /// Create task: no coordinates attached yet
  ///
  /// In vi, this message translates to:
  /// **'Chưa gắn tọa độ'**
  String get tasksCreateNoCoordinates;

  /// Create task: tooltip of the button that removes the coordinates
  ///
  /// In vi, this message translates to:
  /// **'Bỏ tọa độ'**
  String get tasksCreateClearCoordinatesTooltip;

  /// Create task: button that attaches the device position
  ///
  /// In vi, this message translates to:
  /// **'Vị trí hiện tại'**
  String get tasksCreateUseCurrentLocation;

  /// Create task: snackbar when the device position could not be read; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không lấy được vị trí: {reason}'**
  String tasksCreateLocationFailed(String reason);

  /// Create task: priority dropdown label
  ///
  /// In vi, this message translates to:
  /// **'Mức độ ưu tiên'**
  String get tasksCreatePriorityLabel;

  /// Create task: deadline picker label
  ///
  /// In vi, this message translates to:
  /// **'Hạn hoàn thành'**
  String get tasksCreateDeadlineLabel;

  /// Create task: deadline picker placeholder before a date is chosen
  ///
  /// In vi, this message translates to:
  /// **'Chọn ngày giờ...'**
  String get tasksCreateDeadlineHint;

  /// Create task: assignee dropdown label (required)
  ///
  /// In vi, this message translates to:
  /// **'Giao cho DQTV *'**
  String get tasksCreateAssigneeLabel;

  /// Create task: assignee dropdown hint
  ///
  /// In vi, this message translates to:
  /// **'Chọn DQTV nhận nhiệm vụ'**
  String get tasksCreateAssigneeHint;

  /// Create task: no assignee chosen
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chọn DQTV nhận nhiệm vụ'**
  String get tasksCreateAssigneeRequired;

  /// Create task: GET /militia failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được danh sách DQTV: {reason}'**
  String tasksCreateAssigneesLoadFailed(String reason);

  /// Create task: the form values were refused before sending; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Thông tin nhiệm vụ không hợp lệ: {reason}'**
  String tasksCreateInvalid(String reason);

  /// Create task: POST /tasks failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tạo nhiệm vụ: {reason}'**
  String tasksCreateFailed(String reason);

  /// Create task: snackbar after the task was created
  ///
  /// In vi, this message translates to:
  /// **'Đã tạo nhiệm vụ thành công'**
  String get tasksCreateSuccess;

  /// Create task: submit button
  ///
  /// In vi, this message translates to:
  /// **'GIAO NHIỆM VỤ'**
  String get tasksCreateSubmit;

  /// Create task: submit button while sending
  ///
  /// In vi, this message translates to:
  /// **'Đang giao...'**
  String get tasksCreateSubmitting;

  /// Task detail screen title
  ///
  /// In vi, this message translates to:
  /// **'Chi tiết nhiệm vụ'**
  String get tasksDetailTitle;

  /// Task detail: GET /tasks/:id failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải nhiệm vụ: {reason}'**
  String tasksDetailLoadFailed(String reason);

  /// Task detail: the response held no task
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy nhiệm vụ'**
  String get tasksDetailNotFound;

  /// Task detail: details card heading
  ///
  /// In vi, this message translates to:
  /// **'CHI TIẾT'**
  String get tasksDetailSectionDetails;

  /// Task detail: description row label
  ///
  /// In vi, this message translates to:
  /// **'Mô tả'**
  String get tasksDetailDescription;

  /// Task detail: location row label
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm'**
  String get tasksDetailLocation;

  /// Task detail: deadline row label
  ///
  /// In vi, this message translates to:
  /// **'Hạn hoàn thành'**
  String get tasksDetailDeadline;

  /// Task detail: creation date row label
  ///
  /// In vi, this message translates to:
  /// **'Ngày tạo'**
  String get tasksDetailCreatedAt;

  /// Task detail: assignee card heading
  ///
  /// In vi, this message translates to:
  /// **'ĐƯỢC GIAO'**
  String get tasksDetailSectionAssignee;

  /// Task detail: button, POST /tasks/:id/accept
  ///
  /// In vi, this message translates to:
  /// **'Tiếp nhận nhiệm vụ'**
  String get tasksDetailAccept;

  /// Task detail: snackbar after accepting
  ///
  /// In vi, this message translates to:
  /// **'Đã tiếp nhận nhiệm vụ'**
  String get tasksDetailAccepted;

  /// Task detail: accepting failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tiếp nhận: {reason}'**
  String tasksDetailAcceptFailed(String reason);

  /// App code app_task_priority_invalid: priority outside urgent|high|medium|low
  ///
  /// In vi, this message translates to:
  /// **'Mức độ ưu tiên không hợp lệ.'**
  String get tasksErrorPriorityInvalid;

  /// App code app_task_location_name_too_long
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm tối đa {max} ký tự.'**
  String tasksErrorLocationNameTooLong(int max);

  /// App code app_task_coordinates_incomplete: latitude and longitude go together
  ///
  /// In vi, this message translates to:
  /// **'Tọa độ phải có đủ vĩ độ và kinh độ.'**
  String get tasksErrorCoordinatesIncomplete;

  /// App code app_task_latitude_out_of_range
  ///
  /// In vi, this message translates to:
  /// **'Vĩ độ phải trong khoảng -90 đến 90.'**
  String get tasksErrorLatitudeOutOfRange;

  /// App code app_task_longitude_out_of_range
  ///
  /// In vi, this message translates to:
  /// **'Kinh độ phải trong khoảng -180 đến 180.'**
  String get tasksErrorLongitudeOutOfRange;

  /// Backend code task_not_found (tasks.service.ts)
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy nhiệm vụ.'**
  String get tasksErrorTaskNotFound;

  /// Backend code militia_no_user_account (tasks.service.ts createTask)
  ///
  /// In vi, this message translates to:
  /// **'DQTV này chưa có tài khoản nên chưa thể nhận nhiệm vụ.'**
  String get tasksErrorMilitiaNoUserAccount;

  /// Backend code dqtv_not_assigned_to_ca (tasks.service.ts createTask)
  ///
  /// In vi, this message translates to:
  /// **'DQTV này không thuộc danh sách bạn phụ trách.'**
  String get tasksErrorDqtvNotAssignedToCa;

  /// Training management screen title
  ///
  /// In vi, this message translates to:
  /// **'Quản lý Huấn luyện'**
  String get trainingManagementTitle;

  /// Training management: loading failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải dữ liệu: {reason}'**
  String trainingManagementLoadFailed(String reason);

  /// Training management: text after the bold passed/total count
  ///
  /// In vi, this message translates to:
  /// **'đợt huấn luyện có kết quả Đạt (yêu cầu tối thiểu {days} ngày/năm)'**
  String trainingManagementSummary(int days);

  /// Training management: floating button that opens the add form
  ///
  /// In vi, this message translates to:
  /// **'Thêm đợt huấn luyện'**
  String get trainingManagementAddButton;

  /// Training management: empty list
  ///
  /// In vi, this message translates to:
  /// **'Chưa có đợt huấn luyện nào'**
  String get trainingManagementEmpty;

  /// Training management: hint under the empty list
  ///
  /// In vi, this message translates to:
  /// **'Nhấn + để thêm đợt huấn luyện mới'**
  String get trainingManagementEmptyHint;

  /// Training management filter chip: every record
  ///
  /// In vi, this message translates to:
  /// **'Tất cả'**
  String get trainingFilterAll;

  /// Training management filter chip: result pass
  ///
  /// In vi, this message translates to:
  /// **'Đã đạt'**
  String get trainingFilterPassed;

  /// Training management filter chip: result fail
  ///
  /// In vi, this message translates to:
  /// **'Chưa đạt'**
  String get trainingFilterFailed;

  /// Training type code military
  ///
  /// In vi, this message translates to:
  /// **'Quân sự'**
  String get trainingTypeMilitary;

  /// Training type code political
  ///
  /// In vi, this message translates to:
  /// **'Chính trị'**
  String get trainingTypePolitical;

  /// Training type code fire (fire prevention and fighting)
  ///
  /// In vi, this message translates to:
  /// **'PCCC'**
  String get trainingTypeFire;

  /// Training type code first_aid
  ///
  /// In vi, this message translates to:
  /// **'Sơ cứu'**
  String get trainingTypeFirstAid;

  /// Training type code other
  ///
  /// In vi, this message translates to:
  /// **'Khác'**
  String get trainingTypeOther;

  /// Training result code pass
  ///
  /// In vi, this message translates to:
  /// **'Đạt'**
  String get trainingOutcomePassed;

  /// Training result code fail
  ///
  /// In vi, this message translates to:
  /// **'Không đạt'**
  String get trainingOutcomeFailed;

  /// Training result code not_evaluated
  ///
  /// In vi, this message translates to:
  /// **'Chưa đánh giá'**
  String get trainingOutcomeNotEvaluated;

  /// Training card heading when the record has no type
  ///
  /// In vi, this message translates to:
  /// **'Huấn luyện'**
  String get trainingCardUntyped;

  /// Training card: number of days, already formatted (e.g. 2,5)
  ///
  /// In vi, this message translates to:
  /// **'{days} ngày'**
  String trainingCardDays(String days);

  /// Add training form heading
  ///
  /// In vi, this message translates to:
  /// **'Thêm đợt huấn luyện'**
  String get trainingFormTitle;

  /// Add training form: militia member picker label (required)
  ///
  /// In vi, this message translates to:
  /// **'Dân quân tự vệ *'**
  String get trainingFormMilitiaLabel;

  /// Add training form: militia picker placeholder
  ///
  /// In vi, this message translates to:
  /// **'Chọn DQTV...'**
  String get trainingFormMilitiaHint;

  /// Add training form: type dropdown label (required)
  ///
  /// In vi, this message translates to:
  /// **'Loại huấn luyện *'**
  String get trainingFormTypeLabel;

  /// Add training form: type dropdown hint
  ///
  /// In vi, this message translates to:
  /// **'Chọn loại'**
  String get trainingFormTypeHint;

  /// Add training form: validator message when no type is chosen
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chọn'**
  String get trainingFormTypeRequired;

  /// Add training form: start date label (required)
  ///
  /// In vi, this message translates to:
  /// **'Ngày bắt đầu *'**
  String get trainingFormFromLabel;

  /// Add training form: end date label (required)
  ///
  /// In vi, this message translates to:
  /// **'Ngày kết thúc *'**
  String get trainingFormToLabel;

  /// Add training form: date button placeholder
  ///
  /// In vi, this message translates to:
  /// **'Chọn ngày'**
  String get trainingFormDateHint;

  /// Add training form: number of days label
  ///
  /// In vi, this message translates to:
  /// **'Số ngày'**
  String get trainingFormDaysLabel;

  /// Add training form: number of days hint
  ///
  /// In vi, this message translates to:
  /// **'Tự động tính hoặc nhập tay'**
  String get trainingFormDaysHint;

  /// Add training form: location label
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm'**
  String get trainingFormLocationLabel;

  /// Add training form: location hint
  ///
  /// In vi, this message translates to:
  /// **'Tên địa điểm huấn luyện'**
  String get trainingFormLocationHint;

  /// Add training form: instructor label
  ///
  /// In vi, this message translates to:
  /// **'Giáo viên / Chỉ huy'**
  String get trainingFormInstructorLabel;

  /// Add training form: instructor hint
  ///
  /// In vi, this message translates to:
  /// **'Họ tên người phụ trách'**
  String get trainingFormInstructorHint;

  /// Add training form: result choice label
  ///
  /// In vi, this message translates to:
  /// **'Kết quả'**
  String get trainingFormResultLabel;

  /// Add training form: save button
  ///
  /// In vi, this message translates to:
  /// **'Lưu đợt huấn luyện'**
  String get trainingFormSave;

  /// Add training form: start or end date missing
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chọn ngày bắt đầu và kết thúc'**
  String get trainingFormDatesRequired;

  /// Add training form: no militia member chosen
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chọn dân quân tự vệ'**
  String get trainingFormMilitiaRequired;

  /// Add training form: POST /training failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi lưu dữ liệu: {reason}'**
  String trainingFormSaveFailed(String reason);

  /// Militia picker dialog title
  ///
  /// In vi, this message translates to:
  /// **'Chọn DQTV'**
  String get trainingMilitiaPickerTitle;

  /// Militia picker dialog: search field hint
  ///
  /// In vi, this message translates to:
  /// **'Tìm theo tên hoặc mã...'**
  String get trainingMilitiaPickerHint;

  /// Militia picker dialog: the search failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tìm được DQTV: {reason}'**
  String trainingMilitiaPickerFailed(String reason);

  /// Militia picker dialog: no match
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy DQTV phù hợp'**
  String get trainingMilitiaPickerEmpty;

  /// Militia picker dialog: only part of the matches is shown
  ///
  /// In vi, this message translates to:
  /// **'Hiển thị {shown}/{total} — nhập thêm để thu hẹp kết quả'**
  String trainingMilitiaPickerShowing(int shown, int total);

  /// Militia picker dialog: close button
  ///
  /// In vi, this message translates to:
  /// **'Đóng'**
  String get trainingMilitiaPickerClose;

  /// Backend code insufficient_role_to_create_training (training.service.ts)
  ///
  /// In vi, this message translates to:
  /// **'Tài khoản của bạn không có quyền thêm đợt huấn luyện.'**
  String get trainingErrorInsufficientRoleToCreate;

  /// Backend code militia_not_found (militia, tasks and training services)
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy DQTV.'**
  String get dqtvErrorMilitiaNotFound;

  /// Backend code kpi_not_visible (kpi.service.ts)
  ///
  /// In vi, this message translates to:
  /// **'Bạn không có quyền xem KPI của người này.'**
  String get dqtvErrorKpiNotVisible;

  /// Militia member detail screen title
  ///
  /// In vi, this message translates to:
  /// **'Hồ sơ DQTV'**
  String get dqtvDetailTitle;

  /// Militia detail: GET /militia/:id failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải hồ sơ: {reason}'**
  String dqtvDetailLoadFailed(String reason);

  /// Militia detail: contact card heading
  ///
  /// In vi, this message translates to:
  /// **'THÔNG TIN LIÊN HỆ'**
  String get dqtvDetailSectionContact;

  /// Militia detail: military profile card heading
  ///
  /// In vi, this message translates to:
  /// **'HỒ SƠ QUÂN SỰ'**
  String get dqtvDetailSectionMilitary;

  /// Militia detail: militia code row label
  ///
  /// In vi, this message translates to:
  /// **'Mã DQTV'**
  String get dqtvDetailMilitiaCode;

  /// Militia detail: rank row label
  ///
  /// In vi, this message translates to:
  /// **'Cấp bậc'**
  String get dqtvDetailRank;

  /// Militia detail: unit row label
  ///
  /// In vi, this message translates to:
  /// **'Đơn vị'**
  String get dqtvDetailUnit;

  /// Militia detail: button that opens the KPI evaluation
  ///
  /// In vi, this message translates to:
  /// **'Đánh giá chỉ tiêu'**
  String get dqtvDetailEvaluate;

  /// Militia detail: this month's KPI card heading
  ///
  /// In vi, this message translates to:
  /// **'KPI THÁNG NÀY'**
  String get dqtvDetailSectionKpi;

  /// Militia detail: under the KPI score, the highest score (GET /kpi/current maxScore)
  ///
  /// In vi, this message translates to:
  /// **'/ {max} điểm'**
  String dqtvDetailKpiOutOf(String max);

  /// Militia detail: GET /kpi/current failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được KPI: {reason}'**
  String dqtvDetailKpiFailed(String reason);

  /// Militia profile status active
  ///
  /// In vi, this message translates to:
  /// **'Đang hoạt động'**
  String get dqtvStatusActive;

  /// Militia profile status other than active
  ///
  /// In vi, this message translates to:
  /// **'Không hoạt động'**
  String get dqtvStatusInactive;

  /// Own profile screen title (both roles)
  ///
  /// In vi, this message translates to:
  /// **'Cá nhân'**
  String get profileTitle;

  /// Own profile: role badge of a ward police officer
  ///
  /// In vi, this message translates to:
  /// **'Công An Khu Vực'**
  String get profileCaRoleBadge;

  /// Own profile: role badge of a militia member
  ///
  /// In vi, this message translates to:
  /// **'Dân Quân Tự Vệ'**
  String get profileDqtvRoleBadge;

  /// Own profile: account card heading
  ///
  /// In vi, this message translates to:
  /// **'THÔNG TIN TÀI KHOẢN'**
  String get profileSectionAccount;

  /// Own profile: username row label
  ///
  /// In vi, this message translates to:
  /// **'Tên đăng nhập'**
  String get profileUsername;

  /// Own profile: email row label
  ///
  /// In vi, this message translates to:
  /// **'Email'**
  String get profileEmail;

  /// Own profile: phone row label
  ///
  /// In vi, this message translates to:
  /// **'Điện thoại'**
  String get profilePhone;

  /// Own profile: value of an empty email or phone
  ///
  /// In vi, this message translates to:
  /// **'Chưa cập nhật'**
  String get profileNotUpdated;

  /// Own profile (CA): police service card heading
  ///
  /// In vi, this message translates to:
  /// **'THÔNG TIN CÔNG VỤ'**
  String get profileCaSectionPolice;

  /// Own profile (CA): badge number row label
  ///
  /// In vi, this message translates to:
  /// **'Số hiệu'**
  String get profileCaBadgeNumber;

  /// Own profile: rank row label
  ///
  /// In vi, this message translates to:
  /// **'Cấp bậc'**
  String get profileRank;

  /// Own profile: unit or station row label
  ///
  /// In vi, this message translates to:
  /// **'Đơn vị'**
  String get profileUnit;

  /// Own profile (DQTV): military profile card heading
  ///
  /// In vi, this message translates to:
  /// **'HỒ SƠ QUÂN SỰ'**
  String get profileDqtvSectionMilitary;

  /// Own profile (DQTV): militia code row label
  ///
  /// In vi, this message translates to:
  /// **'Mã DQTV'**
  String get profileDqtvMilitiaCode;

  /// Own profile (DQTV): this month's KPI card heading
  ///
  /// In vi, this message translates to:
  /// **'KPI THÁNG NÀY'**
  String get profileDqtvSectionKpi;

  /// Own profile (DQTV): KPI total score label
  ///
  /// In vi, this message translates to:
  /// **'Tổng điểm'**
  String get profileDqtvKpiTotal;

  /// Own profile (DQTV): KPI attendance score label
  ///
  /// In vi, this message translates to:
  /// **'Chuyên cần'**
  String get profileDqtvKpiAttendance;

  /// Own profile (DQTV): KPI task score label
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ'**
  String get profileDqtvKpiTasks;

  /// Own profile: entry to the security (MFA) screen
  ///
  /// In vi, this message translates to:
  /// **'Bảo mật / Xác thực 2 lớp'**
  String get profileSecurity;

  /// Own profile: sign-out button
  ///
  /// In vi, this message translates to:
  /// **'ĐĂNG XUẤT'**
  String get profileLogout;

  /// Sign-out confirmation dialog title
  ///
  /// In vi, this message translates to:
  /// **'Đăng xuất'**
  String get profileLogoutConfirmTitle;

  /// Sign-out confirmation dialog question
  ///
  /// In vi, this message translates to:
  /// **'Bạn có chắc muốn đăng xuất không?'**
  String get profileLogoutConfirmMessage;

  /// Sign-out confirmation dialog: keep signed in
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get profileLogoutConfirmCancel;

  /// Sign-out confirmation dialog: sign out
  ///
  /// In vi, this message translates to:
  /// **'Đăng xuất'**
  String get profileLogoutConfirmOk;

  /// Own profile: GET /users/me failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được thông tin cá nhân: {reason}'**
  String profileLoadFailed(String reason);

  /// Own profile (CA): GET /police-profile failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được thông tin công vụ: {reason}'**
  String profileCaPoliceFailed(String reason);

  /// Own profile (DQTV): GET /militia/me/data-export failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được hồ sơ quân sự: {reason}'**
  String profileDqtvMilitiaFailed(String reason);

  /// Own profile (DQTV): GET /kpi/current failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được KPI: {reason}'**
  String profileDqtvKpiFailed(String reason);

  /// Backend code user_not_found (users.service.ts)
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy tài khoản.'**
  String get profileErrorUserNotFound;

  /// Notifications screen title
  ///
  /// In vi, this message translates to:
  /// **'Thông báo'**
  String get notificationsTitle;

  /// Notifications: header button that marks every notification read
  ///
  /// In vi, this message translates to:
  /// **'Đọc hết'**
  String get notificationsMarkAllRead;

  /// Notifications: loading failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải thông báo: {reason}'**
  String notificationsLoadFailed(String reason);

  /// Notifications: empty list
  ///
  /// In vi, this message translates to:
  /// **'Chưa có thông báo nào'**
  String get notificationsEmpty;

  /// Notifications: button that loads the next page
  ///
  /// In vi, this message translates to:
  /// **'Tải thêm ({shown}/{total})'**
  String notificationsLoadMore(int shown, int total);

  /// Semantics label of the spinner while a stored image downloads
  ///
  /// In vi, this message translates to:
  /// **'Đang tải ảnh'**
  String get filesImageLoading;

  /// Tooltip of the placeholder when downloaded image bytes cannot be decoded
  ///
  /// In vi, this message translates to:
  /// **'Không đọc được ảnh'**
  String get filesImageUnreadable;

  /// Tooltip of the close button of the full-screen attachment viewer
  ///
  /// In vi, this message translates to:
  /// **'Đóng'**
  String get filesViewerClose;

  /// Button that takes a photo with the camera to attach
  ///
  /// In vi, this message translates to:
  /// **'Chụp ảnh'**
  String get filesPickCamera;

  /// Button that picks photos from the gallery to attach
  ///
  /// In vi, this message translates to:
  /// **'Thư viện ảnh'**
  String get filesPickGallery;

  /// How many photos are attached out of the maximum
  ///
  /// In vi, this message translates to:
  /// **'{count}/{max} ảnh'**
  String filesAttachmentsCount(int count, int max);

  /// Tooltip of the button that removes a photo before submitting
  ///
  /// In vi, this message translates to:
  /// **'Bỏ ảnh này'**
  String get filesAttachmentRemove;

  /// Tooltip of the button that retries a failed photo upload
  ///
  /// In vi, this message translates to:
  /// **'Tải lên lại'**
  String get filesUploadRetry;

  /// Semantics label of the spinner on a photo being uploaded
  ///
  /// In vi, this message translates to:
  /// **'Đang tải ảnh lên'**
  String get filesUploading;

  /// Why one photo failed to upload: its file name and the failure text
  ///
  /// In vi, this message translates to:
  /// **'{name}: {error}'**
  String filesUploadFailedItem(String name, String error);

  /// Snackbar when more photos were picked than the room left
  ///
  /// In vi, this message translates to:
  /// **'Chỉ đính kèm tối đa {max} ảnh; ảnh vượt quá đã được bỏ qua.'**
  String filesAttachmentsLimitReached(int max);

  /// Backend code file_required (POST /files/upload without a file part)
  ///
  /// In vi, this message translates to:
  /// **'Chưa có tệp nào được gửi lên.'**
  String get filesErrorFileRequired;

  /// Backend code file_empty
  ///
  /// In vi, this message translates to:
  /// **'Tệp rỗng, không thể tải lên.'**
  String get filesErrorFileEmpty;

  /// Backend code file_field_invalid (unexpected multipart fields)
  ///
  /// In vi, this message translates to:
  /// **'Yêu cầu tải tệp không hợp lệ.'**
  String get filesErrorFileFieldInvalid;

  /// Backend code multipart_malformed
  ///
  /// In vi, this message translates to:
  /// **'Dữ liệu tải lên bị hỏng. Vui lòng thử lại.'**
  String get filesErrorMultipartMalformed;

  /// Backend code file_too_large (413, limit 10 MB)
  ///
  /// In vi, this message translates to:
  /// **'Tệp vượt quá dung lượng tối đa 10 MB.'**
  String get filesErrorFileTooLarge;

  /// Backend code file_type_not_allowed (415, or 400 when attaching)
  ///
  /// In vi, this message translates to:
  /// **'Định dạng tệp không được hỗ trợ (chỉ nhận JPEG, PNG, WebP, GIF, PDF, DOCX, XLSX).'**
  String get filesErrorFileTypeNotAllowed;

  /// Backend code file_not_found (download 404, or an unknown attachment id)
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy tệp hoặc bạn không có quyền xem.'**
  String get filesErrorFileNotFound;

  /// Backend code duplicate_file_ids
  ///
  /// In vi, this message translates to:
  /// **'Một tệp được đính kèm nhiều lần.'**
  String get filesErrorDuplicateFileIds;

  /// Backend code file_purpose_mismatch
  ///
  /// In vi, this message translates to:
  /// **'Tệp này được tải lên cho mục đích khác nên không thể đính kèm.'**
  String get filesErrorFilePurposeMismatch;

  /// Backend code file_already_attached (409)
  ///
  /// In vi, this message translates to:
  /// **'Tệp đã được đính kèm vào hồ sơ khác. Vui lòng tải ảnh lên lại.'**
  String get filesErrorFileAlreadyAttached;

  /// App code: the camera or photo library permission was denied
  ///
  /// In vi, this message translates to:
  /// **'Ứng dụng chưa được cấp quyền dùng máy ảnh hoặc thư viện ảnh.'**
  String get filesErrorPhotoAccessDenied;

  /// App code: the image picker failed for another reason
  ///
  /// In vi, this message translates to:
  /// **'Không lấy được ảnh. Vui lòng thử lại.'**
  String get filesErrorPhotoPickFailed;

  /// App code: a work report type the backend does not accept
  ///
  /// In vi, this message translates to:
  /// **'Loại báo cáo không hợp lệ.'**
  String get reportsErrorTypeInvalid;

  /// App code: an unknown review status filter
  ///
  /// In vi, this message translates to:
  /// **'Trạng thái duyệt không hợp lệ.'**
  String get reportsErrorReviewStatusInvalid;

  /// App code: a from/to filter that is not YYYY-MM-DD
  ///
  /// In vi, this message translates to:
  /// **'Ngày lọc không hợp lệ.'**
  String get reportsErrorDateFilterInvalid;

  /// App code: empty work report title
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề báo cáo không được để trống.'**
  String get reportsErrorTitleRequired;

  /// App code: work report title over its length limit
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề tối đa {max} ký tự.'**
  String reportsErrorTitleTooLong(int max);

  /// App code: empty work report content
  ///
  /// In vi, this message translates to:
  /// **'Nội dung báo cáo không được để trống.'**
  String get reportsErrorContentRequired;

  /// App code: work report content over its length limit
  ///
  /// In vi, this message translates to:
  /// **'Nội dung tối đa {max} ký tự.'**
  String reportsErrorContentTooLong(int max);

  /// App code: work report location over its length limit
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm tối đa {max} ký tự.'**
  String reportsErrorLocationTooLong(int max);

  /// App code: review note over its length limit
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú duyệt tối đa {max} ký tự.'**
  String reportsErrorReviewNoteTooLong(int max);

  /// App code: more attachment ids than a work report accepts
  ///
  /// In vi, this message translates to:
  /// **'Tối đa {max} ảnh đính kèm.'**
  String reportsErrorAttachmentsTooMany(int max);

  /// App code: leave review reason over its length limit
  ///
  /// In vi, this message translates to:
  /// **'Lý do tối đa {max} ký tự.'**
  String approvalsErrorReasonTooLong(int max);

  /// Chat screen title
  ///
  /// In vi, this message translates to:
  /// **'Trò chuyện'**
  String get chatScreenTitle;

  /// Tooltip of the button reloading the message history
  ///
  /// In vi, this message translates to:
  /// **'Tải lại'**
  String get chatScreenRefresh;

  /// The message history could not be loaded
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải tin nhắn: {error}'**
  String chatScreenLoadFailed(String error);

  /// Chat screen without messages
  ///
  /// In vi, this message translates to:
  /// **'Chưa có tin nhắn'**
  String get chatScreenEmpty;

  /// Placeholder of the message field
  ///
  /// In vi, this message translates to:
  /// **'Nhập tin nhắn...'**
  String get chatScreenInputHint;

  /// Semantics label of the send button
  ///
  /// In vi, this message translates to:
  /// **'Gửi'**
  String get chatScreenSend;

  /// Characters typed out of the maximum, shown near the limit
  ///
  /// In vi, this message translates to:
  /// **'{current}/{max}'**
  String chatScreenCharacterCount(int current, int max);

  /// One other person is typing
  ///
  /// In vi, this message translates to:
  /// **'{name} đang nhập…'**
  String chatScreenTypingOne(String name);

  /// Two other people are typing
  ///
  /// In vi, this message translates to:
  /// **'{first}, {second} đang nhập…'**
  String chatScreenTypingTwo(String first, String second);

  /// More than two other people are typing
  ///
  /// In vi, this message translates to:
  /// **'{first}, {second} và {count} người khác đang nhập…'**
  String chatScreenTypingMany(String first, String second, int count);

  /// Name used for a typing person the app cannot name
  ///
  /// In vi, this message translates to:
  /// **'Người khác'**
  String get chatScreenTypingSomeone;

  /// Conversation list title
  ///
  /// In vi, this message translates to:
  /// **'Tin nhắn'**
  String get chatListTitle;

  /// Tooltip of the button creating a conversation
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện mới'**
  String get chatListNewConversation;

  /// The conversation list could not be loaded
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải cuộc trò chuyện: {error}'**
  String chatListLoadFailed(String error);

  /// Conversation list without conversations
  ///
  /// In vi, this message translates to:
  /// **'Chưa có cuộc trò chuyện'**
  String get chatListEmpty;

  /// How to start a conversation from the empty list
  ///
  /// In vi, this message translates to:
  /// **'Nhấn + để tạo cuộc trò chuyện mới'**
  String get chatListEmptyHint;

  /// Unread badge when there are more than 99 unread messages
  ///
  /// In vi, this message translates to:
  /// **'99+'**
  String get chatListUnreadOverflow;

  /// Conversation type: group
  ///
  /// In vi, this message translates to:
  /// **'Nhóm'**
  String get chatConversationTypeGroup;

  /// Conversation type: direct, one other person
  ///
  /// In vi, this message translates to:
  /// **'Trực tiếp'**
  String get chatConversationTypeDirect;

  /// Title of an untitled group without other members
  ///
  /// In vi, this message translates to:
  /// **'Nhóm trò chuyện'**
  String get chatConversationUntitledGroup;

  /// Title of an untitled direct chat whose other person is unknown
  ///
  /// In vi, this message translates to:
  /// **'Trò chuyện trực tiếp'**
  String get chatConversationUntitledDirect;

  /// Untitled group named after three members and how many more there are
  ///
  /// In vi, this message translates to:
  /// **'{names} +{count}'**
  String chatConversationGroupMembersMore(String names, int count);

  /// New conversation screen title
  ///
  /// In vi, this message translates to:
  /// **'Cuộc trò chuyện mới'**
  String get chatNewTitle;

  /// New group: pick one or more people
  ///
  /// In vi, this message translates to:
  /// **'Chọn một hoặc nhiều người tham gia'**
  String get chatNewInstructionGroup;

  /// New direct chat: pick exactly one person
  ///
  /// In vi, this message translates to:
  /// **'Chọn đúng một người để trò chuyện'**
  String get chatNewInstructionDirect;

  /// Optional title field of a new group
  ///
  /// In vi, this message translates to:
  /// **'Tiêu đề nhóm (tùy chọn)'**
  String get chatNewGroupTitleLabel;

  /// Placeholder of the participant search
  ///
  /// In vi, this message translates to:
  /// **'Tìm theo tên, tên đăng nhập hoặc mã DQTV...'**
  String get chatNewSearchHint;

  /// The search needs more characters
  ///
  /// In vi, this message translates to:
  /// **'Nhập ít nhất {count} ký tự để tìm người tham gia'**
  String chatNewSearchTooShort(int count);

  /// The participant search found nobody
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy người phù hợp'**
  String get chatNewNoResults;

  /// Button creating the conversation
  ///
  /// In vi, this message translates to:
  /// **'TẠO'**
  String get chatNewCreate;

  /// Backend code task_not_acceptable (409): accepting a task that is not pending, assigned or overdue
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ không còn ở trạng thái có thể tiếp nhận.'**
  String get tasksErrorTaskNotAcceptable;

  /// Backend code task_closed (409): progress or a report on a completed or cancelled task
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ đã hoàn thành hoặc đã bị hủy.'**
  String get tasksErrorTaskClosed;

  /// Leave approvals screen title
  ///
  /// In vi, this message translates to:
  /// **'Duyệt đơn nghỉ phép'**
  String get approvalsScreenTitle;

  /// Tooltip of the approvals screen refresh button
  ///
  /// In vi, this message translates to:
  /// **'Làm mới'**
  String get approvalsScreenRefresh;

  /// Tab of leave requests waiting for a decision, with their count
  ///
  /// In vi, this message translates to:
  /// **'Chờ duyệt ({count})'**
  String approvalsScreenTabPending(int count);

  /// Tab of approved leave requests
  ///
  /// In vi, this message translates to:
  /// **'Đã duyệt'**
  String get approvalsScreenTabApproved;

  /// Tab of rejected leave requests
  ///
  /// In vi, this message translates to:
  /// **'Từ chối'**
  String get approvalsScreenTabRejected;

  /// Empty pending tab, explaining which requests each reviewer sees
  ///
  /// In vi, this message translates to:
  /// **'Không có đơn chờ duyệt.\nCán bộ CA chỉ thấy đơn của DQTV được phân công; CA phường/khu vực thấy đơn trong đơn vị.'**
  String get approvalsScreenEmptyPending;

  /// Empty approved or rejected tab
  ///
  /// In vi, this message translates to:
  /// **'Không có dữ liệu'**
  String get approvalsScreenEmpty;

  /// Leave type, first and last day, and the number of days (formatted, e.g. 0,5)
  ///
  /// In vi, this message translates to:
  /// **'{leaveType}  •  {from} → {to} ({days} ngày)'**
  String approvalsScreenLeavePeriod(
      String leaveType, String from, String to, String days);

  /// The requester's reason for the leave
  ///
  /// In vi, this message translates to:
  /// **'Lý do: {reason}'**
  String approvalsScreenReason(String reason);

  /// Who approved or rejected a leave request
  ///
  /// In vi, this message translates to:
  /// **'Người xử lý: {name}'**
  String approvalsScreenReviewer(String name);

  /// When a leave request was decided (dd/MM/yyyy HH:mm)
  ///
  /// In vi, this message translates to:
  /// **'Thời gian xử lý: {time}'**
  String approvalsScreenReviewedAt(String time);

  /// The reason given when a leave request was rejected
  ///
  /// In vi, this message translates to:
  /// **'Lý do từ chối: {note}'**
  String approvalsScreenRejectReason(String note);

  /// The note given when a leave request was approved
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú duyệt: {note}'**
  String approvalsScreenApproveNote(String note);

  /// Button that rejects a leave request
  ///
  /// In vi, this message translates to:
  /// **'TỪ CHỐI'**
  String get approvalsScreenReject;

  /// Button that approves a leave request
  ///
  /// In vi, this message translates to:
  /// **'DUYỆT'**
  String get approvalsScreenApprove;

  /// Snackbar after a leave request was approved
  ///
  /// In vi, this message translates to:
  /// **'Đã duyệt đơn'**
  String get approvalsScreenApproved;

  /// Snackbar after a leave request was rejected
  ///
  /// In vi, this message translates to:
  /// **'Đã từ chối đơn'**
  String get approvalsScreenRejected;

  /// Leave status pending
  ///
  /// In vi, this message translates to:
  /// **'Chờ duyệt'**
  String get approvalsLeaveStatusPending;

  /// Leave status approved
  ///
  /// In vi, this message translates to:
  /// **'Đã duyệt'**
  String get approvalsLeaveStatusApproved;

  /// Leave status rejected
  ///
  /// In vi, this message translates to:
  /// **'Từ chối'**
  String get approvalsLeaveStatusRejected;

  /// Leave status cancelled
  ///
  /// In vi, this message translates to:
  /// **'Đã hủy'**
  String get approvalsLeaveStatusCancelled;

  /// Title of the dialog asking why a leave request is rejected
  ///
  /// In vi, this message translates to:
  /// **'Từ chối đơn nghỉ phép'**
  String get approvalsRejectDialogTitle;

  /// Label of the required rejection reason field
  ///
  /// In vi, this message translates to:
  /// **'Lý do từ chối *'**
  String get approvalsRejectDialogReasonLabel;

  /// Hint of the rejection reason field
  ///
  /// In vi, this message translates to:
  /// **'Nhập lý do...'**
  String get approvalsRejectDialogReasonHint;

  /// Error when the rejection reason is empty
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập lý do từ chối'**
  String get approvalsRejectDialogReasonRequired;

  /// Closes the rejection dialog without rejecting
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get approvalsRejectDialogCancel;

  /// Confirms the rejection
  ///
  /// In vi, this message translates to:
  /// **'XÁC NHẬN'**
  String get approvalsRejectDialogConfirm;

  /// Work report type daily (tab and label)
  ///
  /// In vi, this message translates to:
  /// **'Hàng ngày'**
  String get reportsTypeDaily;

  /// Work report type incident (tab and label)
  ///
  /// In vi, this message translates to:
  /// **'Sự vụ'**
  String get reportsTypeIncident;

  /// Work report type monthly (tab and label)
  ///
  /// In vi, this message translates to:
  /// **'Tháng'**
  String get reportsTypeMonthly;

  /// Work report review status pending (badge, filter, count)
  ///
  /// In vi, this message translates to:
  /// **'Chờ duyệt'**
  String get reportsReviewStatusPending;

  /// Work report review status approved (badge, filter, count)
  ///
  /// In vi, this message translates to:
  /// **'Đã duyệt'**
  String get reportsReviewStatusApproved;

  /// Work report review status rejected (badge, filter)
  ///
  /// In vi, this message translates to:
  /// **'Từ chối'**
  String get reportsReviewStatusRejected;

  /// Title of the screen where a DQTV sends a work report
  ///
  /// In vi, this message translates to:
  /// **'Gửi báo cáo'**
  String get reportsWorkTitle;

  /// Label of the optional location field
  ///
  /// In vi, this message translates to:
  /// **'Địa điểm'**
  String get reportsWorkLocationLabel;

  /// Hint of the optional location field
  ///
  /// In vi, this message translates to:
  /// **'Nhập địa điểm (tùy chọn)'**
  String get reportsWorkLocationHint;

  /// Label of the required content field
  ///
  /// In vi, this message translates to:
  /// **'Nội dung *'**
  String get reportsWorkContentLabel;

  /// Hint of the content field
  ///
  /// In vi, this message translates to:
  /// **'Nhập nội dung báo cáo...'**
  String get reportsWorkContentHint;

  /// Label of the photos attached to the report
  ///
  /// In vi, this message translates to:
  /// **'Hình ảnh đính kèm'**
  String get reportsWorkAttachmentsLabel;

  /// Button that sends the work report
  ///
  /// In vi, this message translates to:
  /// **'GỬI BÁO CÁO'**
  String get reportsWorkSubmit;

  /// Snackbar after the work report was sent
  ///
  /// In vi, this message translates to:
  /// **'Đã gửi báo cáo thành công'**
  String get reportsWorkSubmitSuccess;

  /// Snackbar when sending while photos are still uploading
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng chờ ảnh tải lên xong.'**
  String get reportsWorkUploadsPending;

  /// Snackbar when sending while a photo upload failed
  ///
  /// In vi, this message translates to:
  /// **'Có ảnh chưa tải lên được. Hãy tải lên lại hoặc bỏ ảnh đó.'**
  String get reportsWorkUploadsFailed;

  /// Title given to a new work report: its type and the day (YYYY-MM-DD)
  ///
  /// In vi, this message translates to:
  /// **'{type} - {date}'**
  String reportsWorkDefaultTitle(String type, String date);

  /// Header of the list of reports already sent
  ///
  /// In vi, this message translates to:
  /// **'BÁO CÁO ĐÃ GỬI'**
  String get reportsWorkSubmittedHeader;

  /// No report sent yet
  ///
  /// In vi, this message translates to:
  /// **'Chưa có báo cáo'**
  String get reportsWorkSubmittedEmpty;

  /// Type and day of a sent report
  ///
  /// In vi, this message translates to:
  /// **'{type} · {date}'**
  String reportsWorkSubmittedSubtitle(String type, String date);

  /// The reviewer's note on a sent report
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú: {note}'**
  String reportsWorkReviewNote(String note);

  /// Title of the CA screen listing the team's work reports
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo đội'**
  String get reportsTeamTitle;

  /// Period filter: this week
  ///
  /// In vi, this message translates to:
  /// **'Tuần này'**
  String get reportsTeamPeriodWeek;

  /// Period filter: this month
  ///
  /// In vi, this message translates to:
  /// **'Tháng này'**
  String get reportsTeamPeriodMonth;

  /// Status filter: every review status
  ///
  /// In vi, this message translates to:
  /// **'Tất cả'**
  String get reportsTeamFilterAll;

  /// The team reports could not be loaded, with the failure text
  ///
  /// In vi, this message translates to:
  /// **'Lỗi tải báo cáo: {error}'**
  String reportsTeamLoadError(String error);

  /// Count card: reports matching the filters
  ///
  /// In vi, this message translates to:
  /// **'Kết quả lọc'**
  String get reportsTeamSummaryFiltered;

  /// No report matches the filters
  ///
  /// In vi, this message translates to:
  /// **'Chưa có báo cáo nào'**
  String get reportsTeamEmpty;

  /// Loads the next page of reports
  ///
  /// In vi, this message translates to:
  /// **'Tải thêm ({shown}/{total})'**
  String reportsTeamLoadMore(int shown, int total);

  /// Author shown when a report has no author name
  ///
  /// In vi, this message translates to:
  /// **'DQTV'**
  String get reportsTeamAuthorUnknown;

  /// A report without a location
  ///
  /// In vi, this message translates to:
  /// **'Chưa ghi địa điểm'**
  String get reportsTeamNoLocation;

  /// The review note on a report card
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú duyệt: {note}'**
  String reportsTeamReviewNote(String note);

  /// Button that approves a work report (card and dialog)
  ///
  /// In vi, this message translates to:
  /// **'DUYỆT'**
  String get reportsTeamApprove;

  /// Button that rejects a work report (card and dialog)
  ///
  /// In vi, this message translates to:
  /// **'TỪ CHỐI'**
  String get reportsTeamReject;

  /// Snackbar after a work report was approved
  ///
  /// In vi, this message translates to:
  /// **'Đã duyệt báo cáo'**
  String get reportsTeamApproved;

  /// Snackbar after a work report was rejected
  ///
  /// In vi, this message translates to:
  /// **'Đã từ chối báo cáo'**
  String get reportsTeamRejected;

  /// Title of the dialog approving a work report
  ///
  /// In vi, this message translates to:
  /// **'Duyệt báo cáo'**
  String get reportsTeamReviewDialogApproveTitle;

  /// Title of the dialog rejecting a work report
  ///
  /// In vi, this message translates to:
  /// **'Từ chối báo cáo'**
  String get reportsTeamReviewDialogRejectTitle;

  /// Label of the optional approval note
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú (tùy chọn)'**
  String get reportsTeamReviewDialogApproveNote;

  /// Label of the optional rejection reason
  ///
  /// In vi, this message translates to:
  /// **'Lý do từ chối (tùy chọn)'**
  String get reportsTeamReviewDialogRejectNote;

  /// Closes the review dialog without reviewing
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get reportsTeamReviewDialogCancel;

  /// Title of the work report detail sheet
  ///
  /// In vi, this message translates to:
  /// **'Chi tiết báo cáo'**
  String get reportsDetailTitle;

  /// Tooltip of the button closing the work report detail
  ///
  /// In vi, this message translates to:
  /// **'Đóng'**
  String get reportsDetailClose;

  /// Author shown in the detail when a report has no author name
  ///
  /// In vi, this message translates to:
  /// **'DQTV'**
  String get reportsDetailAuthorUnknown;

  /// Detail of a report without a location
  ///
  /// In vi, this message translates to:
  /// **'Chưa ghi địa điểm'**
  String get reportsDetailNoLocation;

  /// The review note in the report detail
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú duyệt: {note}'**
  String reportsDetailReviewNote(String note);

  /// When the report was reviewed (dd/MM/yyyy HH:mm)
  ///
  /// In vi, this message translates to:
  /// **'Xử lý lúc {time}'**
  String reportsDetailReviewedAt(String time);

  /// Header of the report's attachments, with their count
  ///
  /// In vi, this message translates to:
  /// **'Ảnh đính kèm ({count})'**
  String reportsDetailAttachments(int count);

  /// The report has no attachments
  ///
  /// In vi, this message translates to:
  /// **'Không có ảnh đính kèm'**
  String get reportsDetailNoAttachments;

  /// The month shown by the attendance calendar
  ///
  /// In vi, this message translates to:
  /// **'Tháng {month}/{year}'**
  String attendanceCalendarMonth(int month, int year);

  /// Tooltip of the button showing the previous month
  ///
  /// In vi, this message translates to:
  /// **'Tháng trước'**
  String get attendanceCalendarPreviousMonth;

  /// Tooltip of the button showing the next month
  ///
  /// In vi, this message translates to:
  /// **'Tháng sau'**
  String get attendanceCalendarNextMonth;

  /// Calendar column header: Monday
  ///
  /// In vi, this message translates to:
  /// **'T2'**
  String get attendanceCalendarWeekdayMon;

  /// Calendar column header: Tuesday
  ///
  /// In vi, this message translates to:
  /// **'T3'**
  String get attendanceCalendarWeekdayTue;

  /// Calendar column header: Wednesday
  ///
  /// In vi, this message translates to:
  /// **'T4'**
  String get attendanceCalendarWeekdayWed;

  /// Calendar column header: Thursday
  ///
  /// In vi, this message translates to:
  /// **'T5'**
  String get attendanceCalendarWeekdayThu;

  /// Calendar column header: Friday
  ///
  /// In vi, this message translates to:
  /// **'T6'**
  String get attendanceCalendarWeekdayFri;

  /// Calendar column header: Saturday
  ///
  /// In vi, this message translates to:
  /// **'T7'**
  String get attendanceCalendarWeekdaySat;

  /// Calendar column header: Sunday
  ///
  /// In vi, this message translates to:
  /// **'CN'**
  String get attendanceCalendarWeekdaySun;

  /// Legend: present days
  ///
  /// In vi, this message translates to:
  /// **'Có mặt'**
  String get attendanceCalendarLegendPresent;

  /// Legend: absent days
  ///
  /// In vi, this message translates to:
  /// **'Vắng'**
  String get attendanceCalendarLegendAbsent;

  /// Legend: days on leave
  ///
  /// In vi, this message translates to:
  /// **'Nghỉ phép'**
  String get attendanceCalendarLegendLeave;

  /// Legend: public holidays
  ///
  /// In vi, this message translates to:
  /// **'Lễ'**
  String get attendanceCalendarLegendHoliday;

  /// The month's attendance could not be loaded, with the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được dữ liệu chấm công: {error}'**
  String attendanceCalendarLoadError(String error);

  /// Add training form: the number of days is empty (CreateTrainingDto.totalDays is required)
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập số ngày'**
  String get trainingFormDaysRequired;

  /// Add training form: the number of days is not a number
  ///
  /// In vi, this message translates to:
  /// **'Số ngày phải là số, ví dụ 15 hoặc 1,5'**
  String get trainingFormDaysNotANumber;

  /// Add training form: more than one decimal place (training_records.total_days is DECIMAL(5,1))
  ///
  /// In vi, this message translates to:
  /// **'Số ngày chỉ được có một chữ số thập phân'**
  String get trainingFormDaysTooManyDecimals;

  /// Add training form: the number of days is below the minimum; min is already formatted (e.g. 0,5)
  ///
  /// In vi, this message translates to:
  /// **'Số ngày tối thiểu là {min}'**
  String trainingFormDaysBelowMinimum(String min);

  /// Add training form: the number of days is above the maximum; max is already formatted
  ///
  /// In vi, this message translates to:
  /// **'Số ngày tối đa là {max}'**
  String trainingFormDaysAboveMaximum(String max);

  /// Backend code invalid_status: a task or SOS list asked with an unknown status filter
  ///
  /// In vi, this message translates to:
  /// **'Trạng thái lọc không hợp lệ.'**
  String get commonErrorInvalidStatus;

  /// Backend code task_cannot_be_edited_in_current_status (409): only pending or assigned tasks can be edited
  ///
  /// In vi, this message translates to:
  /// **'Chỉ sửa được nhiệm vụ chưa bắt đầu thực hiện.'**
  String get tasksErrorTaskCannotBeEdited;

  /// Backend code task_cannot_be_cancelled (409)
  ///
  /// In vi, this message translates to:
  /// **'Không thể hủy nhiệm vụ đã hoàn thành hoặc đã hủy.'**
  String get tasksErrorTaskCannotBeCancelled;

  /// App code app_task_report_description_required: SubmitReportDto.description is required
  ///
  /// In vi, this message translates to:
  /// **'Vui lòng nhập mô tả kết quả.'**
  String get tasksErrorReportDescriptionRequired;

  /// App code app_task_report_description_too_long
  ///
  /// In vi, this message translates to:
  /// **'Mô tả kết quả tối đa {max} ký tự.'**
  String tasksErrorReportDescriptionTooLong(int max);

  /// Backend code incident_not_found (404): missing or outside the caller's scope
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy cảnh báo hoặc cảnh báo ngoài phạm vi phụ trách.'**
  String get alertsErrorIncidentNotFound;

  /// Backend code invalid_status_transition (409)
  ///
  /// In vi, this message translates to:
  /// **'Cảnh báo không thể chuyển sang trạng thái này. Vui lòng tải lại.'**
  String get alertsErrorInvalidStatusTransition;

  /// Backend code assignee_not_found (400): assignedTo is not an active user
  ///
  /// In vi, this message translates to:
  /// **'Không tìm thấy người được giao xử lý.'**
  String get alertsErrorAssigneeNotFound;

  /// Task detail: button that opens the completion report (POST /tasks/:id/report)
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo hoàn thành'**
  String get tasksDetailReport;

  /// Task report screen title
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo nhiệm vụ'**
  String get tasksReportTitle;

  /// Task report: description field label (required)
  ///
  /// In vi, this message translates to:
  /// **'Mô tả kết quả *'**
  String get tasksReportDescriptionLabel;

  /// Task report: description field hint
  ///
  /// In vi, this message translates to:
  /// **'Mô tả công việc đã thực hiện...'**
  String get tasksReportDescriptionHint;

  /// Task report: location field label
  ///
  /// In vi, this message translates to:
  /// **'Vị trí'**
  String get tasksReportLocationLabel;

  /// Task report: location field hint
  ///
  /// In vi, this message translates to:
  /// **'Nhập địa điểm thực hiện'**
  String get tasksReportLocationHint;

  /// Task report: photos section label
  ///
  /// In vi, this message translates to:
  /// **'Ảnh hiện trường'**
  String get tasksReportPhotosLabel;

  /// Task report: submit button
  ///
  /// In vi, this message translates to:
  /// **'GỬI BÁO CÁO'**
  String get tasksReportSubmit;

  /// Task report: submit button while sending
  ///
  /// In vi, this message translates to:
  /// **'Đang gửi...'**
  String get tasksReportSubmitting;

  /// Task report: submit pressed while photos are still uploading
  ///
  /// In vi, this message translates to:
  /// **'Ảnh đang được tải lên, vui lòng đợi.'**
  String get tasksReportPhotosUploading;

  /// Task report: submit pressed while a photo upload failed
  ///
  /// In vi, this message translates to:
  /// **'Có ảnh chưa tải lên được: thử lại hoặc bỏ ảnh đó.'**
  String get tasksReportPhotosFailed;

  /// Task report: POST /tasks/:id/report failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không gửi được báo cáo: {reason}'**
  String tasksReportFailed(String reason);

  /// Task report: heading of the result after sending
  ///
  /// In vi, this message translates to:
  /// **'Báo cáo đã được gửi thành công!'**
  String get tasksReportSent;

  /// Task report result: when the report was recorded; time is already formatted
  ///
  /// In vi, this message translates to:
  /// **'Gửi lúc {time}'**
  String tasksReportSentAt(String time);

  /// Task report result: heading of the attached photos
  ///
  /// In vi, this message translates to:
  /// **'Ảnh đính kèm ({count})'**
  String tasksReportSentPhotos(int count);

  /// Task report result: button that returns to the task
  ///
  /// In vi, this message translates to:
  /// **'XONG'**
  String get tasksReportDone;

  /// DQTV task list screen title
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ của tôi'**
  String get tasksMyListTitle;

  /// DQTV task list tab: every task
  ///
  /// In vi, this message translates to:
  /// **'Tất cả ({count})'**
  String tasksMyListTabAll(int count);

  /// DQTV task list tab: tasks that can be accepted (pending, assigned, overdue)
  ///
  /// In vi, this message translates to:
  /// **'Chờ nhận ({count})'**
  String tasksMyListTabToAccept(int count);

  /// DQTV task list tab: tasks in progress
  ///
  /// In vi, this message translates to:
  /// **'Đang làm ({count})'**
  String tasksMyListTabInProgress(int count);

  /// DQTV task list tab: completed tasks
  ///
  /// In vi, this message translates to:
  /// **'Hoàn thành ({count})'**
  String tasksMyListTabCompleted(int count);

  /// DQTV task list: empty tab
  ///
  /// In vi, this message translates to:
  /// **'Không có nhiệm vụ'**
  String get tasksMyListEmpty;

  /// DQTV task list row: the deadline, already formatted, or - when there is none
  ///
  /// In vi, this message translates to:
  /// **'Hạn: {date}'**
  String tasksMyListDeadline(String date);

  /// DQTV task list: GET /tasks failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được nhiệm vụ: {reason}'**
  String tasksMyListLoadFailed(String reason);

  /// SOS alerts screen title
  ///
  /// In vi, this message translates to:
  /// **'Cảnh báo'**
  String get alertsTitle;

  /// SOS alerts: tooltip of the reload button
  ///
  /// In vi, this message translates to:
  /// **'Tải lại'**
  String get alertsRefreshTooltip;

  /// SOS alerts tab: open, acknowledged and responding alerts of the caller's scope (GET /sos counts.active)
  ///
  /// In vi, this message translates to:
  /// **'Chưa xử lý ({count})'**
  String alertsTabActive(int count);

  /// SOS alerts tab: resolved and closed alerts
  ///
  /// In vi, this message translates to:
  /// **'Đã xử lý'**
  String get alertsTabResolved;

  /// SOS alerts: empty tab
  ///
  /// In vi, this message translates to:
  /// **'Không có cảnh báo'**
  String get alertsEmpty;

  /// SOS alerts: GET /sos failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được cảnh báo: {reason}'**
  String alertsLoadFailed(String reason);

  /// SOS alerts row: button that marks the alert resolved
  ///
  /// In vi, this message translates to:
  /// **'XỬ LÝ'**
  String get alertsResolveButton;

  /// SOS resolve dialog title
  ///
  /// In vi, this message translates to:
  /// **'Xử lý cảnh báo'**
  String get alertsResolveDialogTitle;

  /// SOS resolve dialog: resolution note field label
  ///
  /// In vi, this message translates to:
  /// **'Ghi chú xử lý (tùy chọn)'**
  String get alertsResolveNoteLabel;

  /// SOS resolve dialog: cancel
  ///
  /// In vi, this message translates to:
  /// **'Hủy'**
  String get alertsResolveCancel;

  /// SOS resolve dialog: confirm
  ///
  /// In vi, this message translates to:
  /// **'XÁC NHẬN'**
  String get alertsResolveConfirm;

  /// SOS alerts: snackbar after the alert was resolved
  ///
  /// In vi, this message translates to:
  /// **'Đã xử lý cảnh báo'**
  String get alertsResolved;

  /// SOS alerts: PATCH /sos/:id/status failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không xử lý được cảnh báo: {reason}'**
  String alertsResolveFailed(String reason);

  /// SOS severity code low (same wording as the web SOS page)
  ///
  /// In vi, this message translates to:
  /// **'Thấp'**
  String get alertsSeverityLow;

  /// SOS severity code medium
  ///
  /// In vi, this message translates to:
  /// **'Trung bình'**
  String get alertsSeverityMedium;

  /// SOS severity code high
  ///
  /// In vi, this message translates to:
  /// **'Cao'**
  String get alertsSeverityHigh;

  /// SOS severity code urgent
  ///
  /// In vi, this message translates to:
  /// **'Khẩn cấp'**
  String get alertsSeverityUrgent;

  /// SOS incident type code sos
  ///
  /// In vi, this message translates to:
  /// **'SOS'**
  String get alertsTypeSos;

  /// SOS incident type code security
  ///
  /// In vi, this message translates to:
  /// **'An ninh trật tự'**
  String get alertsTypeSecurity;

  /// SOS incident type code fire
  ///
  /// In vi, this message translates to:
  /// **'Cháy nổ'**
  String get alertsTypeFire;

  /// SOS incident type code medical
  ///
  /// In vi, this message translates to:
  /// **'Y tế'**
  String get alertsTypeMedical;

  /// SOS incident type code accident
  ///
  /// In vi, this message translates to:
  /// **'Tai nạn'**
  String get alertsTypeAccident;

  /// SOS incident type code utility
  ///
  /// In vi, this message translates to:
  /// **'Sự cố điện, nước'**
  String get alertsTypeUtility;

  /// SOS incident type code other
  ///
  /// In vi, this message translates to:
  /// **'Khác'**
  String get alertsTypeOther;

  /// Tooltip of a stored file entry that downloads the file and opens the share sheet
  ///
  /// In vi, this message translates to:
  /// **'Mở tệp'**
  String get commonFileOpenTooltip;

  /// A stored file could not be downloaded or handed to another app; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không mở được tệp: {reason}'**
  String commonFileOpenFailed(String reason);

  /// Task detail: heading of the files the creator attached (GET /tasks/:id attachments)
  ///
  /// In vi, this message translates to:
  /// **'TÀI LIỆU ĐÍNH KÈM'**
  String get tasksDetailSectionAttachments;

  /// Create task: label of the attachments picker (POST /tasks attachmentIds)
  ///
  /// In vi, this message translates to:
  /// **'Tài liệu đính kèm'**
  String get tasksCreateAttachmentsLabel;

  /// Create task: submit pressed while an attachment is still uploading
  ///
  /// In vi, this message translates to:
  /// **'Tệp đính kèm đang được tải lên, vui lòng đợi.'**
  String get tasksCreateAttachmentsUploading;

  /// Create task: submit pressed while an attachment upload failed
  ///
  /// In vi, this message translates to:
  /// **'Có tệp chưa tải lên được: thử lại hoặc bỏ tệp đó.'**
  String get tasksCreateAttachmentsFailed;

  /// Militia profile: heading of the documents attached to the profile (GET /militia/:id/documents)
  ///
  /// In vi, this message translates to:
  /// **'TÀI LIỆU HỒ SƠ'**
  String get dqtvDocumentsTitle;

  /// Militia profile documents: none attached
  ///
  /// In vi, this message translates to:
  /// **'Chưa có tài liệu nào'**
  String get dqtvDocumentsEmpty;

  /// Militia profile documents: loading failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được tài liệu: {reason}'**
  String dqtvDocumentsLoadFailed(String reason);

  /// Militia profile documents (staff): attaches the uploaded files to the profile (POST /militia/:id/documents)
  ///
  /// In vi, this message translates to:
  /// **'LƯU TÀI LIỆU'**
  String get dqtvDocumentsSave;

  /// Militia profile documents (staff): save button while sending
  ///
  /// In vi, this message translates to:
  /// **'Đang lưu...'**
  String get dqtvDocumentsSaving;

  /// Militia profile documents (staff): snackbar after the files were attached
  ///
  /// In vi, this message translates to:
  /// **'Đã thêm tài liệu vào hồ sơ'**
  String get dqtvDocumentsSaved;

  /// Militia profile documents (staff): attaching failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không thêm được tài liệu: {reason}'**
  String dqtvDocumentsSaveFailed(String reason);

  /// Militia profile documents (staff): save pressed while a file is still uploading
  ///
  /// In vi, this message translates to:
  /// **'Tài liệu đang được tải lên, vui lòng đợi.'**
  String get dqtvDocumentsUploading;

  /// Militia profile documents (staff): save pressed while an upload failed
  ///
  /// In vi, this message translates to:
  /// **'Có tài liệu chưa tải lên được: thử lại hoặc bỏ tệp đó.'**
  String get dqtvDocumentsUploadFailed;

  /// CA home dashboard title
  ///
  /// In vi, this message translates to:
  /// **'Trang chủ'**
  String get homeCaTitle;

  /// CA home: tooltip of the button that opens the notifications
  ///
  /// In vi, this message translates to:
  /// **'Thông báo'**
  String get homeCaNotificationsTooltip;

  /// CA home: greeting with the signed-in officer's full name (GET /users/me fullName)
  ///
  /// In vi, this message translates to:
  /// **'Chào, {name}'**
  String homeCaGreeting(String name);

  /// CA home: greeting when the profile could not be read
  ///
  /// In vi, this message translates to:
  /// **'Xin chào'**
  String get homeCaGreetingAnonymous;

  /// CA home: every dashboard call failed; reason is the failure text of the first
  ///
  /// In vi, this message translates to:
  /// **'Không tải được trang chủ: {reason}'**
  String homeCaLoadFailed(String reason);

  /// CA home counter: members checked in today (dashboard stats activeToday), else members online on GPS
  ///
  /// In vi, this message translates to:
  /// **'Đang trực'**
  String get homeCaKpiOnDuty;

  /// CA home counter: tasks waiting to be accepted (dashboard stats pendingTasks)
  ///
  /// In vi, this message translates to:
  /// **'Nhiệm vụ'**
  String get homeCaKpiTasks;

  /// CA home counter: leave requests waiting for review (dashboard stats pendingApprovals)
  ///
  /// In vi, this message translates to:
  /// **'Chờ duyệt'**
  String get homeCaKpiApprovals;

  /// CA home counter: active SOS alerts of the scope (GET /sos counts.active)
  ///
  /// In vi, this message translates to:
  /// **'SOS khẩn'**
  String get homeCaKpiSos;

  /// CA home: GET /dashboard/stats failed, counters fall back to the lists; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được số liệu tổng hợp: {reason}'**
  String homeCaStatsFailed(String reason);

  /// CA home: heading of the active SOS alerts
  ///
  /// In vi, this message translates to:
  /// **'CẢNH BÁO MỚI ({count})'**
  String homeCaAlertsTitle(int count);

  /// CA home: opens the full SOS alerts screen
  ///
  /// In vi, this message translates to:
  /// **'Xem tất cả →'**
  String get homeCaSeeAll;

  /// CA home: GET /sos failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được cảnh báo: {reason}'**
  String homeCaAlertsFailed(String reason);

  /// CA home: heading of the shortcuts
  ///
  /// In vi, this message translates to:
  /// **'TRUY CẬP NHANH'**
  String get homeCaQuickTitle;

  /// CA home shortcut (two lines): unit compliance screen
  ///
  /// In vi, this message translates to:
  /// **'Tuân thủ\nđơn vị'**
  String get homeCaQuickCompliance;

  /// CA home shortcut (two lines): training management screen
  ///
  /// In vi, this message translates to:
  /// **'Quản lý\nhuấn luyện'**
  String get homeCaQuickTraining;

  /// CA home shortcut (two lines): approvals screen
  ///
  /// In vi, this message translates to:
  /// **'Phê\nduyệt'**
  String get homeCaQuickApprovals;

  /// CA home: heading of the tasks not yet accepted by their assignee (status pending)
  ///
  /// In vi, this message translates to:
  /// **'NHIỆM VỤ CHỜ TIẾP NHẬN'**
  String get homeCaTasksTitle;

  /// CA home: opens the create task screen
  ///
  /// In vi, this message translates to:
  /// **'Giao nhiệm vụ +'**
  String get homeCaTasksCreate;

  /// CA home: no task is waiting to be accepted
  ///
  /// In vi, this message translates to:
  /// **'Không có nhiệm vụ chờ tiếp nhận'**
  String get homeCaTasksEmpty;

  /// CA home: GET /tasks failed; reason is the failure text
  ///
  /// In vi, this message translates to:
  /// **'Không tải được nhiệm vụ: {reason}'**
  String homeCaTasksFailed(String reason);

  /// GPS tracking screen title
  ///
  /// In vi, this message translates to:
  /// **'Theo dõi GPS'**
  String get gpsTrackingTitle;

  /// Member list heading with how many are online and offline
  ///
  /// In vi, this message translates to:
  /// **'Danh sách ({online} trực tuyến / {offline} ngoại tuyến)'**
  String gpsTrackingSummary(int online, int offline);

  /// Tooltip of the button reloading the positions
  ///
  /// In vi, this message translates to:
  /// **'Tải lại'**
  String get gpsTrackingRefresh;

  /// No member has sent a position yet
  ///
  /// In vi, this message translates to:
  /// **'Chưa có vị trí nào của thành viên'**
  String get gpsTrackingEmpty;

  /// The positions could not be loaded
  ///
  /// In vi, this message translates to:
  /// **'Không tải được vị trí: {error}'**
  String gpsTrackingLoadFailed(String error);

  /// Member status: a recent position
  ///
  /// In vi, this message translates to:
  /// **'Trực tuyến'**
  String get gpsStatusOnline;

  /// Member status: moving
  ///
  /// In vi, this message translates to:
  /// **'Đang di chuyển'**
  String get gpsStatusMoving;

  /// Member status: no recent position
  ///
  /// In vi, this message translates to:
  /// **'Ngoại tuyến'**
  String get gpsStatusOffline;

  /// Member sheet: latitude and longitude
  ///
  /// In vi, this message translates to:
  /// **'Vị trí: {lat}, {lng}'**
  String gpsMemberPosition(String lat, String lng);

  /// Member sheet: position accuracy in metres
  ///
  /// In vi, this message translates to:
  /// **'Sai số khoảng {meters} m'**
  String gpsMemberAccuracy(String meters);

  /// Member sheet: time of the last position (HH:mm dd/MM)
  ///
  /// In vi, this message translates to:
  /// **'Cập nhật lúc {time}'**
  String gpsMemberLastSeen(String time);

  /// Member unit code
  ///
  /// In vi, this message translates to:
  /// **'Đơn vị: {unit}'**
  String gpsMemberUnit(String unit);

  /// Member sheet: the member has no position yet
  ///
  /// In vi, this message translates to:
  /// **'Chưa có vị trí'**
  String get gpsMemberNoPosition;
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
