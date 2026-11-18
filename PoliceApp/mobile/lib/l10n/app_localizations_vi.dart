// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class AppLocalizationsVi extends AppLocalizations {
  AppLocalizationsVi([String locale = 'vi']) : super(locale);

  @override
  String get appTitle => 'Công An';

  @override
  String get appLogoLabel => 'Huy hiệu Công an nhân dân Việt Nam';

  @override
  String get commonRetry => 'Thử lại';

  @override
  String get authLoginNoticeSessionEnded =>
      'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.';

  @override
  String get authLoginNoticePasswordChanged =>
      'Đổi mật khẩu thành công, vui lòng đăng nhập lại.';

  @override
  String get errorInvalidCredentials => 'Sai tên đăng nhập hoặc mật khẩu.';

  @override
  String get errorAccountDisabled =>
      'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorAccountLocked =>
      'Tài khoản bị tạm khóa 30 phút do đăng nhập sai nhiều lần.';

  @override
  String get errorNoRoleAssigned =>
      'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorInvalidOtp => 'Mã OTP không hợp lệ hoặc đã hết hạn.';

  @override
  String get errorSessionExpired =>
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

  @override
  String get errorMfaReauthenticationRequired =>
      'Tài khoản đã bật xác thực 2 lớp. Vui lòng đăng nhập lại.';

  @override
  String get errorPasswordComplexity =>
      'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.';

  @override
  String get errorPasswordReuse =>
      'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất.';

  @override
  String get errorInvalidCode => 'Mã xác thực không đúng.';

  @override
  String errorInvalidCodeAttemptsRemaining(int count) {
    return 'Mã xác thực không đúng. Còn $count lần thử.';
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
  String get errorNotificationNotFound => 'Không tìm thấy thông báo.';

  @override
  String get errorWorkReportAlreadyReviewed =>
      'Báo cáo này đã được duyệt trước đó.';

  @override
  String get errorCannotReviewOwnReport =>
      'Bạn không thể tự duyệt báo cáo của mình.';

  @override
  String get errorWorkReportNotFound =>
      'Không tìm thấy báo cáo hoặc bạn không có quyền xem.';

  @override
  String get errorOnlyCaCanReview =>
      'Chỉ cán bộ Công an mới được duyệt báo cáo.';

  @override
  String get errorNotAParticipant =>
      'Bạn không phải thành viên của cuộc trò chuyện này.';

  @override
  String get errorMessageTooLong => 'Tin nhắn tối đa 4000 ký tự.';

  @override
  String get errorMessageContentRequired => 'Tin nhắn không được để trống.';

  @override
  String get errorInvalidConversationId => 'Mã cuộc trò chuyện không hợp lệ.';

  @override
  String get errorDirectConversationRequiresOneParticipant =>
      'Cuộc trò chuyện trực tiếp cần đúng một người tham gia.';

  @override
  String get errorParticipantNotFound => 'Không tìm thấy người tham gia.';

  @override
  String get errorNotJoined => 'Bạn chưa tham gia phòng trò chuyện này.';

  @override
  String get errorLeaveRequestNotPending =>
      'Đơn nghỉ phép đã được xử lý trước đó.';

  @override
  String get errorInsufficientLeaveBalance =>
      'Người đề nghị không còn đủ số ngày phép.';

  @override
  String get errorCannotReviewOwnRequest =>
      'Bạn không thể tự duyệt đơn nghỉ phép của mình.';

  @override
  String get errorLeaveRequestNotFound =>
      'Không tìm thấy đơn nghỉ phép hoặc đơn ngoài phạm vi quản lý.';

  @override
  String get errorInsufficientRoleToReview =>
      'Tài khoản của bạn không có quyền duyệt đơn nghỉ phép.';

  @override
  String get errorInsufficientRoleToViewApprovals =>
      'Tài khoản của bạn không có quyền xem danh sách phê duyệt.';

  @override
  String get errorInvalidDate => 'Ngày không hợp lệ.';

  @override
  String get errorBadRequest =>
      'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.';

  @override
  String get errorForbidden => 'Bạn không có quyền thực hiện thao tác này.';

  @override
  String get errorNotFound => 'Không tìm thấy dữ liệu.';

  @override
  String get errorConflict =>
      'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.';

  @override
  String get errorUnprocessable => 'Dữ liệu không hợp lệ.';

  @override
  String get errorTooManyRequests =>
      'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.';

  @override
  String get errorServer => 'Máy chủ đang gặp sự cố. Thử lại sau.';

  @override
  String errorHttpStatus(int status) {
    return 'Có lỗi xảy ra ($status).';
  }

  @override
  String errorValidationDetail(String detail) {
    return 'Dữ liệu không hợp lệ: $detail';
  }

  @override
  String get errorNetwork =>
      'Không kết nối được máy chủ. Kiểm tra mạng của bạn.';

  @override
  String get errorTimeout => 'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.';

  @override
  String get errorBadCertificate => 'Lỗi chứng chỉ máy chủ. Liên hệ quản trị.';

  @override
  String get errorCancelled => 'Yêu cầu đã bị huỷ.';

  @override
  String get errorUnexpected => 'Có lỗi không xác định. Vui lòng thử lại.';

  @override
  String get errorUnknown => 'Có lỗi xảy ra. Vui lòng thử lại.';

  @override
  String get errorBadResponse => 'Máy chủ trả về dữ liệu không đúng định dạng.';

  @override
  String get errorLocationPermission =>
      'Ứng dụng chưa được cấp quyền vị trí. Vào Cài đặt để cấp quyền.';

  @override
  String get errorLocationDisabled =>
      'Dịch vụ vị trí đang tắt. Hãy bật GPS trên thiết bị.';

  @override
  String get errorLoginForbidden =>
      'Tài khoản không được phép đăng nhập. Vui lòng liên hệ quản trị viên.';

  @override
  String get errorSessionStartFailed =>
      'Không thể bắt đầu phiên đăng nhập. Vui lòng đăng nhập lại.';

  @override
  String get errorMissingTokens => 'Máy chủ trả về thiếu token đăng nhập';

  @override
  String get errorRoleNotAllowed =>
      'Tài khoản không có quyền dùng ứng dụng này';

  @override
  String get errorCurrentPasswordInvalid => 'Mật khẩu hiện tại không đúng.';

  @override
  String get errorOtpFormat => 'Mã OTP phải gồm 6 chữ số.';

  @override
  String get errorRecoveryCodeRequired => 'Vui lòng nhập mã khôi phục.';

  @override
  String errorChatJoinFailed(String code) {
    return 'Không thể tham gia cuộc trò chuyện ($code).';
  }

  @override
  String get errorDirectRequiresOne =>
      'Chọn đúng một người để trò chuyện trực tiếp.';

  @override
  String get errorGroupRequiresParticipant =>
      'Chọn ít nhất một người tham gia nhóm.';

  @override
  String errorTitleTooLong(int max) {
    return 'Tiêu đề tối đa $max ký tự.';
  }

  @override
  String get errorParticipantSearchFailed => 'Không tìm được người tham gia.';

  @override
  String get commonConfirm => 'XÁC NHẬN';

  @override
  String get commonCancel => 'Hủy';

  @override
  String get authLoginSubtitle => 'Hệ thống quản lý Dân quân tự vệ';

  @override
  String get authLoginUnit => 'UBND Phường Phú Định - TP. Hồ Chí Minh';

  @override
  String get authLoginCardTitle => 'ĐĂNG NHẬP';

  @override
  String get authLoginUsernameLabel => 'Tên đăng nhập';

  @override
  String get authLoginUsernameHint => 'ca001 hoặc dqtv001';

  @override
  String get authLoginUsernameRequired => 'Tên đăng nhập không được để trống';

  @override
  String get authLoginPasswordLabel => 'Mật khẩu';

  @override
  String get authLoginPasswordHint => '••••••';

  @override
  String get authLoginPasswordRequired => 'Mật khẩu không được để trống';

  @override
  String get authLoginShowPassword => 'Hiện mật khẩu';

  @override
  String get authLoginHidePassword => 'Ẩn mật khẩu';

  @override
  String get authLoginForgotPassword => 'Quên mật khẩu?';

  @override
  String get authLoginSubmit => 'ĐĂNG NHẬP';

  @override
  String authLoginVersion(String version) {
    return 'Phiên bản $version';
  }

  @override
  String get authOtpTitle => 'Xác thực 2 bước';

  @override
  String get authOtpMethodTotp => 'Mã OTP';

  @override
  String get authOtpMethodRecoveryCode => 'Mã khôi phục';

  @override
  String get authOtpInstructionTotp =>
      'Nhập mã OTP 6 số từ ứng dụng xác thực của bạn';

  @override
  String get authOtpInstructionRecoveryCode =>
      'Nhập một mã khôi phục chưa dùng (dạng XXXXX-XXXXX)';

  @override
  String get authOtpCodeHint => '000000';

  @override
  String get authRecoveryCodeHint => 'XXXXX-XXXXX';

  @override
  String authOtpRecoveryCodesRemaining(int count) {
    return 'Còn $count mã khôi phục chưa dùng.';
  }

  @override
  String get authRestartLogin => 'ĐĂNG NHẬP LẠI';

  @override
  String get authMfaSetupTitle => 'Thiết lập xác thực 2 lớp';

  @override
  String get authMfaSetupRequiredNotice =>
      'Tài khoản của bạn bắt buộc dùng xác thực 2 lớp trước khi đăng nhập.';

  @override
  String get authEnrollStepScan =>
      '1. Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Microsoft Authenticator...)';

  @override
  String get authEnrollOpenAuthenticator => 'Mở ứng dụng xác thực';

  @override
  String get authEnrollSecretLabel => 'Hoặc nhập khóa bí mật:';

  @override
  String get authEnrollCopySecretTooltip => 'Sao chép khóa bí mật';

  @override
  String get authEnrollSecretCopied => 'Đã sao chép khóa bí mật';

  @override
  String get authEnrollOpenAuthenticatorFailed =>
      'Không mở được ứng dụng xác thực. Hãy quét mã QR hoặc nhập khóa bí mật.';

  @override
  String authEnrollExpiresAt(String time) {
    return 'Mã thiết lập hết hạn lúc $time';
  }

  @override
  String get authEnrollStepCode => '2. Nhập mã 6 số ứng dụng hiển thị';

  @override
  String get authRecoveryCodesTitle => 'Mã khôi phục';

  @override
  String authRecoveryCodesSaveInstruction(int count) {
    return 'Lưu $count mã sau ở nơi an toàn. Các mã chỉ hiển thị một lần.';
  }

  @override
  String get authRecoveryCodesUsageNote =>
      'Mỗi mã dùng được một lần, thay cho mã OTP khi bạn không có điện thoại xác thực.';

  @override
  String get authRecoveryCodesCopyAll => 'Sao chép tất cả';

  @override
  String get authRecoveryCodesCopied => 'Đã sao chép tất cả mã khôi phục';

  @override
  String get authRecoveryCodesShare => 'Chia sẻ';

  @override
  String get authRecoveryCodesShareSubject => 'Mã khôi phục MMS';

  @override
  String get authRecoveryCodesShareFailed =>
      'Không chia sẻ được. Hãy dùng \"Sao chép tất cả\".';

  @override
  String get authRecoveryCodesSavedConfirm => 'Tôi đã lưu các mã ở nơi an toàn';

  @override
  String get authRecoveryCodesContinue => 'Tiếp tục';

  @override
  String get authSecurityTitle => 'Bảo mật';

  @override
  String get authSecurityLoadFailed => 'Không tải được trạng thái bảo mật';

  @override
  String get authSecurityMfaEnabled => 'Đã bật xác thực 2 lớp';

  @override
  String get authSecurityMfaDisabled => 'Chưa bật xác thực 2 lớp';

  @override
  String authSecurityEnabledSince(String date) {
    return 'Bật từ ngày $date';
  }

  @override
  String get authSecurityMfaRequiredByRole =>
      'Vai trò của bạn bắt buộc dùng xác thực 2 lớp.';

  @override
  String get authSecurityEnableMfa => 'BẬT XÁC THỰC 2 LỚP';

  @override
  String get authSecurityRestartSetup => 'BẮT ĐẦU LẠI';

  @override
  String authSecurityRecoveryCodesRemaining(int count) {
    return 'Còn $count mã khôi phục';
  }

  @override
  String get authSecurityRegenerateCodes => 'TẠO LẠI MÃ KHÔI PHỤC';

  @override
  String get authSecurityDisableMfa => 'TẮT XÁC THỰC 2 LỚP';

  @override
  String get authSecurityMfaDisabledDone => 'Đã tắt xác thực 2 lớp';

  @override
  String get authSecurityChangePassword => 'Đổi mật khẩu';

  @override
  String get authSecurityChangePasswordHint =>
      'Mọi phiên đăng nhập sẽ kết thúc sau khi đổi';

  @override
  String get authSecurityRegenerateDialogTitle => 'Tạo lại mã khôi phục';

  @override
  String get authSecurityDisableDialogTitle => 'Tắt xác thực 2 lớp';

  @override
  String get authCodeDialogTotpLabel => 'Mã OTP 6 số';

  @override
  String get authCodeDialogRecoveryLabel => 'Mã khôi phục (XXXXX-XXXXX)';

  @override
  String get authChangePasswordTitle => 'Đổi mật khẩu';

  @override
  String get authChangePasswordNote =>
      'Sau khi đổi mật khẩu, mọi phiên đăng nhập sẽ kết thúc và bạn cần đăng nhập lại.';

  @override
  String get authChangePasswordCurrentLabel => 'Mật khẩu hiện tại';

  @override
  String get authChangePasswordCurrentRequired =>
      'Vui lòng nhập mật khẩu hiện tại';

  @override
  String get authChangePasswordShow => 'Hiện mật khẩu';

  @override
  String get authChangePasswordHide => 'Ẩn mật khẩu';

  @override
  String get authChangePasswordNewLabel => 'Mật khẩu mới';

  @override
  String get authChangePasswordMustDiffer =>
      'Mật khẩu mới phải khác mật khẩu hiện tại';

  @override
  String get authChangePasswordConfirmLabel => 'Nhập lại mật khẩu mới';

  @override
  String get authChangePasswordMismatch => 'Mật khẩu xác nhận không khớp';

  @override
  String get authChangePasswordSubmit => 'ĐỔI MẬT KHẨU';

  @override
  String get authForgotPasswordTitle => 'Khôi phục mật khẩu';

  @override
  String get authForgotPasswordUnsupported =>
      'Máy chủ chưa hỗ trợ khôi phục mật khẩu qua ứng dụng. Vui lòng liên hệ quản trị viên để được đặt lại mật khẩu.';

  @override
  String get authForgotPasswordBack => 'Quay lại đăng nhập';

  @override
  String get tasksPriorityLow => 'Thấp';

  @override
  String get tasksPriorityMedium => 'Trung bình';

  @override
  String get tasksPriorityHigh => 'Cao';

  @override
  String get tasksPriorityUrgent => 'Khẩn cấp';

  @override
  String get tasksStatusPending => 'Chờ giao';

  @override
  String get tasksStatusAssigned => 'Chưa tiếp nhận';

  @override
  String get tasksStatusInProgress => 'Đang thực hiện';

  @override
  String get tasksStatusCompleted => 'Hoàn thành';

  @override
  String get tasksStatusOverdue => 'Trễ hạn';

  @override
  String get tasksStatusCancelled => 'Đã hủy';

  @override
  String get tasksCreateTitle => 'Giao nhiệm vụ';

  @override
  String get tasksCreateTitleLabel => 'Tiêu đề nhiệm vụ *';

  @override
  String get tasksCreateTitleHint => 'Nhập tiêu đề...';

  @override
  String get tasksCreateTitleRequired => 'Bắt buộc nhập tiêu đề';

  @override
  String get tasksCreateDescriptionLabel => 'Mô tả';

  @override
  String get tasksCreateDescriptionHint => 'Mô tả chi tiết nhiệm vụ...';

  @override
  String get tasksCreateLocationLabel => 'Địa điểm';

  @override
  String get tasksCreateLocationHint => 'Địa điểm thực hiện...';

  @override
  String tasksCreateCoordinates(String lat, String lng) {
    return 'Tọa độ: $lat, $lng';
  }

  @override
  String get tasksCreateNoCoordinates => 'Chưa gắn tọa độ';

  @override
  String get tasksCreateClearCoordinatesTooltip => 'Bỏ tọa độ';

  @override
  String get tasksCreateUseCurrentLocation => 'Vị trí hiện tại';

  @override
  String tasksCreateLocationFailed(String reason) {
    return 'Không lấy được vị trí: $reason';
  }

  @override
  String get tasksCreatePriorityLabel => 'Mức độ ưu tiên';

  @override
  String get tasksCreateDeadlineLabel => 'Hạn hoàn thành';

  @override
  String get tasksCreateDeadlineHint => 'Chọn ngày giờ...';

  @override
  String get tasksCreateAssigneeLabel => 'Giao cho DQTV *';

  @override
  String get tasksCreateAssigneeHint => 'Chọn DQTV nhận nhiệm vụ';

  @override
  String get tasksCreateAssigneeRequired => 'Vui lòng chọn DQTV nhận nhiệm vụ';

  @override
  String tasksCreateAssigneesLoadFailed(String reason) {
    return 'Không tải được danh sách DQTV: $reason';
  }

  @override
  String tasksCreateInvalid(String reason) {
    return 'Thông tin nhiệm vụ không hợp lệ: $reason';
  }

  @override
  String tasksCreateFailed(String reason) {
    return 'Lỗi tạo nhiệm vụ: $reason';
  }

  @override
  String get tasksCreateSuccess => 'Đã tạo nhiệm vụ thành công';

  @override
  String get tasksCreateSubmit => 'GIAO NHIỆM VỤ';

  @override
  String get tasksCreateSubmitting => 'Đang giao...';

  @override
  String get tasksDetailTitle => 'Chi tiết nhiệm vụ';

  @override
  String tasksDetailLoadFailed(String reason) {
    return 'Lỗi tải nhiệm vụ: $reason';
  }

  @override
  String get tasksDetailNotFound => 'Không tìm thấy nhiệm vụ';

  @override
  String get tasksDetailSectionDetails => 'CHI TIẾT';

  @override
  String get tasksDetailDescription => 'Mô tả';

  @override
  String get tasksDetailLocation => 'Địa điểm';

  @override
  String get tasksDetailDeadline => 'Hạn hoàn thành';

  @override
  String get tasksDetailCreatedAt => 'Ngày tạo';

  @override
  String get tasksDetailSectionAssignee => 'ĐƯỢC GIAO';

  @override
  String get tasksDetailAccept => 'Tiếp nhận nhiệm vụ';

  @override
  String get tasksDetailAccepted => 'Đã tiếp nhận nhiệm vụ';

  @override
  String tasksDetailAcceptFailed(String reason) {
    return 'Lỗi tiếp nhận: $reason';
  }

  @override
  String get tasksErrorPriorityInvalid => 'Mức độ ưu tiên không hợp lệ.';

  @override
  String tasksErrorLocationNameTooLong(int max) {
    return 'Địa điểm tối đa $max ký tự.';
  }

  @override
  String get tasksErrorCoordinatesIncomplete =>
      'Tọa độ phải có đủ vĩ độ và kinh độ.';

  @override
  String get tasksErrorLatitudeOutOfRange =>
      'Vĩ độ phải trong khoảng -90 đến 90.';

  @override
  String get tasksErrorLongitudeOutOfRange =>
      'Kinh độ phải trong khoảng -180 đến 180.';

  @override
  String get tasksErrorTaskNotFound => 'Không tìm thấy nhiệm vụ.';

  @override
  String get tasksErrorMilitiaNoUserAccount =>
      'DQTV này chưa có tài khoản nên chưa thể nhận nhiệm vụ.';

  @override
  String get tasksErrorDqtvNotAssignedToCa =>
      'DQTV này không thuộc danh sách bạn phụ trách.';

  @override
  String get trainingManagementTitle => 'Quản lý Huấn luyện';

  @override
  String trainingManagementLoadFailed(String reason) {
    return 'Lỗi tải dữ liệu: $reason';
  }

  @override
  String trainingManagementSummary(int days) {
    return 'đợt huấn luyện có kết quả Đạt (yêu cầu tối thiểu $days ngày/năm)';
  }

  @override
  String get trainingManagementAddButton => 'Thêm đợt huấn luyện';

  @override
  String get trainingManagementEmpty => 'Chưa có đợt huấn luyện nào';

  @override
  String get trainingManagementEmptyHint => 'Nhấn + để thêm đợt huấn luyện mới';

  @override
  String get trainingFilterAll => 'Tất cả';

  @override
  String get trainingFilterPassed => 'Đã đạt';

  @override
  String get trainingFilterFailed => 'Chưa đạt';

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
  String get trainingCardUntyped => 'Huấn luyện';

  @override
  String trainingCardDays(String days) {
    return '$days ngày';
  }

  @override
  String get trainingFormTitle => 'Thêm đợt huấn luyện';

  @override
  String get trainingFormMilitiaLabel => 'Dân quân tự vệ *';

  @override
  String get trainingFormMilitiaHint => 'Chọn DQTV...';

  @override
  String get trainingFormTypeLabel => 'Loại huấn luyện *';

  @override
  String get trainingFormTypeHint => 'Chọn loại';

  @override
  String get trainingFormTypeRequired => 'Vui lòng chọn';

  @override
  String get trainingFormFromLabel => 'Ngày bắt đầu *';

  @override
  String get trainingFormToLabel => 'Ngày kết thúc *';

  @override
  String get trainingFormDateHint => 'Chọn ngày';

  @override
  String get trainingFormDaysLabel => 'Số ngày';

  @override
  String get trainingFormDaysHint => 'Tự động tính hoặc nhập tay';

  @override
  String get trainingFormLocationLabel => 'Địa điểm';

  @override
  String get trainingFormLocationHint => 'Tên địa điểm huấn luyện';

  @override
  String get trainingFormInstructorLabel => 'Giáo viên / Chỉ huy';

  @override
  String get trainingFormInstructorHint => 'Họ tên người phụ trách';

  @override
  String get trainingFormResultLabel => 'Kết quả';

  @override
  String get trainingFormSave => 'Lưu đợt huấn luyện';

  @override
  String get trainingFormDatesRequired =>
      'Vui lòng chọn ngày bắt đầu và kết thúc';

  @override
  String get trainingFormMilitiaRequired => 'Vui lòng chọn dân quân tự vệ';

  @override
  String trainingFormSaveFailed(String reason) {
    return 'Lỗi lưu dữ liệu: $reason';
  }

  @override
  String get trainingMilitiaPickerTitle => 'Chọn DQTV';

  @override
  String get trainingMilitiaPickerHint => 'Tìm theo tên hoặc mã...';

  @override
  String trainingMilitiaPickerFailed(String reason) {
    return 'Không tìm được DQTV: $reason';
  }

  @override
  String get trainingMilitiaPickerEmpty => 'Không tìm thấy DQTV phù hợp';

  @override
  String trainingMilitiaPickerShowing(int shown, int total) {
    return 'Hiển thị $shown/$total — nhập thêm để thu hẹp kết quả';
  }

  @override
  String get trainingMilitiaPickerClose => 'Đóng';

  @override
  String get trainingErrorInsufficientRoleToCreate =>
      'Tài khoản của bạn không có quyền thêm đợt huấn luyện.';

  @override
  String get dqtvErrorMilitiaNotFound => 'Không tìm thấy DQTV.';

  @override
  String get dqtvErrorKpiNotVisible =>
      'Bạn không có quyền xem KPI của người này.';

  @override
  String get dqtvDetailTitle => 'Hồ sơ DQTV';

  @override
  String dqtvDetailLoadFailed(String reason) {
    return 'Lỗi tải hồ sơ: $reason';
  }

  @override
  String get dqtvDetailSectionContact => 'THÔNG TIN LIÊN HỆ';

  @override
  String get dqtvDetailSectionMilitary => 'HỒ SƠ QUÂN SỰ';

  @override
  String get dqtvDetailMilitiaCode => 'Mã DQTV';

  @override
  String get dqtvDetailRank => 'Cấp bậc';

  @override
  String get dqtvDetailUnit => 'Đơn vị';

  @override
  String get dqtvDetailEvaluate => 'Đánh giá chỉ tiêu';

  @override
  String get dqtvDetailSectionKpi => 'KPI THÁNG NÀY';

  @override
  String dqtvDetailKpiOutOf(String max) {
    return '/ $max điểm';
  }

  @override
  String dqtvDetailKpiFailed(String reason) {
    return 'Không tải được KPI: $reason';
  }

  @override
  String get dqtvStatusActive => 'Đang hoạt động';

  @override
  String get dqtvStatusInactive => 'Không hoạt động';

  @override
  String get profileTitle => 'Cá nhân';

  @override
  String get profileCaRoleBadge => 'Công An Khu Vực';

  @override
  String get profileDqtvRoleBadge => 'Dân Quân Tự Vệ';

  @override
  String get profileSectionAccount => 'THÔNG TIN TÀI KHOẢN';

  @override
  String get profileUsername => 'Tên đăng nhập';

  @override
  String get profileEmail => 'Email';

  @override
  String get profilePhone => 'Điện thoại';

  @override
  String get profileNotUpdated => 'Chưa cập nhật';

  @override
  String get profileCaSectionPolice => 'THÔNG TIN CÔNG VỤ';

  @override
  String get profileCaBadgeNumber => 'Số hiệu';

  @override
  String get profileRank => 'Cấp bậc';

  @override
  String get profileUnit => 'Đơn vị';

  @override
  String get profileDqtvSectionMilitary => 'HỒ SƠ QUÂN SỰ';

  @override
  String get profileDqtvMilitiaCode => 'Mã DQTV';

  @override
  String get profileDqtvSectionKpi => 'KPI THÁNG NÀY';

  @override
  String get profileDqtvKpiTotal => 'Tổng điểm';

  @override
  String get profileDqtvKpiAttendance => 'Chuyên cần';

  @override
  String get profileDqtvKpiTasks => 'Nhiệm vụ';

  @override
  String get profileSecurity => 'Bảo mật / Xác thực 2 lớp';

  @override
  String get profileLogout => 'ĐĂNG XUẤT';

  @override
  String get profileLogoutConfirmTitle => 'Đăng xuất';

  @override
  String get profileLogoutConfirmMessage => 'Bạn có chắc muốn đăng xuất không?';

  @override
  String get profileLogoutConfirmCancel => 'Hủy';

  @override
  String get profileLogoutConfirmOk => 'Đăng xuất';

  @override
  String profileLoadFailed(String reason) {
    return 'Không tải được thông tin cá nhân: $reason';
  }

  @override
  String profileCaPoliceFailed(String reason) {
    return 'Không tải được thông tin công vụ: $reason';
  }

  @override
  String profileDqtvMilitiaFailed(String reason) {
    return 'Không tải được hồ sơ quân sự: $reason';
  }

  @override
  String profileDqtvKpiFailed(String reason) {
    return 'Không tải được KPI: $reason';
  }

  @override
  String get profileErrorUserNotFound => 'Không tìm thấy tài khoản.';

  @override
  String get notificationsTitle => 'Thông báo';

  @override
  String get notificationsMarkAllRead => 'Đọc hết';

  @override
  String notificationsLoadFailed(String reason) {
    return 'Lỗi tải thông báo: $reason';
  }

  @override
  String get notificationsEmpty => 'Chưa có thông báo nào';

  @override
  String notificationsLoadMore(int shown, int total) {
    return 'Tải thêm ($shown/$total)';
  }

  @override
  String get filesImageLoading => 'Đang tải ảnh';

  @override
  String get filesImageUnreadable => 'Không đọc được ảnh';

  @override
  String get filesViewerClose => 'Đóng';

  @override
  String get filesPickCamera => 'Chụp ảnh';

  @override
  String get filesPickGallery => 'Thư viện ảnh';

  @override
  String filesAttachmentsCount(int count, int max) {
    return '$count/$max ảnh';
  }

  @override
  String get filesAttachmentRemove => 'Bỏ ảnh này';

  @override
  String get filesUploadRetry => 'Tải lên lại';

  @override
  String get filesUploading => 'Đang tải ảnh lên';

  @override
  String filesUploadFailedItem(String name, String error) {
    return '$name: $error';
  }

  @override
  String filesAttachmentsLimitReached(int max) {
    return 'Chỉ đính kèm tối đa $max ảnh; ảnh vượt quá đã được bỏ qua.';
  }

  @override
  String get filesErrorFileRequired => 'Chưa có tệp nào được gửi lên.';

  @override
  String get filesErrorFileEmpty => 'Tệp rỗng, không thể tải lên.';

  @override
  String get filesErrorFileFieldInvalid => 'Yêu cầu tải tệp không hợp lệ.';

  @override
  String get filesErrorMultipartMalformed =>
      'Dữ liệu tải lên bị hỏng. Vui lòng thử lại.';

  @override
  String get filesErrorFileTooLarge => 'Tệp vượt quá dung lượng tối đa 10 MB.';

  @override
  String get filesErrorFileTypeNotAllowed =>
      'Định dạng tệp không được hỗ trợ (chỉ nhận JPEG, PNG, WebP, GIF, PDF, DOCX, XLSX).';

  @override
  String get filesErrorFileNotFound =>
      'Không tìm thấy tệp hoặc bạn không có quyền xem.';

  @override
  String get filesErrorDuplicateFileIds => 'Một tệp được đính kèm nhiều lần.';

  @override
  String get filesErrorFilePurposeMismatch =>
      'Tệp này được tải lên cho mục đích khác nên không thể đính kèm.';

  @override
  String get filesErrorFileAlreadyAttached =>
      'Tệp đã được đính kèm vào hồ sơ khác. Vui lòng tải ảnh lên lại.';

  @override
  String get filesErrorPhotoAccessDenied =>
      'Ứng dụng chưa được cấp quyền dùng máy ảnh hoặc thư viện ảnh.';

  @override
  String get filesErrorPhotoPickFailed =>
      'Không lấy được ảnh. Vui lòng thử lại.';

  @override
  String get reportsErrorTypeInvalid => 'Loại báo cáo không hợp lệ.';

  @override
  String get reportsErrorReviewStatusInvalid =>
      'Trạng thái duyệt không hợp lệ.';

  @override
  String get reportsErrorDateFilterInvalid => 'Ngày lọc không hợp lệ.';

  @override
  String get reportsErrorTitleRequired =>
      'Tiêu đề báo cáo không được để trống.';

  @override
  String reportsErrorTitleTooLong(int max) {
    return 'Tiêu đề tối đa $max ký tự.';
  }

  @override
  String get reportsErrorContentRequired =>
      'Nội dung báo cáo không được để trống.';

  @override
  String reportsErrorContentTooLong(int max) {
    return 'Nội dung tối đa $max ký tự.';
  }

  @override
  String reportsErrorLocationTooLong(int max) {
    return 'Địa điểm tối đa $max ký tự.';
  }

  @override
  String reportsErrorReviewNoteTooLong(int max) {
    return 'Ghi chú duyệt tối đa $max ký tự.';
  }

  @override
  String reportsErrorAttachmentsTooMany(int max) {
    return 'Tối đa $max ảnh đính kèm.';
  }

  @override
  String approvalsErrorReasonTooLong(int max) {
    return 'Lý do tối đa $max ký tự.';
  }

  @override
  String get chatScreenTitle => 'Trò chuyện';

  @override
  String get chatScreenRefresh => 'Tải lại';

  @override
  String chatScreenLoadFailed(String error) {
    return 'Lỗi tải tin nhắn: $error';
  }

  @override
  String get chatScreenEmpty => 'Chưa có tin nhắn';

  @override
  String get chatScreenInputHint => 'Nhập tin nhắn...';

  @override
  String get chatScreenSend => 'Gửi';

  @override
  String chatScreenCharacterCount(int current, int max) {
    return '$current/$max';
  }

  @override
  String chatScreenTypingOne(String name) {
    return '$name đang nhập…';
  }

  @override
  String chatScreenTypingTwo(String first, String second) {
    return '$first, $second đang nhập…';
  }

  @override
  String chatScreenTypingMany(String first, String second, int count) {
    return '$first, $second và $count người khác đang nhập…';
  }

  @override
  String get chatScreenTypingSomeone => 'Người khác';

  @override
  String get chatListTitle => 'Tin nhắn';

  @override
  String get chatListNewConversation => 'Cuộc trò chuyện mới';

  @override
  String chatListLoadFailed(String error) {
    return 'Lỗi tải cuộc trò chuyện: $error';
  }

  @override
  String get chatListEmpty => 'Chưa có cuộc trò chuyện';

  @override
  String get chatListEmptyHint => 'Nhấn + để tạo cuộc trò chuyện mới';

  @override
  String get chatListUnreadOverflow => '99+';

  @override
  String get chatConversationTypeGroup => 'Nhóm';

  @override
  String get chatConversationTypeDirect => 'Trực tiếp';

  @override
  String get chatConversationUntitledGroup => 'Nhóm trò chuyện';

  @override
  String get chatConversationUntitledDirect => 'Trò chuyện trực tiếp';

  @override
  String chatConversationGroupMembersMore(String names, int count) {
    return '$names +$count';
  }

  @override
  String get chatNewTitle => 'Cuộc trò chuyện mới';

  @override
  String get chatNewInstructionGroup => 'Chọn một hoặc nhiều người tham gia';

  @override
  String get chatNewInstructionDirect => 'Chọn đúng một người để trò chuyện';

  @override
  String get chatNewGroupTitleLabel => 'Tiêu đề nhóm (tùy chọn)';

  @override
  String get chatNewSearchHint => 'Tìm theo tên, tên đăng nhập hoặc mã DQTV...';

  @override
  String chatNewSearchTooShort(int count) {
    return 'Nhập ít nhất $count ký tự để tìm người tham gia';
  }

  @override
  String get chatNewNoResults => 'Không tìm thấy người phù hợp';

  @override
  String get chatNewCreate => 'TẠO';

  @override
  String get tasksErrorTaskNotAcceptable =>
      'Nhiệm vụ không còn ở trạng thái có thể tiếp nhận.';

  @override
  String get tasksErrorTaskClosed => 'Nhiệm vụ đã hoàn thành hoặc đã bị hủy.';

  @override
  String get approvalsScreenTitle => 'Duyệt đơn nghỉ phép';

  @override
  String get approvalsScreenRefresh => 'Làm mới';

  @override
  String approvalsScreenTabPending(int count) {
    return 'Chờ duyệt ($count)';
  }

  @override
  String get approvalsScreenTabApproved => 'Đã duyệt';

  @override
  String get approvalsScreenTabRejected => 'Từ chối';

  @override
  String get approvalsScreenEmptyPending =>
      'Không có đơn chờ duyệt.\nCán bộ CA chỉ thấy đơn của DQTV được phân công; CA phường/khu vực thấy đơn trong đơn vị.';

  @override
  String get approvalsScreenEmpty => 'Không có dữ liệu';

  @override
  String approvalsScreenLeavePeriod(
      String leaveType, String from, String to, String days) {
    return '$leaveType  •  $from → $to ($days ngày)';
  }

  @override
  String approvalsScreenReason(String reason) {
    return 'Lý do: $reason';
  }

  @override
  String approvalsScreenReviewer(String name) {
    return 'Người xử lý: $name';
  }

  @override
  String approvalsScreenReviewedAt(String time) {
    return 'Thời gian xử lý: $time';
  }

  @override
  String approvalsScreenRejectReason(String note) {
    return 'Lý do từ chối: $note';
  }

  @override
  String approvalsScreenApproveNote(String note) {
    return 'Ghi chú duyệt: $note';
  }

  @override
  String get approvalsScreenReject => 'TỪ CHỐI';

  @override
  String get approvalsScreenApprove => 'DUYỆT';

  @override
  String get approvalsScreenApproved => 'Đã duyệt đơn';

  @override
  String get approvalsScreenRejected => 'Đã từ chối đơn';

  @override
  String get approvalsLeaveStatusPending => 'Chờ duyệt';

  @override
  String get approvalsLeaveStatusApproved => 'Đã duyệt';

  @override
  String get approvalsLeaveStatusRejected => 'Từ chối';

  @override
  String get approvalsLeaveStatusCancelled => 'Đã hủy';

  @override
  String get approvalsRejectDialogTitle => 'Từ chối đơn nghỉ phép';

  @override
  String get approvalsRejectDialogReasonLabel => 'Lý do từ chối *';

  @override
  String get approvalsRejectDialogReasonHint => 'Nhập lý do...';

  @override
  String get approvalsRejectDialogReasonRequired =>
      'Vui lòng nhập lý do từ chối';

  @override
  String get approvalsRejectDialogCancel => 'Hủy';

  @override
  String get approvalsRejectDialogConfirm => 'XÁC NHẬN';

  @override
  String get reportsTypeDaily => 'Hàng ngày';

  @override
  String get reportsTypeIncident => 'Sự vụ';

  @override
  String get reportsTypeMonthly => 'Tháng';

  @override
  String get reportsReviewStatusPending => 'Chờ duyệt';

  @override
  String get reportsReviewStatusApproved => 'Đã duyệt';

  @override
  String get reportsReviewStatusRejected => 'Từ chối';

  @override
  String get reportsWorkTitle => 'Gửi báo cáo';

  @override
  String get reportsWorkLocationLabel => 'Địa điểm';

  @override
  String get reportsWorkLocationHint => 'Nhập địa điểm (tùy chọn)';

  @override
  String get reportsWorkContentLabel => 'Nội dung *';

  @override
  String get reportsWorkContentHint => 'Nhập nội dung báo cáo...';

  @override
  String get reportsWorkAttachmentsLabel => 'Hình ảnh đính kèm';

  @override
  String get reportsWorkSubmit => 'GỬI BÁO CÁO';

  @override
  String get reportsWorkSubmitSuccess => 'Đã gửi báo cáo thành công';

  @override
  String get reportsWorkUploadsPending => 'Vui lòng chờ ảnh tải lên xong.';

  @override
  String get reportsWorkUploadsFailed =>
      'Có ảnh chưa tải lên được. Hãy tải lên lại hoặc bỏ ảnh đó.';

  @override
  String reportsWorkDefaultTitle(String type, String date) {
    return '$type - $date';
  }

  @override
  String get reportsWorkSubmittedHeader => 'BÁO CÁO ĐÃ GỬI';

  @override
  String get reportsWorkSubmittedEmpty => 'Chưa có báo cáo';

  @override
  String reportsWorkSubmittedSubtitle(String type, String date) {
    return '$type · $date';
  }

  @override
  String reportsWorkReviewNote(String note) {
    return 'Ghi chú: $note';
  }

  @override
  String get reportsTeamTitle => 'Báo cáo đội';

  @override
  String get reportsTeamPeriodWeek => 'Tuần này';

  @override
  String get reportsTeamPeriodMonth => 'Tháng này';

  @override
  String get reportsTeamFilterAll => 'Tất cả';

  @override
  String reportsTeamLoadError(String error) {
    return 'Lỗi tải báo cáo: $error';
  }

  @override
  String get reportsTeamSummaryFiltered => 'Kết quả lọc';

  @override
  String get reportsTeamEmpty => 'Chưa có báo cáo nào';

  @override
  String reportsTeamLoadMore(int shown, int total) {
    return 'Tải thêm ($shown/$total)';
  }

  @override
  String get reportsTeamAuthorUnknown => 'DQTV';

  @override
  String get reportsTeamNoLocation => 'Chưa ghi địa điểm';

  @override
  String reportsTeamReviewNote(String note) {
    return 'Ghi chú duyệt: $note';
  }

  @override
  String get reportsTeamApprove => 'DUYỆT';

  @override
  String get reportsTeamReject => 'TỪ CHỐI';

  @override
  String get reportsTeamApproved => 'Đã duyệt báo cáo';

  @override
  String get reportsTeamRejected => 'Đã từ chối báo cáo';

  @override
  String get reportsTeamReviewDialogApproveTitle => 'Duyệt báo cáo';

  @override
  String get reportsTeamReviewDialogRejectTitle => 'Từ chối báo cáo';

  @override
  String get reportsTeamReviewDialogApproveNote => 'Ghi chú (tùy chọn)';

  @override
  String get reportsTeamReviewDialogRejectNote => 'Lý do từ chối (tùy chọn)';

  @override
  String get reportsTeamReviewDialogCancel => 'Hủy';

  @override
  String get reportsDetailTitle => 'Chi tiết báo cáo';

  @override
  String get reportsDetailClose => 'Đóng';

  @override
  String get reportsDetailAuthorUnknown => 'DQTV';

  @override
  String get reportsDetailNoLocation => 'Chưa ghi địa điểm';

  @override
  String reportsDetailReviewNote(String note) {
    return 'Ghi chú duyệt: $note';
  }

  @override
  String reportsDetailReviewedAt(String time) {
    return 'Xử lý lúc $time';
  }

  @override
  String reportsDetailAttachments(int count) {
    return 'Ảnh đính kèm ($count)';
  }

  @override
  String get reportsDetailNoAttachments => 'Không có ảnh đính kèm';

  @override
  String attendanceCalendarMonth(int month, int year) {
    return 'Tháng $month/$year';
  }

  @override
  String get attendanceCalendarPreviousMonth => 'Tháng trước';

  @override
  String get attendanceCalendarNextMonth => 'Tháng sau';

  @override
  String get attendanceCalendarWeekdayMon => 'T2';

  @override
  String get attendanceCalendarWeekdayTue => 'T3';

  @override
  String get attendanceCalendarWeekdayWed => 'T4';

  @override
  String get attendanceCalendarWeekdayThu => 'T5';

  @override
  String get attendanceCalendarWeekdayFri => 'T6';

  @override
  String get attendanceCalendarWeekdaySat => 'T7';

  @override
  String get attendanceCalendarWeekdaySun => 'CN';

  @override
  String get attendanceCalendarLegendPresent => 'Có mặt';

  @override
  String get attendanceCalendarLegendAbsent => 'Vắng';

  @override
  String get attendanceCalendarLegendLeave => 'Nghỉ phép';

  @override
  String get attendanceCalendarLegendHoliday => 'Lễ';

  @override
  String attendanceCalendarLoadError(String error) {
    return 'Không tải được dữ liệu chấm công: $error';
  }

  @override
  String get trainingFormDaysRequired => 'Vui lòng nhập số ngày';

  @override
  String get trainingFormDaysNotANumber =>
      'Số ngày phải là số, ví dụ 15 hoặc 1,5';

  @override
  String get trainingFormDaysTooManyDecimals =>
      'Số ngày chỉ được có một chữ số thập phân';

  @override
  String trainingFormDaysBelowMinimum(String min) {
    return 'Số ngày tối thiểu là $min';
  }

  @override
  String trainingFormDaysAboveMaximum(String max) {
    return 'Số ngày tối đa là $max';
  }

  @override
  String get commonErrorInvalidStatus => 'Trạng thái lọc không hợp lệ.';

  @override
  String get tasksErrorTaskCannotBeEdited =>
      'Chỉ sửa được nhiệm vụ chưa bắt đầu thực hiện.';

  @override
  String get tasksErrorTaskCannotBeCancelled =>
      'Không thể hủy nhiệm vụ đã hoàn thành hoặc đã hủy.';

  @override
  String get tasksErrorReportDescriptionRequired =>
      'Vui lòng nhập mô tả kết quả.';

  @override
  String tasksErrorReportDescriptionTooLong(int max) {
    return 'Mô tả kết quả tối đa $max ký tự.';
  }

  @override
  String get alertsErrorIncidentNotFound =>
      'Không tìm thấy cảnh báo hoặc cảnh báo ngoài phạm vi phụ trách.';

  @override
  String get alertsErrorInvalidStatusTransition =>
      'Cảnh báo không thể chuyển sang trạng thái này. Vui lòng tải lại.';

  @override
  String get alertsErrorAssigneeNotFound =>
      'Không tìm thấy người được giao xử lý.';

  @override
  String get tasksDetailReport => 'Báo cáo hoàn thành';

  @override
  String get tasksReportTitle => 'Báo cáo nhiệm vụ';

  @override
  String get tasksReportDescriptionLabel => 'Mô tả kết quả *';

  @override
  String get tasksReportDescriptionHint => 'Mô tả công việc đã thực hiện...';

  @override
  String get tasksReportLocationLabel => 'Vị trí';

  @override
  String get tasksReportLocationHint => 'Nhập địa điểm thực hiện';

  @override
  String get tasksReportPhotosLabel => 'Ảnh hiện trường';

  @override
  String get tasksReportSubmit => 'GỬI BÁO CÁO';

  @override
  String get tasksReportSubmitting => 'Đang gửi...';

  @override
  String get tasksReportPhotosUploading =>
      'Ảnh đang được tải lên, vui lòng đợi.';

  @override
  String get tasksReportPhotosFailed =>
      'Có ảnh chưa tải lên được: thử lại hoặc bỏ ảnh đó.';

  @override
  String tasksReportFailed(String reason) {
    return 'Không gửi được báo cáo: $reason';
  }

  @override
  String get tasksReportSent => 'Báo cáo đã được gửi thành công!';

  @override
  String tasksReportSentAt(String time) {
    return 'Gửi lúc $time';
  }

  @override
  String tasksReportSentPhotos(int count) {
    return 'Ảnh đính kèm ($count)';
  }

  @override
  String get tasksReportDone => 'XONG';

  @override
  String get tasksMyListTitle => 'Nhiệm vụ của tôi';

  @override
  String tasksMyListTabAll(int count) {
    return 'Tất cả ($count)';
  }

  @override
  String tasksMyListTabToAccept(int count) {
    return 'Chờ nhận ($count)';
  }

  @override
  String tasksMyListTabInProgress(int count) {
    return 'Đang làm ($count)';
  }

  @override
  String tasksMyListTabCompleted(int count) {
    return 'Hoàn thành ($count)';
  }

  @override
  String get tasksMyListEmpty => 'Không có nhiệm vụ';

  @override
  String tasksMyListDeadline(String date) {
    return 'Hạn: $date';
  }

  @override
  String tasksMyListLoadFailed(String reason) {
    return 'Không tải được nhiệm vụ: $reason';
  }

  @override
  String get alertsTitle => 'Cảnh báo';

  @override
  String get alertsRefreshTooltip => 'Tải lại';

  @override
  String alertsTabActive(int count) {
    return 'Chưa xử lý ($count)';
  }

  @override
  String get alertsTabResolved => 'Đã xử lý';

  @override
  String get alertsEmpty => 'Không có cảnh báo';

  @override
  String alertsLoadFailed(String reason) {
    return 'Không tải được cảnh báo: $reason';
  }

  @override
  String get alertsResolveButton => 'XỬ LÝ';

  @override
  String get alertsResolveDialogTitle => 'Xử lý cảnh báo';

  @override
  String get alertsResolveNoteLabel => 'Ghi chú xử lý (tùy chọn)';

  @override
  String get alertsResolveCancel => 'Hủy';

  @override
  String get alertsResolveConfirm => 'XÁC NHẬN';

  @override
  String get alertsResolved => 'Đã xử lý cảnh báo';

  @override
  String alertsResolveFailed(String reason) {
    return 'Không xử lý được cảnh báo: $reason';
  }

  @override
  String get alertsSeverityLow => 'Thấp';

  @override
  String get alertsSeverityMedium => 'Trung bình';

  @override
  String get alertsSeverityHigh => 'Cao';

  @override
  String get alertsSeverityUrgent => 'Khẩn cấp';

  @override
  String get alertsTypeSos => 'SOS';

  @override
  String get alertsTypeSecurity => 'An ninh trật tự';

  @override
  String get alertsTypeFire => 'Cháy nổ';

  @override
  String get alertsTypeMedical => 'Y tế';

  @override
  String get alertsTypeAccident => 'Tai nạn';

  @override
  String get alertsTypeUtility => 'Sự cố điện, nước';

  @override
  String get alertsTypeOther => 'Khác';

  @override
  String get commonFileOpenTooltip => 'Mở tệp';

  @override
  String commonFileOpenFailed(String reason) {
    return 'Không mở được tệp: $reason';
  }

  @override
  String get tasksDetailSectionAttachments => 'TÀI LIỆU ĐÍNH KÈM';

  @override
  String get tasksCreateAttachmentsLabel => 'Tài liệu đính kèm';

  @override
  String get tasksCreateAttachmentsUploading =>
      'Tệp đính kèm đang được tải lên, vui lòng đợi.';

  @override
  String get tasksCreateAttachmentsFailed =>
      'Có tệp chưa tải lên được: thử lại hoặc bỏ tệp đó.';

  @override
  String get dqtvDocumentsTitle => 'TÀI LIỆU HỒ SƠ';

  @override
  String get dqtvDocumentsEmpty => 'Chưa có tài liệu nào';

  @override
  String dqtvDocumentsLoadFailed(String reason) {
    return 'Không tải được tài liệu: $reason';
  }

  @override
  String get dqtvDocumentsSave => 'LƯU TÀI LIỆU';

  @override
  String get dqtvDocumentsSaving => 'Đang lưu...';

  @override
  String get dqtvDocumentsSaved => 'Đã thêm tài liệu vào hồ sơ';

  @override
  String dqtvDocumentsSaveFailed(String reason) {
    return 'Không thêm được tài liệu: $reason';
  }

  @override
  String get dqtvDocumentsUploading =>
      'Tài liệu đang được tải lên, vui lòng đợi.';

  @override
  String get dqtvDocumentsUploadFailed =>
      'Có tài liệu chưa tải lên được: thử lại hoặc bỏ tệp đó.';

  @override
  String get homeCaTitle => 'Trang chủ';

  @override
  String get homeCaNotificationsTooltip => 'Thông báo';

  @override
  String homeCaGreeting(String name) {
    return 'Chào, $name';
  }

  @override
  String get homeCaGreetingAnonymous => 'Xin chào';

  @override
  String homeCaLoadFailed(String reason) {
    return 'Không tải được trang chủ: $reason';
  }

  @override
  String get homeCaKpiOnDuty => 'Đang trực';

  @override
  String get homeCaKpiTasks => 'Nhiệm vụ';

  @override
  String get homeCaKpiApprovals => 'Chờ duyệt';

  @override
  String get homeCaKpiSos => 'SOS khẩn';

  @override
  String homeCaStatsFailed(String reason) {
    return 'Không tải được số liệu tổng hợp: $reason';
  }

  @override
  String homeCaAlertsTitle(int count) {
    return 'CẢNH BÁO MỚI ($count)';
  }

  @override
  String get homeCaSeeAll => 'Xem tất cả →';

  @override
  String homeCaAlertsFailed(String reason) {
    return 'Không tải được cảnh báo: $reason';
  }

  @override
  String get homeCaQuickTitle => 'TRUY CẬP NHANH';

  @override
  String get homeCaQuickCompliance => 'Tuân thủ\nđơn vị';

  @override
  String get homeCaQuickTraining => 'Quản lý\nhuấn luyện';

  @override
  String get homeCaQuickApprovals => 'Phê\nduyệt';

  @override
  String get homeCaTasksTitle => 'NHIỆM VỤ CHỜ TIẾP NHẬN';

  @override
  String get homeCaTasksCreate => 'Giao nhiệm vụ +';

  @override
  String get homeCaTasksEmpty => 'Không có nhiệm vụ chờ tiếp nhận';

  @override
  String homeCaTasksFailed(String reason) {
    return 'Không tải được nhiệm vụ: $reason';
  }

  @override
  String get gpsTrackingTitle => 'Theo dõi GPS';

  @override
  String gpsTrackingSummary(int online, int offline) {
    return 'Danh sách ($online trực tuyến / $offline ngoại tuyến)';
  }

  @override
  String get gpsTrackingRefresh => 'Tải lại';

  @override
  String get gpsTrackingEmpty => 'Chưa có vị trí nào của thành viên';

  @override
  String gpsTrackingLoadFailed(String error) {
    return 'Không tải được vị trí: $error';
  }

  @override
  String get gpsStatusOnline => 'Trực tuyến';

  @override
  String get gpsStatusMoving => 'Đang di chuyển';

  @override
  String get gpsStatusOffline => 'Ngoại tuyến';

  @override
  String gpsMemberPosition(String lat, String lng) {
    return 'Vị trí: $lat, $lng';
  }

  @override
  String gpsMemberAccuracy(String meters) {
    return 'Sai số khoảng $meters m';
  }

  @override
  String gpsMemberLastSeen(String time) {
    return 'Cập nhật lúc $time';
  }

  @override
  String gpsMemberUnit(String unit) {
    return 'Đơn vị: $unit';
  }

  @override
  String get gpsMemberNoPosition => 'Chưa có vị trí';
}
