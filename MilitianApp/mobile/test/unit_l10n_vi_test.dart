// Pins representative resources to their Vietnamese text, so an ARB edit that changes the meaning
// or a mapper wired to the wrong key fails here. This is the only test file with Vietnamese literals:
// every other test compares against viL10n.
// Run: flutter test test/unit_l10n_vi_test.dart

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/core/utils/validators.dart';
import 'package:militian_app/features/auth/auth_texts.dart';
import 'package:militian_app/features/auth/models/auth_response_exception.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/features/chat/chat_texts.dart';
import 'package:militian_app/features/chat/models/conversation.dart';
import 'package:militian_app/features/chat/repositories/chat_repository.dart';
import 'package:militian_app/features/files/files.dart';
import 'package:militian_app/features/incident/incident_report_texts.dart';
import 'package:militian_app/features/incident/repositories/incident_report_repository.dart';
import 'package:militian_app/features/tasks/task_status.dart';
import 'package:militian_app/features/tasks/tasks_exception.dart';
import 'package:militian_app/features/tasks/tasks_texts.dart';
import 'package:militian_app/features/training/training_result.dart';
import 'package:militian_app/features/training/training_texts.dart';
import 'package:militian_app/l10n/error_texts.dart';
import 'package:militian_app/l10n/l10n.dart';
import 'package:militian_app/l10n/validation_texts.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/l10n.dart';

