// Unit Tests: the Vietnamese string resources (lib/l10n/app_vi.arb, gen-l10n)
// Run: flutter test test/unit_l10n_vi_test.dart

import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/l10n/app_localizations.dart';

import 'helpers/l10n.dart';

void main() {
  test('UT-L10N-01: Vietnamese is the app locale', () {
    expect(AppLocalizations.supportedLocales, [const Locale('vi')]);
    expect(viL10n.localeName, 'vi');
  });

  test('UT-L10N-02: the resources hold the Vietnamese texts', () {
    // The app is named in Vietnamese, like the militia app ("Dân Quân Tự Vệ")
    expect(viL10n.appTitle, 'Công An');
    expect(viL10n.authLoginSubtitle, 'Hệ thống quản lý Dân quân tự vệ');
    expect(viL10n.authLoginUnit, 'UBND Phường Phú Định - TP. Hồ Chí Minh');
    expect(viL10n.authLoginCardTitle, 'ĐĂNG NHẬP');
    expect(viL10n.authForgotPasswordTitle, 'Khôi phục mật khẩu');
    expect(viL10n.commonRetry, 'Thử lại');
    expect(viL10n.authLoginNoticeSessionEnded, 'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại.');
    expect(viL10n.authLoginNoticePasswordChanged, 'Đổi mật khẩu thành công, vui lòng đăng nhập lại.');
    expect(viL10n.errorInvalidCredentials, 'Sai tên đăng nhập hoặc mật khẩu.');
    expect(viL10n.errorTooManyRequests, 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.');
    expect(viL10n.errorInvalidCodeAttemptsRemaining(3), 'Mã xác thực không đúng. Còn 3 lần thử.');
    expect(viL10n.errorHttpStatus(418), 'Có lỗi xảy ra (418).');
    expect(viL10n.errorValidationDetail('title must be a string'),
        'Dữ liệu không hợp lệ: title must be a string');
    expect(viL10n.chatScreenTypingMany('An', 'Bình', 2), 'An, Bình và 2 người khác đang nhập…');
    expect(viL10n.tasksCreateSubmit, 'GIAO NHIỆM VỤ');
    expect(viL10n.notificationsLoadMore(20, 21), 'Tải thêm (20/21)');
    expect(viL10n.trainingMilitiaPickerShowing(3, 12), 'Hiển thị 3/12 — nhập thêm để thu hẹp kết quả');
    expect(viL10n.approvalsScreenTabPending(3), 'Chờ duyệt (3)');
    expect(viL10n.reportsTeamLoadMore(2, 3), 'Tải thêm (2/3)');
    expect(viL10n.filesErrorFileTooLarge, 'Tệp vượt quá dung lượng tối đa 10 MB.');
  });

  // The launcher shows android:label, which the resources cannot reach: it must match the app title
  test('UT-L10N-04: the Android launcher label is the app title', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    final label = RegExp(r'<application[^>]*android:label="([^"]*)"').firstMatch(manifest)?.group(1);
    expect(label, viL10n.appTitle);
  });

  test('UT-L10N-03: every message has a camelCase key, a text and a description', () {
    final arb = jsonDecode(File('lib/l10n/app_vi.arb').readAsStringSync()) as Map<String, dynamic>;
    expect(arb['@@locale'], 'vi');
    final keys = arb.keys.where((k) => !k.startsWith('@')).toList();
    expect(keys, isNotEmpty);
    final camelCase = RegExp(r'^[a-z][A-Za-z0-9]*$');
    for (final key in keys) {
      expect(camelCase.hasMatch(key), isTrue, reason: '$key is not camelCase');
      expect((arb[key] as String).trim(), isNotEmpty, reason: key);
      final meta = arb['@$key'];
      expect(meta, isA<Map>(), reason: '$key has no @$key metadata');
      expect(((meta as Map)['description'] as String?)?.trim() ?? '', isNotEmpty, reason: key);
    }
  });
}
