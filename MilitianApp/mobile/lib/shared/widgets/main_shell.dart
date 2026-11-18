import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/router/routes.dart';
import '../../features/tasks/repositories/tasks_repository.dart';
import '../../l10n/l10n.dart';

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
    final l10n = context.l10n;
    // Same number as the waiting tab of the task list
    final pendingCount = ref.watch(waitingTaskCountProvider).valueOrNull ?? 0;

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
          BottomNavigationBarItem(
            icon: const Icon(Icons.home_outlined),
            activeIcon: const Icon(Icons.home),
            label: l10n.shellNavHome,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.location_on_outlined),
            activeIcon: const Icon(Icons.location_on),
            label: l10n.shellNavCheckin,
          ),
          BottomNavigationBarItem(
            icon: taskIcon(false),
            activeIcon: taskIcon(true),
            label: l10n.shellNavTasks,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.notifications_outlined),
            activeIcon: const Icon(Icons.notifications),
            label: l10n.shellNavNotifications,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.person_outline),
            activeIcon: const Icon(Icons.person),
            label: l10n.shellNavProfile,
          ),
        ],
      ),
    );
  }
}