void main() {
  test('UT-L10N-01: the app speaks Vietnamese', () {
    expect(viL10n.localeName, 'vi');
    expect(AppLocalizations.supportedLocales, [const Locale('vi')]);
    expect(viL10n.appTitle, 'Dân Quân Tự Vệ');
    expect(viL10n.shellNavHome, 'Trang chủ');
  });

  test('UT-L10N-02: session notices on the login screen', () {
    expect(sessionEndText(viL10n, SessionEndReason.ended),
        'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.');
    expect(sessionEndText(viL10n, SessionEndReason.passwordChanged),
        'Đổi mật khẩu thành công, vui lòng đăng nhập lại.');
    expect(sessionEndText(viL10n, SessionEndReason.mfaReauthenticationRequired),
        'Tài khoản đã bật xác thực 2 lớp. Vui lòng đăng nhập lại.');
    expect(sessionEndText(viL10n, SessionEndReason.accountDisabled),
        'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.');
    expect(sessionEndText(viL10n, SessionEndReason.noRoleAssigned),
        'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.');
  });

  test('UT-L10N-03: sign-in errors', () {
    String login(String? code, int status) => errorText(viL10n, code, status: status, flow: ErrorFlow.login);
    expect(login('invalid_credentials', 401), 'Sai tên đăng nhập hoặc mật khẩu.');
    expect(login('no_role_assigned', 403), 'Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.');
    expect(login('account_locked', 403), 'Tài khoản bị tạm khóa 30 phút do đăng nhập sai nhiều lần.');
    expect(login('something_new', 403), 'Tài khoản không được phép đăng nhập. Vui lòng liên hệ quản trị viên.');
    expect(login('ThrottlerException: Too Many Requests', 429),
        'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.');
    expect(authIssueText(viL10n, AuthResponseIssue.roleNotAllowed), 'Tài khoản không có quyền dùng ứng dụng này');
    expect(authIssueText(viL10n, AuthResponseIssue.missingTokens), 'Máy chủ trả về thiếu token đăng nhập');
  });

  test('UT-L10N-04: second-factor errors, with the attempts left as a placeholder', () {
    expect(viL10n.errorMfaInvalidCodeAttempts(3), 'Mã xác thực không đúng. Còn 3 lần thử.');
    expect(mfaErrorText(viL10n, const MfaError(code: MfaError.invalidCode, attemptsRemaining: 1)),
        'Mã xác thực không đúng. Còn 1 lần thử.');
    expect(mfaErrorText(viL10n, const MfaError(code: MfaError.invalidCode)), 'Mã xác thực không đúng.');
    expect(mfaErrorText(viL10n, MfaError.missingChallenge()), 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
    expect(errorText(viL10n, 'mfa_locked'),
        'Xác thực 2 lớp bị tạm khóa 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.');
    expect(mfaErrorText(viL10n, const MfaError(code: MfaError.recoveryCodesMissing)),
        'Máy chủ không trả về mã khôi phục. Vui lòng tạo lại mã khôi phục.');
  });

  test('UT-L10N-05: plural counts', () {
    expect(viL10n.authOtpRecoveryCodesRemaining(9), 'Còn 9 mã khôi phục chưa dùng.');
    expect(viL10n.profileSecurityRecoveryCodesRemaining(1), 'Còn 1 mã khôi phục');
    expect(viL10n.profileSecurityRecoveryCodesRemaining(10), 'Còn 10 mã khôi phục');
  });

  test('UT-L10N-06: the backend error table', () {
    expect(errorText(viL10n, 'not_a_participant'), 'Bạn không phải thành viên của cuộc trò chuyện này.');
    expect(errorText(viL10n, 'leave_request_not_pending'), 'Đơn đã được xử lý, không còn ở trạng thái chờ duyệt.');
    expect(errorText(viL10n, 'task_not_found'), 'Không tìm thấy nhiệm vụ.');
    expect(errorText(viL10n, 'refresh_token_reused'), 'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.');
    expect(errorText(viL10n, 'password_reuse'), 'Mật khẩu mới không được trùng với 5 mật khẩu gần nhất.');
    expect(errorText(viL10n, 'invalid_credentials', flow: ErrorFlow.changePassword), 'Mật khẩu hiện tại không đúng.');
    expect(errorText(viL10n, 'validation_failed', status: 400, validationMessage: 'title should not be empty'),
        'Dữ liệu không hợp lệ: title should not be empty');
    expect(errorText(viL10n, null, status: 400), 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.');
    expect(errorText(viL10n, null, status: 409), 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.');
    expect(errorText(viL10n, null, status: 500), 'Máy chủ đang gặp sự cố. Thử lại sau.');
    expect(errorText(viL10n, null, status: 418), 'Có lỗi xảy ra (418).');
    expect(errorText(viL10n, null, kind: FailureKind.connection), 'Không kết nối được máy chủ. Kiểm tra mạng của bạn.');
    expect(errorText(viL10n, null, kind: FailureKind.timeout), 'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.');
    expect(errorText(viL10n, null, kind: FailureKind.unexpected), 'Có lỗi xảy ra. Vui lòng thử lại.');
    expect(errorText(viL10n, 'room_full', flow: ErrorFlow.chatAck), 'Không thể tham gia cuộc trò chuyện (room_full).');
  });

  test('UT-L10N-07: validators and screen text', () {
    expect(validationText(viL10n, ValidationError.required), 'Trường này không được để trống.');
    expect(validationText(viL10n, ValidationError.newPasswordComplexity),
        'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.');
    expect(validationText(viL10n, ValidationError.otpFormat), 'Mã OTP phải gồm đúng 6 chữ số.');
    expect(viL10n.authMfaPanelExpiresAt('10:05'), 'Hoàn tất trước 10:05');
    expect(viL10n.authLoginSubmitButton, 'ĐĂNG NHẬP');
  });

  // The same texts as the Công An app's login screen, so both screens read alike
  test('UT-L10N-09: login and forgot-password screens', () {
    expect(viL10n.appLogoLabel, 'Biểu trưng Dân quân tự vệ');
    expect(viL10n.authLoginSubtitle, 'Hệ thống quản lý Dân quân tự vệ');
    expect(viL10n.authLoginUnit, 'UBND Phường Phú Định - TP. Hồ Chí Minh');
    expect(viL10n.authLoginCardTitle, 'ĐĂNG NHẬP');
    expect(viL10n.authLoginForgotPassword, 'Quên mật khẩu?');
    expect(viL10n.authLoginShowPassword, 'Hiện mật khẩu');
    expect(viL10n.authLoginHidePassword, 'Ẩn mật khẩu');
    expect(viL10n.authLoginVersion('1.0.0'), 'Phiên bản 1.0.0');
    expect(viL10n.authForgotPasswordTitle, 'Khôi phục mật khẩu');
    expect(viL10n.authForgotPasswordUnsupported,
        'Máy chủ chưa hỗ trợ khôi phục mật khẩu qua ứng dụng. Vui lòng liên hệ quản trị viên để được đặt lại mật khẩu.');
    expect(viL10n.authForgotPasswordBack, 'Quay lại đăng nhập');
  });

  test('UT-L10N-08: chat, notifications, work reports and files', () {
    expect(conversationTitle(viL10n, Conversation.fromJson({'id': 'c', 'conversationType': 'direct'})), 'CA KV');
    expect(conversationTitle(viL10n, Conversation.fromJson({'id': 'c', 'conversationType': 'group'})),
        'Nhóm trò chuyện');
    expect(chatIssueText(viL10n, ChatIssue.messageTooLong), 'Tin nhắn tối đa 4000 ký tự.');
    expect(chatIssueText(viL10n, ChatIssue.searchQueryTooLong), 'Từ khóa tìm kiếm tối đa 100 ký tự.');
    expect(viL10n.chatNewConversationSearchTooShort(2), 'Nhập ít nhất 2 ký tự để tìm người tham gia');
    expect(viL10n.chatScreenTypingIndicator, 'Đang nhập...');
    expect(viL10n.notificationsScreenUnreadCount(3), '3 tin chưa đọc');
    expect(viL10n.notificationsScreenLoadMore(20, 35), 'Tải thêm (20/35)');
    expect(errorText(viL10n, 'search_query_too_short', status: 400), 'Từ khóa tìm kiếm cần ít nhất 2 ký tự.');
    expect(errorText(viL10n, 'file_too_large', status: 413), 'Tệp vượt quá dung lượng cho phép (10 MB).');
    expect(errorText(viL10n, 'file_already_attached', status: 409), 'Tệp đã được đính kèm vào hồ sơ khác.');
    expect(filesErrorText(viL10n, const FilesException(FilesIssue.fileEmpty)), 'Tệp rỗng, không thể tải lên.');
    expect(viL10n.filesAttachmentsLimitReached(10), 'Chỉ đính kèm tối đa 10 ảnh.');
    expect(incidentReportErrorText(viL10n, const IncidentReportException(IncidentReportIssue.titleRequired)),
        'Vui lòng chọn hoặc nhập tiêu đề báo cáo.');
    expect(viL10n.incidentReportVoiceUnsupported, 'Máy chủ chưa hỗ trợ ghi âm cho báo cáo.');
    expect(viL10n.incidentReportGpsValue('10.1', '106.2'), '10.1, 106.2 (GPS)');
  });

  test('UT-L10N-10: tasks, training and KPI', () {
    expect(taskTabText(viL10n, TaskTab.waiting), 'Chờ');
    expect(taskStatusText(viL10n, TaskStatus.inProgress), 'Đang thực hiện');
    expect(taskPriorityText(viL10n, 'urgent'), 'Khẩn cấp');
    expect(taskTypeText(viL10n, 'guard'), 'Bảo vệ');
    expect(viL10n.taskListTabWithCount('Chờ', 2), 'Chờ (2)');
    expect(tasksIssueText(viL10n, TasksIssue.reportTooManyPhotos), 'Báo cáo đính kèm tối đa 10 ảnh.');
    expect(errorText(viL10n, 'task_closed', status: 409), 'Nhiệm vụ đã hoàn thành hoặc đã bị hủy.');
    expect(trainingOutcomeText(viL10n, TrainingOutcome.notEvaluated), 'Chưa đánh giá');
    expect(trainingTypeText(viL10n, 'first_aid'), 'Sơ cứu');
    expect(viL10n.kpiRankInUnitOf(2, 12), 'Hạng 2/12 trong đơn vị');
    expect(viL10n.kpiScoreOutOf('8,5', '10'), '8,5/10');
  });
}
