// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class AppLocalizationsVi extends AppLocalizations {
  AppLocalizationsVi([String locale = 'vi']) : super(locale);

  @override
  String get appTitle => 'Dân Quân Tự Vệ';

  @override
  String get commonCancelButton => 'Hủy';

  @override
  String get shellNavHome => 'Trang chủ';

  @override
  String get shellNavCheckin => 'Điểm danh';

  @override
  String get shellNavTasks => 'Nhiệm vụ';

  @override
  String get shellNavNotifications => 'Thông báo';

  @override
  String get shellNavProfile => 'Hồ sơ';

  @override
  String get appLogoLabel => 'Biểu trưng Dân quân tự vệ';

  @override
  String get authLoginSubtitle => 'Hệ thống quản lý Dân quân tự vệ';

  @override
  String get authLoginUnit => 'UBND Phường Phú Định - TP. Hồ Chí Minh';

  @override
  String get authLoginCardTitle => 'ĐĂNG NHẬP';

  @override
  String get authLoginUsernameLabel => 'Tên đăng nhập';

  @override
  String get authLoginUsernameHint => 'Nhập tên đăng nhập';

  @override
  String get authLoginPasswordLabel => 'Mật khẩu';

  @override
  String get authLoginPasswordHint => 'Nhập mật khẩu';

  @override
  String get authLoginSubmitButton => 'ĐĂNG NHẬP';

  @override
  String get authLoginBiometricButton => 'Đăng nhập bằng sinh trắc học';

  @override
  String get authLoginBiometricReason => 'Xác thực để đăng nhập';

  @override
  String get authLoginNoticeSessionEnded =>
      'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.';

  @override
  String get authLoginNoticePasswordChanged =>
      'Đổi mật khẩu thành công, vui lòng đăng nhập lại.';

  @override
  String get authLoginShowPassword => 'Hiện mật khẩu';

  @override
  String get authLoginHidePassword => 'Ẩn mật khẩu';

  @override
  String get authLoginForgotPassword => 'Quên mật khẩu?';

  @override
  String authLoginVersion(String version) {
    return 'Phiên bản $version';
  }

  @override
  String get authForgotPasswordTitle => 'Khôi phục mật khẩu';

  @override
  String get authForgotPasswordUnsupported =>
      'Máy chủ chưa hỗ trợ khôi phục mật khẩu qua ứng dụng. Vui lòng liên hệ quản trị viên để được đặt lại mật khẩu.';

  @override
  String get authForgotPasswordBack => 'Quay lại đăng nhập';

  @override
  String get authOtpTitle => 'Xác thực 2 lớp';

  @override
  String get authOtpInstructionTotp => 'Nhập mã OTP từ ứng dụng xác thực';

  @override
  String get authOtpInstructionRecoveryCode =>
      'Nhập một mã khôi phục đã lưu khi bật xác thực 2 lớp';

  @override
  String get authOtpVerifyButton => 'XÁC NHẬN';

  @override
  String authOtpRecoveryCodesRemaining(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Còn $count mã khôi phục chưa dùng.',
    );
    return '$_temp0';
  }

  @override
  String get authMfaMethodTotp => 'Mã OTP';

  @override
  String get authMfaMethodRecoveryCode => 'Mã khôi phục';

  @override
  String get authMfaOtpHint => 'Nhập 6 chữ số';

  @override
  String get authMfaRecoveryCodeHint => 'XXXXX-XXXXX';

  @override
  String get authMfaRestartLoginButton => 'ĐĂNG NHẬP LẠI';

  @override
  String get authMfaEnrollTitle => 'Cài đặt xác thực 2 lớp';

  @override
  String get authMfaEnrollIntro =>
      'Tài khoản của bạn cần bật xác thực 2 lớp trước khi đăng nhập. Cài ứng dụng xác thực trên điện thoại rồi làm theo 2 bước dưới đây.';

  @override
  String get authMfaEnrollRetryButton => 'THỬ LẠI';

  @override
  String get authMfaPanelStepScan =>
      '1. Quét mã QR bằng ứng dụng xác thực (Microsoft Authenticator, Google Authenticator...)';

  @override
  String get authMfaPanelQrSemantics => 'Mã QR thiết lập xác thực 2 lớp';

  @override
  String get authMfaPanelOpenAuthenticator => 'Mở ứng dụng xác thực';

  @override
  String get authMfaPanelLaunchFailed =>
      'Không mở được ứng dụng xác thực. Hãy quét mã QR hoặc nhập khóa bí mật.';

  @override
  String get authMfaPanelSecretIntro => 'Hoặc nhập khóa bí mật vào ứng dụng:';

  @override
  String get authMfaPanelCopySecretTooltip => 'Sao chép khóa bí mật';

  @override
  String get authMfaPanelSecretCopied => 'Đã sao chép khóa bí mật';

  @override
  String authMfaPanelExpiresAt(String time) {
    return 'Hoàn tất trước $time';
  }

  @override
  String get authMfaPanelStepCode =>
      '2. Nhập mã 6 chữ số đang hiển thị trong ứng dụng';

  @override
  String get authMfaPanelConfirmButton => 'XÁC NHẬN';

  @override
  String get authRecoveryCodesTitle => 'Mã khôi phục';

  @override
  String get authRecoveryCodesWarning =>
      'Các mã này chỉ hiển thị một lần. Hãy lưu ở nơi an toàn: mỗi mã dùng được 1 lần để đăng nhập khi bạn không có ứng dụng xác thực.';

  @override
  String get authRecoveryCodesCopyAll => 'Sao chép tất cả';

  @override
  String get authRecoveryCodesCopied => 'Đã sao chép mã khôi phục';

  @override
  String get authRecoveryCodesShare => 'Chia sẻ';

  @override
  String authRecoveryCodesShareText(String codes) {
    return 'Mã khôi phục xác thực 2 lớp (mỗi mã dùng được 1 lần):\n$codes';
  }

  @override
  String get authRecoveryCodesShareSubject => 'Mã khôi phục xác thực 2 lớp';

  @override
  String get authRecoveryCodesShareFailed =>
      'Không chia sẻ được. Hãy sao chép các mã.';

  @override
  String get authRecoveryCodesAcknowledge => 'Tôi đã lưu các mã ở nơi an toàn';

  @override
  String get authRecoveryCodesContinue => 'Tiếp tục';

  @override
  String get authRecoveryCodesCompleteFailed =>
      'Không thể hoàn tất đăng nhập. Vui lòng đăng nhập lại.';

  @override
  String get profileScreenTitle => 'Cá Nhân';

  @override
  String get profileScreenStatusActive => 'Đang hoạt động';

  @override
  String get profileScreenStatKpiLabel => 'Điểm chỉ tiêu';

  @override
  String get profileScreenStatRankLabel => 'Xếp hạng';

  @override
  String profileScreenStatRankValue(int rank, int size) {
    return '$rank/$size';
  }

  @override
  String profileScreenStatRankOnly(int rank) {
    return '#$rank';
  }

  @override
  String get profileScreenStatNotEvaluated => 'Chưa đánh giá';

  @override
  String get profileScreenStatUnavailable => 'Không tải được';

  @override
  String get profileScreenStatLoading => 'Đang tải chỉ tiêu';

  @override
  String profileScreenLoadFailed(String reason) {
    return 'Không tải được hồ sơ: $reason';
  }

  @override
  String get profileScreenPersonalInfoTitle => 'Thông tin cá nhân';

  @override
  String get profileScreenPhoneLabel => 'Số điện thoại';

  @override
  String get profileScreenEmailLabel => 'Email';

  @override
  String get profileScreenUnitLabel => 'Đơn vị';

  @override
  String get profileScreenQuickLeaveRequest => 'Đăng ký nghỉ phép';

  @override
  String get profileScreenQuickMyRequests => 'Đơn đã gửi';

  @override
  String get profileScreenQuickWorkHistory => 'Lịch sử công tác';

  @override
  String get profileScreenQuickHotline => 'Hotline hỗ trợ';

  @override
  String get profileScreenMenuSettings => 'Cài đặt';

  @override
  String get profileScreenMenuSecurity => 'Bảo mật / Xác thực 2 lớp';

  @override
  String get profileScreenMenuAbout => 'Về ứng dụng';

  @override
  String get profileScreenMenuSupport => 'Hỗ trợ';

  @override
  String get profileScreenLogout => 'Đăng xuất';

  @override
  String get profileSettingsTitle => 'Cài đặt';

  @override
  String get profileSettingsSectionSecurity => 'Bảo mật';

  @override
  String get profileSettingsBiometricTitle => 'Đăng nhập sinh trắc học';

  @override
  String get profileSettingsBiometricSubtitle => 'Dùng vân tay / Face ID';

  @override
  String get profileSettingsChangePasswordTitle => 'Đổi mật khẩu';

  @override
  String get profileSettingsChangePasswordSubtitle =>
      'Thay đổi mật khẩu đăng nhập';

  @override
  String get profileSettingsSectionNotifications => 'Thông báo';

  @override
  String get profileSettingsPushTitle => 'Thông báo đẩy';

  @override
  String get profileSettingsPushOn => 'Nhận thông báo đẩy';

  @override
  String get profileSettingsPushOff => 'Thông báo đẩy đã tắt';

  @override
  String get profileChangePasswordTitle => 'Đổi mật khẩu';

  @override
  String get profileChangePasswordRules =>
      'Mật khẩu mới gồm ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt, không trùng 5 mật khẩu gần nhất. Đổi xong, mọi phiên đăng nhập kết thúc và bạn cần đăng nhập lại.';

  @override
  String get profileChangePasswordCurrentLabel => 'Mật khẩu hiện tại';

  @override
  String get profileChangePasswordNewLabel => 'Mật khẩu mới';

  @override
  String get profileChangePasswordConfirmLabel => 'Xác nhận mật khẩu mới';

  @override
  String get profileChangePasswordSubmitButton => 'ĐỔI MẬT KHẨU';

  @override
  String get profileChangePasswordMismatch => 'Mật khẩu xác nhận không khớp.';

  @override
  String get profileChangePasswordSameAsCurrent =>
      'Mật khẩu mới phải khác mật khẩu hiện tại.';

  @override
  String get profileSecurityTitle => 'Bảo mật';

  @override
  String get profileSecurityHeading => 'Xác thực 2 lớp';

  @override
  String get profileSecurityIntro =>
      'Mỗi lần đăng nhập, ngoài mật khẩu bạn nhập thêm mã 6 chữ số từ ứng dụng xác thực.';

  @override
  String get profileSecurityRetryButton => 'THỬ LẠI';

  @override
  String get profileSecurityStatusDisabled => 'Chưa bật xác thực 2 lớp';

  @override
  String get profileSecurityStatusEnabled => 'Đã bật xác thực 2 lớp';

  @override
  String profileSecurityEnabledOn(String date) {
    return 'Ngày bật: $date';
  }

  @override
  String profileSecurityRecoveryCodesRemaining(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Còn $count mã khôi phục',
    );
    return '$_temp0';
  }

  @override
  String get profileSecurityRecoveryCodesLow =>
      'Sắp hết mã khôi phục. Hãy tạo lại bộ mã mới.';

  @override
  String get profileSecurityRequiredNote =>
      'Vai trò của bạn bắt buộc dùng xác thực 2 lớp.';

  @override
  String get profileSecurityEnableButton => 'BẬT XÁC THỰC 2 LỚP';

  @override
  String get profileSecurityRestartSetupButton => 'BẮT ĐẦU LẠI';

  @override
  String get profileSecurityRegenerateButton => 'Tạo lại mã khôi phục';

  @override
  String get profileSecurityDisableButton => 'Tắt xác thực 2 lớp';

  @override
  String get profileSecurityDisabledSnack => 'Đã tắt xác thực 2 lớp';

  @override
  String get profileSecurityRegenerateDialogTitle => 'Tạo lại mã khôi phục';

  @override
  String get profileSecurityRegenerateDialogDescription =>
      'Nhập mã 6 chữ số trong ứng dụng xác thực. Các mã khôi phục cũ sẽ không dùng được nữa.';

  @override
  String get profileSecurityRegenerateDialogConfirm => 'TẠO LẠI';

  @override
  String get profileSecurityDisableDialogTitle => 'Tắt xác thực 2 lớp';

  @override
  String get profileSecurityDisableDialogDescription =>
      'Xác nhận bằng mã trong ứng dụng xác thực hoặc một mã khôi phục.';

  @override
  String get profileSecurityDisableDialogConfirm => 'TẮT';

  @override
  String get validationRequired => 'Trường này không được để trống.';

  @override
  String get validationUsernameTooShort => 'Tên đăng nhập tối thiểu 3 ký tự.';

  @override
  String get validationPasswordTooShort => 'Mật khẩu tối thiểu 6 ký tự.';

  @override
  String get validationNewPasswordComplexity =>
      'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.';

  @override
  String get validationOtpFormat => 'Mã OTP phải gồm đúng 6 chữ số.';

  @override
  String get validationRecoveryCodeRequired => 'Vui lòng nhập mã khôi phục.';

  @override
  String get validationPhoneInvalid => 'Số điện thoại không hợp lệ.';

  @override
  String get errorAuthInvalidCredentials => 'Sai tên đăng nhập hoặc mật khẩu.';

  @override
  String get errorAuthAccountDisabled =>
      'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorAuthAccountLocked =>
      'Tài khoản bị tạm khóa 30 phút do đăng nhập sai nhiều lần.';

  @override
  String get errorAuthNoRoleAssigned =>
      'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorAuthInvalidOtp => 'Mã OTP không hợp lệ hoặc đã hết hạn.';

  @override
  String get errorAuthSessionExpired =>
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

  @override
  String get errorAuthLoginForbidden =>
      'Tài khoản không được phép đăng nhập. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorAuthMissingTokens => 'Máy chủ trả về thiếu token đăng nhập';

  @override
  String get errorAuthRoleNotAllowed =>
      'Tài khoản không có quyền dùng ứng dụng này';

  @override
  String get errorAuthRecoveryCodesMissing =>
      'Máy chủ không trả về mã khôi phục. Vui lòng tạo lại mã khôi phục.';

  @override
  String get errorMfaInvalidCode => 'Mã xác thực không đúng.';

  @override
  String errorMfaInvalidCodeAttempts(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Mã xác thực không đúng. Còn $count lần thử.',
    );
    return '$_temp0';
  }

  @override
  String get errorMfaTokenInvalid =>
      'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.';

  @override
  String get errorMfaAttemptsExceeded =>
      'Bạn đã nhập sai quá số lần cho phép. Vui lòng đăng nhập lại.';

  @override
  String get errorMfaLocked =>
      'Xác thực 2 lớp bị tạm khóa 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.';

  @override
  String get errorMfaAlreadyEnabled =>
      'Xác thực 2 lớp đã được bật cho tài khoản này.';

  @override
  String get errorMfaNotEnabled => 'Xác thực 2 lớp chưa được bật.';

  @override
  String get errorMfaRequiredByRole =>
      'Vai trò của bạn bắt buộc dùng xác thực 2 lớp nên không thể tắt.';

  @override
  String get errorMfaSetupNotStarted =>
      'Chưa bắt đầu thiết lập xác thực 2 lớp. Vui lòng thử lại.';

  @override
  String get errorMfaReauthenticationRequired =>
      'Tài khoản đã bật xác thực 2 lớp. Vui lòng đăng nhập lại.';

  @override
  String get errorSessionEnded =>
      'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.';

  @override
  String get errorNotificationNotFound => 'Không tìm thấy thông báo.';

  @override
  String get errorChatNotAParticipant =>
      'Bạn không phải thành viên của cuộc trò chuyện này.';

  @override
  String get errorChatMessageTooLong => 'Tin nhắn tối đa 4000 ký tự.';

  @override
  String get errorChatMessageContentRequired => 'Tin nhắn không được để trống.';

  @override
  String get errorChatInvalidConversationId =>
      'Mã cuộc trò chuyện không hợp lệ.';

  @override
  String get errorChatDirectRequiresOneParticipant =>
      'Cuộc trò chuyện trực tiếp cần đúng một người tham gia.';

  @override
  String get errorChatParticipantNotFound => 'Không tìm thấy người tham gia.';

  @override
  String get errorChatNotJoined => 'Bạn chưa tham gia phòng trò chuyện này.';

  @override
  String errorChatJoinFailed(String code) {
    return 'Không thể tham gia cuộc trò chuyện ($code).';
  }

  @override
  String get errorDateInvalid => 'Ngày không hợp lệ.';

  @override
  String get errorLeaveRequestNotFound => 'Không tìm thấy đơn nghỉ phép.';

  @override
  String get errorLeaveNotYourRequest =>
      'Bạn chỉ có thể hủy đơn của chính mình.';

  @override
  String get errorLeaveRequestNotPending =>
      'Đơn đã được xử lý, không còn ở trạng thái chờ duyệt.';

  @override
  String get errorTaskNotFound => 'Không tìm thấy nhiệm vụ.';

  @override
  String get errorPasswordComplexity =>
      'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.';

  @override
  String get errorPasswordReuse =>
      'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất.';

  @override
  String get errorPasswordCurrentWrong => 'Mật khẩu hiện tại không đúng.';

  @override
  String errorValidationFailed(String message) {
    return 'Dữ liệu không hợp lệ: $message';
  }

  @override
  String get errorStatusBadRequest =>
      'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.';

  @override
  String get errorStatusForbidden =>
      'Bạn không có quyền thực hiện thao tác này.';

  @override
  String get errorStatusNotFound => 'Không tìm thấy dữ liệu.';

  @override
  String get errorStatusConflict =>
      'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.';

  @override
  String get errorStatusUnprocessable => 'Dữ liệu không hợp lệ.';

  @override
  String get errorStatusTooManyRequests =>
      'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';

  @override
  String get errorStatusServer => 'Máy chủ đang gặp sự cố. Thử lại sau.';

  @override
  String errorStatusOther(int status) {
    return 'Có lỗi xảy ra ($status).';
  }

  @override
  String get errorNetworkTimeout =>
      'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.';

  @override
  String get errorNetworkConnection =>
      'Không kết nối được máy chủ. Kiểm tra mạng của bạn.';

  @override
  String get errorNetworkBadCertificate =>
      'Lỗi chứng chỉ máy chủ. Liên hệ quản trị.';

  @override
  String get errorNetworkCancelled => 'Yêu cầu đã bị huỷ.';

  @override
  String get errorNetworkUnknown => 'Có lỗi không xác định. Vui lòng thử lại.';

  @override
  String get errorLocationPermissionDenied =>
      'Ứng dụng chưa được cấp quyền vị trí. Vào Cài đặt để cấp quyền.';

  @override
  String get errorLocationServiceDisabled =>
      'Dịch vụ vị trí đang tắt. Hãy bật GPS trên thiết bị.';

  @override
  String get errorUnexpected => 'Có lỗi xảy ra. Vui lòng thử lại.';

  @override
  String get chatConversationUntitledDirect => 'CA KV';

  @override
  String get chatConversationUntitledGroup => 'Nhóm trò chuyện';

  @override
  String chatConversationGroupMembersMore(String names, int count) {
    return '$names +$count';
  }

  @override
  String get chatConversationsScreenTitle => 'Nhắn tin';

  @override
  String get chatConversationsScreenEmpty => 'Chưa có cuộc trò chuyện';

  @override
  String get chatConversationsScreenRetryButton => 'Thử lại';

  @override
  String get chatConversationsScreenNewTooltip => 'Cuộc trò chuyện mới';

  @override
  String get chatScreenTitleFallback => 'CA KV';

  @override
  String get chatScreenRetryButton => 'Thử lại';

  @override
  String get chatScreenMessageHint => 'Nhập tin nhắn...';

  @override
  String get chatScreenTypingIndicator => 'Đang nhập...';

  @override
  String get chatNewConversationScreenTitle => 'Cuộc trò chuyện mới';

  @override
  String get chatNewConversationDirectSegment => 'Trực tiếp';

  @override
  String get chatNewConversationGroupSegment => 'Nhóm';

  @override
  String get chatNewConversationDirectHint =>
      'Chọn đúng một người để trò chuyện';

  @override
  String get chatNewConversationGroupHint =>
      'Chọn một hoặc nhiều người tham gia';

  @override
  String get chatNewConversationGroupTitleLabel => 'Tiêu đề nhóm (tùy chọn)';

  @override
  String get chatNewConversationSearchHint =>
      'Tìm theo tên hoặc tên đăng nhập...';

  @override
  String chatNewConversationSearchTooShort(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Nhập ít nhất $count ký tự để tìm người tham gia',
    );
    return '$_temp0';
  }

  @override
  String get chatNewConversationNoResults => 'Không tìm thấy người phù hợp';

  @override
  String get chatNewConversationCreateButton => 'TẠO';

  @override
  String get chatIssueMessageEmpty => 'Tin nhắn không được để trống.';

  @override
  String chatIssueMessageTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Tin nhắn tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String get chatIssueDirectNeedsOneParticipant =>
      'Chọn đúng một người để trò chuyện trực tiếp.';

  @override
  String get chatIssueGroupNeedsParticipants =>
      'Chọn ít nhất một người tham gia nhóm.';

  @override
  String chatIssueTitleTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Tiêu đề tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String chatIssueSearchQueryTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Từ khóa tìm kiếm tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String get chatIssueMalformedConversationList =>
      'Dữ liệu cuộc trò chuyện không đúng định dạng.';

  @override
  String get chatIssueMalformedMessageList =>
      'Dữ liệu tin nhắn không đúng định dạng.';

  @override
  String get chatIssueMalformedMessage =>
      'Máy chủ trả về tin nhắn không hợp lệ.';

  @override
  String get chatIssueMalformedConversation =>
      'Máy chủ trả về cuộc trò chuyện không hợp lệ.';

  @override
  String get chatIssueMalformedSearchResults =>
      'Không tìm được người tham gia.';

  @override
  String get errorUserSearchQueryTooShort =>
      'Từ khóa tìm kiếm cần ít nhất 2 ký tự.';

  @override
  String get notificationsScreenTitle => 'Thông Báo';

  @override
  String notificationsScreenUnreadCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tin chưa đọc',
    );
    return '$_temp0';
  }

  @override
  String get notificationsScreenNoUnread => 'Không có tin mới';

  @override
  String get notificationsScreenMarkAllRead => 'Đọc hết';

  @override
  String get notificationsScreenTabAll => 'Tất cả';

  @override
  String get notificationsScreenTabTask => 'Nhiệm vụ';

  @override
  String get notificationsScreenTabAttendance => 'Chấm công';

  @override
  String get notificationsScreenTabSystem => 'Hệ thống';

  @override
  String notificationsScreenTabWithCount(String label, int count) {
    return '$label ($count)';
  }

  @override
  String notificationsScreenLoadError(String reason) {
    return 'Lỗi tải thông báo: $reason';
  }

  @override
  String get notificationsScreenRetryButton => 'Thử lại';

  @override
  String notificationsScreenLoadMore(int shown, int total) {
    return 'Tải thêm ($shown/$total)';
  }

  @override
  String get notificationsScreenEmptyTitle => 'Không có thông báo';

  @override
  String get notificationsScreenEmptySubtitle => 'Bạn đã xem hết thông báo';

  @override
  String get notificationsScreenUrgentBadge => 'Khẩn cấp';

  @override
  String get notificationsScreenMalformed =>
      'Dữ liệu thông báo không đúng định dạng.';

  @override
  String get errorFileRequired => 'Chưa có tệp để tải lên.';

  @override
  String get errorFileEmpty => 'Tệp rỗng, không thể tải lên.';

  @override
  String get errorFileFieldInvalid => 'Yêu cầu tải tệp không hợp lệ.';

  @override
  String get errorFileMultipartMalformed =>
      'Dữ liệu tải tệp bị lỗi. Vui lòng thử lại.';

  @override
  String get errorFileTooLarge => 'Tệp vượt quá dung lượng cho phép (10 MB).';

  @override
  String get errorFileTypeNotAllowed => 'Loại tệp không được hỗ trợ.';

  @override
  String get errorFileNotFound =>
      'Không tìm thấy tệp hoặc bạn không có quyền xem tệp này.';

  @override
  String get errorFileDuplicateIds => 'Một tệp được đính kèm nhiều lần.';

  @override
  String get errorFilePurposeMismatch =>
      'Tệp được tải lên cho mục đích khác nên không thể đính kèm.';

  @override
  String get errorFileAlreadyAttached => 'Tệp đã được đính kèm vào hồ sơ khác.';

  @override
  String get filesIssueUnreadable => 'Không đọc được ảnh đã chọn.';

  @override
  String get filesIssueMalformedResponse => 'Máy chủ trả về tệp không hợp lệ.';

  @override
  String get filesIssuePhotoAccessDenied =>
      'Ứng dụng chưa được cấp quyền dùng máy ảnh hoặc thư viện ảnh. Vào Cài đặt để cấp quyền.';

  @override
  String get filesIssuePhotoPickFailed =>
      'Không chọn được ảnh. Vui lòng thử lại.';

  @override
  String get filesPickCamera => 'Chụp ảnh';

  @override
  String get filesPickGallery => 'Thư viện';

  @override
  String filesAttachmentsCount(int count, int max) {
    return '$count/$max ảnh';
  }

  @override
  String filesAttachmentsLimitReached(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Chỉ đính kèm tối đa $max ảnh.',
    );
    return '$_temp0';
  }

  @override
  String get filesUploading => 'Đang tải ảnh lên';

  @override
  String get filesUploadRetry => 'Tải ảnh lên lại';

  @override
  String get filesAttachmentRemove => 'Bỏ ảnh';

  @override
  String filesUploadFailedItem(String name, String reason) {
    return '$name: $reason';
  }

  @override
  String get filesImageLoading => 'Đang tải ảnh';

  @override
  String get filesImageUnreadable => 'Không hiển thị được ảnh';

  @override
  String get incidentReportScreenTitle => 'Báo Cáo Công Việc';

  @override
  String get incidentReportScreenSubtitle => 'Gửi báo cáo công việc, gọi SOS';

  @override
  String get incidentReportSosButton => '🚨 GỌI KHẨN CẤP SOS';

  @override
  String get incidentReportSosDialogTitle => 'GỌI KHẨN CẤP SOS?';

  @override
  String get incidentReportSosDialogContent =>
      'Bạn có chắc chắn muốn gọi điện khẩn cấp đến Công An Khu Vực?';

  @override
  String get incidentReportSosDialogConfirm => 'Gọi ngay';

  @override
  String get incidentReportTaskSection => 'Chọn công việc *';

  @override
  String get incidentReportTaskHint => 'Chọn công việc';

  @override
  String get incidentReportTaskMarketPatrol => 'Tuần tra khu vực chợ Bến Thành';

  @override
  String get incidentReportTaskResidentialCheck =>
      'Kiểm tra an ninh khu dân cư KP1';

  @override
  String get incidentReportTaskTrafficControl => 'Hỗ trợ điều tiết giao thông';

  @override
  String get incidentReportTaskFireSafety =>
      'Tuyên truyền phòng cháy chữa cháy';

  @override
  String get incidentReportTaskOther => 'Khác (Tự nhập tiêu đề)';

  @override
  String get incidentReportCustomTitleHint => 'Nhập tiêu đề báo cáo...';

  @override
  String get incidentReportPhotosSection => 'Ảnh đính kèm';

  @override
  String get incidentReportVoiceUnsupported =>
      'Máy chủ chưa hỗ trợ ghi âm cho báo cáo.';

  @override
  String get incidentReportDescriptionSection => 'Mô tả chi tiết *';

  @override
  String get incidentReportDescriptionHint =>
      'Nhập thông tin chi tiết về công việc...';

  @override
  String get incidentReportLocationSection => 'Vị trí thực hiện *';

  @override
  String get incidentReportLocationHint => 'Nhập địa chỉ...';

  @override
  String incidentReportGpsValue(String latitude, String longitude) {
    return '$latitude, $longitude (GPS)';
  }

  @override
  String incidentReportGpsFailed(String reason) {
    return 'Không lấy được vị trí GPS: $reason Vui lòng nhập địa chỉ.';
  }

  @override
  String get incidentReportSubmitButton => 'Gửi Báo Cáo';

  @override
  String get incidentReportSuccessTitle => 'Gửi Báo Cáo Thành Công!';

  @override
  String get incidentReportSuccessSubtitle =>
      'Báo cáo của bạn đã được ghi nhận';

  @override
  String get incidentReportPhotosUploading =>
      'Ảnh đang được tải lên. Vui lòng đợi rồi gửi báo cáo.';

  @override
  String get incidentReportPhotosFailed =>
      'Có ảnh chưa tải lên được. Tải lên lại hoặc bỏ ảnh đó rồi gửi báo cáo.';

  @override
  String get incidentReportInvalid =>
      'Báo cáo chưa hợp lệ. Vui lòng kiểm tra tiêu đề, mô tả và vị trí rồi gửi lại.';

  @override
  String incidentReportInvalidDetail(String detail) {
    return 'Báo cáo chưa hợp lệ: $detail';
  }

  @override
  String get incidentReportServerError =>
      'Máy chủ đang gặp sự cố, báo cáo chưa được gửi. Vui lòng thử lại sau.';

  @override
  String get incidentReportIssueTitleRequired =>
      'Vui lòng chọn hoặc nhập tiêu đề báo cáo.';

  @override
  String incidentReportIssueTitleTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Tiêu đề tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String get incidentReportIssueContentRequired =>
      'Vui lòng nhập mô tả chi tiết.';

  @override
  String incidentReportIssueContentTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Mô tả tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String get incidentReportIssueLocationRequired =>
      'Vui lòng nhập vị trí thực hiện.';

  @override
  String incidentReportIssueLocationTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Vị trí tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String incidentReportIssueTooManyAttachments(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Báo cáo đính kèm tối đa $max ảnh.',
    );
    return '$_temp0';
  }

  @override
  String get incidentReportIssueDuplicateAttachments =>
      'Một ảnh được đính kèm nhiều lần.';

  @override
  String get commonRetryButton => 'Thử lại';

  @override
  String get kpiScreenTitle => 'Chỉ Tiêu';

  @override
  String get kpiOverallTitle => 'Điểm chỉ tiêu tổng thể';

  @override
  String kpiMonthOfYear(int month, int year) {
    return 'Tháng $month/$year';
  }

  @override
  String get kpiNotEvaluated => 'Chưa có đánh giá tháng này';

  @override
  String kpiScoreScale(String max) {
    return '/$max';
  }

  @override
  String kpiPercent(String value) {
    return '$value%';
  }

  @override
  String kpiChangeFromLastMonth(String change) {
    return '$change so với tháng trước';
  }

  @override
  String kpiRankInUnitOf(int rank, int size) {
    return 'Hạng $rank/$size trong đơn vị';
  }

  @override
  String kpiRankInUnit(int rank) {
    return 'Hạng $rank trong đơn vị';
  }

  @override
  String kpiRankOverall(int rank) {
    return 'Hạng chung #$rank';
  }

  @override
  String get kpiComponentsTitle => 'Điểm thành phần';

  @override
  String get kpiComponentAttendance => 'Chấm công';

  @override
  String get kpiComponentTask => 'Nhiệm vụ';

  @override
  String kpiScoreOutOf(String score, String max) {
    return '$score/$max';
  }

  @override
  String get kpiScoreMissing => '—';

  @override
  String get kpiTrendTitle => 'Xu hướng 6 tháng';

  @override
  String get kpiTrendEmpty => 'Chưa có dữ liệu';

  @override
  String kpiTrendMonth(int month) {
    return 'T$month';
  }

  @override
  String get kpiUnsupportedNote =>
      'Máy chủ chưa hỗ trợ bảng xếp hạng chi tiết và thành tích.';

  @override
  String get trainingScreenTitle => 'Huấn luyện';

  @override
  String trainingProgressTitle(int year) {
    return 'Tiến độ huấn luyện năm $year';
  }

  @override
  String trainingProgressDays(String done, int required) {
    return '$done/$required ngày';
  }

  @override
  String trainingRequirementNote(int days) {
    return 'Luật DQTV 2019 Điều 26 — yêu cầu tối thiểu $days ngày/năm';
  }

  @override
  String get trainingStatusMet => '✓ Đạt yêu cầu';

  @override
  String trainingStatusDaysLeft(String days) {
    return '⚠ Cần thêm $days ngày';
  }

  @override
  String get trainingStatusNotMet => '✗ Chưa đạt';

  @override
  String get trainingFilterAll => 'Tất cả';

  @override
  String get trainingTypeMilitary => 'Quân sự';

  @override
  String get trainingTypePolitical => 'Chính trị';

  @override
  String get trainingTypeFire => 'PCCC';

  @override
  String get trainingTypeFirstAid => 'Sơ cứu';

  @override
  String get trainingTypeOther => 'Khác';

  @override
  String get trainingOutcomePassed => 'Đạt';

  @override
  String get trainingOutcomeFailed => 'Không đạt';

  @override
  String get trainingOutcomeNotEvaluated => 'Chưa đánh giá';

  @override
  String get trainingFilterEmpty => 'Không có đợt huấn luyện loại này';

  @override
  String get trainingEmptyTitle => 'Chưa có đợt huấn luyện nào trong năm';

  @override
  String get trainingEmptyHint =>
      'Các đợt huấn luyện sẽ được cập nhật\nkhi có lịch từ đơn vị';

  @override
  String get trainingRecordUntyped => 'Huấn luyện';

  @override
  String trainingRecordDays(String days) {
    return '$days ngày';
  }

  @override
  String get taskListTitle => 'Nhiệm Vụ Của Tôi';

  @override
  String taskListTabWithCount(String label, int count) {
    return '$label ($count)';
  }

  @override
  String get taskListEmpty => 'Không có nhiệm vụ';

  @override
  String get taskTabInProgress => 'Đang làm';

  @override
  String get taskTabWaiting => 'Chờ';

  @override
  String get taskTabCompleted => 'Hoàn thành';

  @override
  String get taskTabOverdue => 'Quá hạn';

  @override
  String get taskTabCancelled => 'Đã hủy';

  @override
  String get taskStatusPending => 'Chờ tiếp nhận';

  @override
  String get taskStatusAssigned => 'Đã giao';

  @override
  String get taskStatusInProgress => 'Đang thực hiện';

  @override
  String get taskStatusCompleted => 'Hoàn thành';

  @override
  String get taskStatusCancelled => 'Đã hủy';

  @override
  String get taskStatusOverdue => 'Quá hạn';

  @override
  String get taskStatusUnknown => 'Không rõ';

  @override
  String get taskPriorityUrgent => 'Khẩn cấp';

  @override
  String get taskPriorityHigh => 'Cao';

  @override
  String get taskPriorityMedium => 'Trung bình';

  @override
  String get taskPriorityLow => 'Thấp';

  @override
  String get taskTypePatrol => 'Tuần tra';

  @override
  String get taskTypeGuard => 'Bảo vệ';

  @override
  String get taskTypeInspection => 'Kiểm tra';

  @override
  String get taskTypeSupport => 'Hỗ trợ';

  @override
  String get taskTypeTraining => 'Tập huấn';

  @override
  String get taskTypeAdmin => 'Hành chính';

  @override
  String get taskTypeOther => 'Khác';

  @override
  String taskDeadline(String deadline) {
    return 'Hạn: $deadline';
  }

  @override
  String get taskNoDeadline => 'Không có hạn';

  @override
  String get taskAcceptButton => 'Tiếp nhận';

  @override
  String get taskAccepting => 'Đang tiếp nhận...';

  @override
  String get taskAcceptDone => 'Đã tiếp nhận nhiệm vụ';

  @override
  String get taskReportButton => 'Báo cáo';

  @override
  String get taskDetailTitle => 'Chi tiết nhiệm vụ';

  @override
  String taskDetailType(String type) {
    return 'Loại: $type';
  }

  @override
  String taskDetailPriority(String priority) {
    return 'Mức ưu tiên: $priority';
  }

  @override
  String get taskDetailDescription => 'Mô tả';

  @override
  String get taskDetailNoDescription => 'Không có mô tả';

  @override
  String get taskDetailAttachments => 'Tệp đính kèm';

  @override
  String get taskReportTitle => 'Báo cáo nhiệm vụ';

  @override
  String get taskReportDescriptionLabel => 'Mô tả kết quả *';

  @override
  String get taskReportDescriptionHint => 'Mô tả công việc đã thực hiện...';

  @override
  String get taskReportCompletedAtLabel => 'Thời điểm hoàn thành';

  @override
  String get taskReportLocationLabel => 'Vị trí';

  @override
  String get taskReportLocationHint => 'Nhập địa điểm hoặc lấy vị trí GPS';

  @override
  String get taskReportGpsButton => 'Lấy vị trí GPS';

  @override
  String taskReportGpsValue(String latitude, String longitude) {
    return '$latitude, $longitude (GPS)';
  }

  @override
  String taskReportGpsFailed(String reason) {
    return 'Không lấy được vị trí GPS: $reason';
  }

  @override
  String get taskReportPhotosLabel => 'Ảnh đính kèm';

  @override
  String get taskReportPhotosUploading =>
      'Ảnh đang được tải lên. Vui lòng đợi rồi gửi báo cáo.';

  @override
  String get taskReportPhotosFailed =>
      'Có ảnh chưa tải lên được. Tải lên lại hoặc bỏ ảnh đó rồi gửi báo cáo.';

  @override
  String get taskReportSubmitButton => 'GỬI BÁO CÁO';

  @override
  String get taskReportSent => 'Báo cáo đã được gửi thành công!';

  @override
  String get taskIssueMalformedResponse =>
      'Dữ liệu nhiệm vụ không đúng định dạng.';

  @override
  String get taskIssueReportDescriptionRequired =>
      'Vui lòng nhập mô tả kết quả.';

  @override
  String taskIssueReportDescriptionTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Mô tả tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String taskIssueReportLocationTooLong(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Vị trí tối đa $max ký tự.',
    );
    return '$_temp0';
  }

  @override
  String taskIssueReportTooManyPhotos(int max) {
    String _temp0 = intl.Intl.pluralLogic(
      max,
      locale: localeName,
      other: 'Báo cáo đính kèm tối đa $max ảnh.',
    );
    return '$_temp0';
  }

  @override
  String get taskIssueReportDuplicatePhotos =>
      'Một ảnh được đính kèm nhiều lần.';

  @override
  String get errorTaskNotAcceptable =>
      'Nhiệm vụ không còn ở trạng thái có thể tiếp nhận.';

  @override
  String get errorTaskClosed => 'Nhiệm vụ đã hoàn thành hoặc đã bị hủy.';

  @override
  String get errorTaskInvalidStatus => 'Trạng thái nhiệm vụ không hợp lệ.';

  @override
  String get errorTaskCannotBeEdited =>
      'Nhiệm vụ đã bắt đầu nên không thể sửa.';

  @override
  String get errorTaskCannotBeCancelled => 'Nhiệm vụ này không thể hủy.';
}
