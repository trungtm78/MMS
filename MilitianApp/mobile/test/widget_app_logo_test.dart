// Widget Tests: the app logo — the Dân quân tự vệ emblem shown on the sign-in screens
// Run: flutter test test/widget_app_logo_test.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/widgets/app_logo.dart';

import 'helpers/l10n.dart';

void main() {
  testWidgets('WT-LOGO-01: the emblem asset at the requested height, labelled for screen readers', (tester) async {
    await tester.pumpWidget(localizedApp(const Center(child: AppLogo(height: 64))));
    await tester.pumpAndSettle();

    final image = tester.widget<Image>(find.descendant(of: find.byType(AppLogo), matching: find.byType(Image)));
    expect(AppLogo.asset, 'assets/images/logo.png');
    expect((image.image as AssetImage).assetName, AppLogo.asset);
    expect(image.height, 64);
    expect(image.fit, BoxFit.contain);
    expect(image.semanticLabel, viL10n.appLogoLabel);
  });

  test('WT-LOGO-02: the emblem is bundled with the app', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final bytes = await rootBundle.load(AppLogo.asset);
    // PNG signature
    expect(bytes.lengthInBytes, greaterThan(1000));
    expect(bytes.buffer.asUint8List(0, 4), [0x89, 0x50, 0x4E, 0x47]);
  });
}
