import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

/// Opens the system share sheet. [origin] anchors the sheet on iPad (global coordinates).
typedef ShareText = Future<void> Function(String text, {String? subject, Rect? origin});

final shareTextProvider = Provider<ShareText>((ref) => _systemShare);

Future<void> _systemShare(String text, {String? subject, Rect? origin}) =>
    Share.share(text, subject: subject, sharePositionOrigin: origin);
