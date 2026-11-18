import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../l10n/l10n.dart';
import 'files_repository.dart';
import 'files_texts.dart';

/// A stored image (GET /files/:id) downloaded with the user's session through [fileBytesProvider]:
/// Image.network cannot send the Bearer token. Shows progress while loading and, when the download
/// fails, why, with a tap to download again.
class AuthenticatedImage extends ConsumerWidget {
  const AuthenticatedImage({
    super.key,
    required this.fileId,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.semanticLabel,
  });

  final String fileId;
  final double? width;
  final double? height;
  final BoxFit fit;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return SizedBox(
      width: width,
      height: height,
      child: ref.watch(fileBytesProvider(fileId)).when(
            data: (bytes) => Image.memory(
              bytes,
              width: width,
              height: height,
              fit: fit,
              semanticLabel: semanticLabel,
              gaplessPlayback: true,
              errorBuilder: unreadable,
            ),
            loading: () => Center(
              child: SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.navy,
                  semanticsLabel: l10n.filesImageLoading,
                ),
              ),
            ),
            error: (error, _) => Center(
              child: IconButton(
                tooltip: filesErrorText(l10n, error),
                icon: const Icon(Icons.broken_image_outlined, color: AppColors.textMuted),
                onPressed: () => ref.invalidate(fileBytesProvider(fileId)),
              ),
            ),
          ),
    );
  }

  /// Content that is not an image the device can decode (an Image errorBuilder)
  static Widget unreadable(BuildContext context, Object error, StackTrace? stackTrace) => Center(
        child: Tooltip(
          message: context.l10n.filesImageUnreadable,
          child: const Icon(Icons.hide_image_outlined, color: AppColors.textMuted),
        ),
      );
}
