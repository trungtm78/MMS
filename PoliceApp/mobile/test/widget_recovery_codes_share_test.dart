// Widget Tests: recovery codes — share (share_plus) and copy
// Run: flutter test test/widget_recovery_codes_share_test.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:police_app/shared/services/share_service.dart';

import 'helpers/l10n.dart';

final _codes = List.generate(10, (i) => 'ABCDE-1234$i');

Future<void> _pump(WidgetTester tester, ShareText share) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [shareTextProvider.overrideWithValue(share)],
    child: localizedApp(RecoveryCodesScreen(codes: _codes)),
  ));
  await tester.pumpAndSettle();
}

Future<void> _tapText(WidgetTester tester, String text) async {
  await tester.ensureVisible(find.text(text));
  await tester.pumpAndSettle();
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-SHARE-01: sharing sends every code, one per line', (tester) async {
    final shared = <(String, String?)>[];
    Rect? shareOrigin;
    await _pump(tester, (text, {subject, origin}) async {
      shared.add((text, subject));
      shareOrigin = origin;
    });

    expect(find.text(viL10n.authRecoveryCodesSaveInstruction(10)), findsOneWidget);
    await _tapText(tester, viL10n.authRecoveryCodesShare);

    expect(shared, [(_codes.join('\n'), viL10n.authRecoveryCodesShareSubject)]);
    // iPad anchors the share sheet to the button
    expect(shareOrigin, isNotNull);
    expect(shareOrigin!.isEmpty, isFalse);
  });

  testWidgets('WT-SHARE-02: a failed share is reported and copy still works', (tester) async {
    await _pump(tester, (text, {subject, origin}) async => throw Exception('no share target'));

    await _tapText(tester, viL10n.authRecoveryCodesShare);

    expect(find.text(viL10n.authRecoveryCodesShareFailed), findsOneWidget);
    expect(find.text(viL10n.authRecoveryCodesCopyAll), findsOneWidget);
  });

  testWidgets('WT-SHARE-03: copy puts every code on the clipboard', (tester) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await _pump(tester, (text, {subject, origin}) async {});

    await _tapText(tester, viL10n.authRecoveryCodesCopyAll);

    expect(copied, [_codes.join('\n')]);
    expect(find.text(viL10n.authRecoveryCodesCopied), findsOneWidget);
  });

  testWidgets('WT-SHARE-04: codes shown outside sign-in close after acknowledging', (tester) async {
    await tester.pumpWidget(ProviderScope(
      child: localizedApp(Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => RecoveryCodesScreen(codes: _codes)),
            ),
            child: const Text('OPEN'),
          ),
        ),
      )),
    ));
    await tester.tap(find.text('OPEN'));
    await tester.pumpAndSettle();

    await _tapText(tester, viL10n.authRecoveryCodesSavedConfirm);
    await _tapText(tester, viL10n.authRecoveryCodesContinue);

    expect(find.byType(RecoveryCodesScreen), findsNothing);
  });
}
