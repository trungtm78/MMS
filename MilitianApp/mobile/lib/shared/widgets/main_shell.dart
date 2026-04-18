import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_strings.dart';
import '../../core/constants/api_constants.dart';
import '../../core/network/dio_client.dart';
import '../../core/router/routes.dart';
import '../../features/auth/providers/auth_provider.dart';

// Provider to count pending tasks for badge
final _pendingTaskCountProvider = FutureProvider.autoDispose<int>((ref) async {
  try {
    final storage = ref.read(secureStorageProvider);
    final dio = DioClient.getInstance(storage);
    final res = await dio.get(
      ApiConstants.tasks,
      queryParameters: {'status': 'pending', 'limit': 1},
    );
    return res.data['pagination']?['total'] as int? ?? 0;
  } catch (_) {
    return 0;
  }
});

class MainShell extends ConsumerWidget {
  final Widget child;

  const MainShell({super.key, required this.child});

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith(Routes.checkin)) return 1;
    if (location.startsWith(Routes.tasks)) return 2;
    if (location.startsWith(Routes.notifications)) return 3;
    if (location.startsWith(Routes.profile) ||
        location.startsWith(Routes.settings)) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final idx = _selectedIndex(context);
    final pendingAsync = ref.watch(_pendingTaskCountProvider);
    final pendingCount = pendingAsync.valueOrNull ?? 0;

    Widget taskIcon(bool active) {
      final icon = Icon(
        active ? Icons.assignment : Icons.assignment_outlined,
      );
      if (pendingCount <= 0) return icon;
      return Badge(
        label: Text(
          pendingCount > 99 ? '99+' : '$pendingCount',
          style: const TextStyle(fontSize: 10),
        ),
        backgroundColor: AppColors.error,
        child: icon,
      );
    }

    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: idx,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.navy,
        unselectedItemColor: AppColors.textSecondary,
        backgroundColor: Colors.white,
        elevation: 8,
        selectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 11,
        ),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        onTap: (i) {
          switch (i) {
            case 0: context.go(Routes.home); break;
            case 1: context.go(Routes.checkin); break;
            case 2: context.go(Routes.tasks); break;
            case 3: context.go(Routes.notifications); break;
            case 4: context.go(Routes.profile); break;
          }
        },
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.home_outlined),
            activeIcon: Icon(Icons.home),
            label: AppStrings.home,
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.location_on_outlined),
            activeIcon: Icon(Icons.location_on),
            label: AppStrings.checkin,
          ),
          BottomNavigationBarItem(
            icon: taskIcon(false),
            activeIcon: taskIcon(true),
            label: AppStrings.tasks,
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.notifications_outlined),
            activeIcon: Icon(Icons.notifications),
            label: AppStrings.notifications,
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.person_outline),
            activeIcon: Icon(Icons.person),
            label: AppStrings.profile,
          ),
        ],
      ),
    );
  }
}
