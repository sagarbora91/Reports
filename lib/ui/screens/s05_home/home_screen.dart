import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../data/models/audit.dart';
import '../../../data/repositories/audit_repository.dart';
import '../../../providers/auth_provider.dart';
import '../../theme/app_colors.dart';

/// S5 Home / Dashboard — role-aware landing after login.
///
/// SM sees a big "Start Daily Audit" CTA and today's audit status.
/// GM/Owner see audit overview cards (deeper functionality lands in W3+).
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Audit? _todayAudit;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadTodayAudit();
  }

  Future<void> _loadTodayAudit() async {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final audit = await AuditRepository.instance.findByDate(
      date: today,
      auditType: 'daily',
    );
    if (!mounted) return;
    setState(() {
      _todayAudit = audit;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    if (user == null) {
      // Defensive — shouldn't happen post-login.
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => context.goNamed('s04_login'),
      );
      return const Scaffold(body: SizedBox.shrink());
    }

    final isSm = user.role == 'SM';
    final today = DateFormat('EEEE, d MMMM').format(DateTime.now());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Saagar Audit'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () {
              ref.read(authProvider.notifier).logout();
              context.goNamed('s04_login');
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadTodayAudit,
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                children: [
                  _greetingBlock(user.name, user.role),
                  const SizedBox(height: 8),
                  Text(
                    today,
                    style: const TextStyle(
                      color: AppColors.gray600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 24),
                  _todayCard(isSm),
                  const SizedBox(height: 12),
                  _navTiles(user.role),
                ],
              ),
            ),
    );
  }

  Widget _greetingBlock(String name, String role) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Hello, $name',
          style: const TextStyle(
            fontFamily: 'DMSerifDisplay',
            fontSize: 26,
            color: AppColors.navy,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _roleLabel(role),
          style: const TextStyle(
            fontFamily: 'DMSans',
            fontSize: 13,
            color: AppColors.gold,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }

  Widget _todayCard(bool isSm) {
    final audit = _todayAudit;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "Today's daily audit",
                  style: TextStyle(
                    fontFamily: 'DMSerifDisplay',
                    fontSize: 20,
                    color: AppColors.navy,
                  ),
                ),
                _statusChip(audit),
              ],
            ),
            const SizedBox(height: 16),
            if (audit == null) ...[
              const Text(
                "You haven't started today's audit yet.",
                style: TextStyle(color: AppColors.gray600),
              ),
              const SizedBox(height: 16),
              if (isSm)
                ElevatedButton.icon(
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Start daily audit'),
                  onPressed: () async {
                    await context.pushNamed('s06_start_audit');
                    if (!mounted) return;
                    await _loadTodayAudit();
                  },
                )
              else
                const Text(
                  'Daily audits are run by the Store Manager.',
                  style: TextStyle(color: AppColors.gray600),
                ),
            ] else if (audit.isDraft) ...[
              const Text(
                'A draft audit is in progress. Resume to continue marking checkpoints.',
                style: TextStyle(color: AppColors.gray600),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                icon: const Icon(Icons.edit_outlined),
                label: const Text('Resume draft'),
                onPressed: () => context.pushNamed('s07_checkpoint'),
              ),
            ] else ...[
              Text(
                'Submitted • ${audit.compliancePct?.toStringAsFixed(1) ?? "—"}% (${audit.band ?? "—"})',
                style: const TextStyle(color: AppColors.gray600),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _statusChip(Audit? audit) {
    if (audit == null) {
      return _chip('Not started', AppColors.gray200, AppColors.gray800);
    }
    if (audit.isDraft) {
      return _chip('In progress', AppColors.amberPale, AppColors.amber);
    }
    if (audit.isSubmitted) {
      return _chip('Submitted', AppColors.greenPale, AppColors.green);
    }
    return _chip(audit.status, AppColors.gray200, AppColors.gray800);
  }

  Widget _chip(String label, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _navTiles(String role) {
    return Column(
      children: [
        _navTile(
          icon: Icons.history_outlined,
          title: 'Audit history',
          subtitle: 'View past daily audits',
          enabled: false,
          onTap: () {},
        ),
        _navTile(
          icon: Icons.fact_check_outlined,
          title: 'CAPs',
          subtitle: 'Corrective Action Plans',
          enabled: false,
          onTap: () {},
        ),
        _navTile(
          icon: Icons.menu_book_outlined,
          title: 'Reference',
          subtitle: 'Rating scale, escalation triggers, glossary',
          enabled: false,
          onTap: () {},
        ),
        _navTile(
          icon: Icons.settings_outlined,
          title: 'Settings',
          subtitle: 'CROs, users, language, backup',
          enabled: false,
          onTap: () {},
        ),
      ],
    );
  }

  Widget _navTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Card(
        margin: const EdgeInsets.symmetric(vertical: 4),
        child: ListTile(
          leading: Icon(icon, color: AppColors.navy),
          title: Text(title),
          subtitle: Text(
            enabled ? subtitle : '$subtitle  ·  coming in week 3+',
            style: const TextStyle(fontSize: 12),
          ),
          trailing: enabled
              ? const Icon(Icons.chevron_right, color: AppColors.gray400)
              : null,
          onTap: enabled ? onTap : null,
        ),
      ),
    );
  }

  String _roleLabel(String role) {
    return switch (role) {
      'SM' => 'STORE MANAGER',
      'GM' => 'GENERAL MANAGER',
      'OWNER' => 'OWNER',
      _ => role.toUpperCase(),
    };
  }
}
