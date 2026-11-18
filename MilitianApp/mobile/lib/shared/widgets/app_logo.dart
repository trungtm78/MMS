import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';

/// The Dân quân tự vệ emblem: the app's logo on the sign-in screens.
/// The launcher icons are generated from the same image (pubspec flutter_launcher_icons).
class AppLogo extends StatelessWidget {
  static const asset = 'assets/images/logo.png';

  final double height;

  const AppLogo({super.key, required this.height});

  @override
  Widget build(BuildContext context) => Image.asset(
        asset,
        height: height,
        fit: BoxFit.contain,
        semanticLabel: context.l10n.appLogoLabel,
      );
}
