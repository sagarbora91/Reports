import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/models/audit.dart';
import '../data/models/checkpoint.dart';
import '../data/models/cro.dart';
import '../data/repositories/audit_repository.dart';
import '../data/repositories/checkpoint_repository.dart';
import '../domain/score_engine.dart' show Verdict;

export '../domain/score_engine.dart' show Verdict;

String verdictCode(Verdict v) => switch (v) {
      Verdict.pass => 'P',
      Verdict.fail => 'F',
      Verdict.na => 'NA',
    };

/// In-progress audit state. Persists every mark to SQLite so a crash mid-audit
/// loses nothing — Spec §2 offline-first acceptance: 24-hr offline works.
class DraftAuditState {
  const DraftAuditState({
    this.audit,
    this.checkpoints = const [],
    this.currentIndex = 0,
    this.results = const {},
    this.cros = const [],
  });

  /// Null if no draft is active.
  final Audit? audit;

  /// All 68 daily checkpoints in audit order, loaded once at draft start.
  final List<Checkpoint> checkpoints;

  /// Index into [checkpoints] — what the user is currently looking at.
  final int currentIndex;

  /// checkpoint_id → verdict. Sparse — only checkpoints already marked.
  final Map<String, Verdict> results;

  /// CROs on duty for this audit (selected on S6).
  final List<Cro> cros;

  bool get isActive => audit != null;
  bool get isComplete =>
      checkpoints.isNotEmpty && results.length == checkpoints.length;

  Checkpoint? get currentCheckpoint =>
      (currentIndex >= 0 && currentIndex < checkpoints.length)
          ? checkpoints[currentIndex]
          : null;

  int get passCount =>
      results.values.where((v) => v == Verdict.pass).length;
  int get failCount =>
      results.values.where((v) => v == Verdict.fail).length;
  int get naCount => results.values.where((v) => v == Verdict.na).length;

  DraftAuditState copyWith({
    Audit? audit,
    List<Checkpoint>? checkpoints,
    int? currentIndex,
    Map<String, Verdict>? results,
    List<Cro>? cros,
    bool clearAudit = false,
  }) {
    return DraftAuditState(
      audit: clearAudit ? null : (audit ?? this.audit),
      checkpoints: checkpoints ?? this.checkpoints,
      currentIndex: currentIndex ?? this.currentIndex,
      results: results ?? this.results,
      cros: cros ?? this.cros,
    );
  }
}

class DraftAuditNotifier extends StateNotifier<DraftAuditState> {
  DraftAuditNotifier() : super(const DraftAuditState());

  /// Start a brand-new daily audit. Loads the 68 checkpoints in time-block
  /// order and creates a draft row in SQLite.
  Future<void> startDaily({
    required String date,
    required String auditorId,
    required List<Cro> cros,
    String? supersedesAuditId,
  }) async {
    final audit = await AuditRepository.instance.createDraft(
      date: date,
      auditType: 'daily',
      auditorId: auditorId,
      supersedesAuditId: supersedesAuditId,
    );
    final checkpoints = await CheckpointRepository.instance
        .loadDailyCheckpointsInAuditOrder();
    state = DraftAuditState(
      audit: audit,
      checkpoints: checkpoints,
      currentIndex: 0,
      results: const {},
      cros: cros,
    );
  }

  /// Mark the current checkpoint. Persists to DB, advances index on PASS/NA
  /// (FAIL leaves the index so the UI can route to S8 then advance after the
  /// detail is captured).
  Future<void> mark(Verdict v, {String? findingText, String? croId}) async {
    final cp = state.currentCheckpoint;
    final audit = state.audit;
    if (cp == null || audit == null) return;

    await AuditRepository.instance.saveResult(
      auditId: audit.id,
      checkpointId: cp.id,
      result: verdictCode(v),
      weight: cp.weight,
      findingText: findingText,
      croId: croId,
    );

    final nextResults = Map<String, Verdict>.from(state.results)
      ..[cp.id] = v;

    state = state.copyWith(
      results: nextResults,
      currentIndex: v == Verdict.fail
          ? state.currentIndex // FAIL stays on S8; advance after detail saved
          : (state.currentIndex + 1).clamp(0, state.checkpoints.length),
    );
  }

  /// Called from S8 after the user finishes the FAIL detail screen. The
  /// result is already persisted with `result='F'`; this just updates the
  /// finding text + CRO and advances.
  Future<void> completeFailDetail({
    required String findingText,
    String? croId,
  }) async {
    final cp = state.currentCheckpoint;
    final audit = state.audit;
    if (cp == null || audit == null) return;

    await AuditRepository.instance.saveResult(
      auditId: audit.id,
      checkpointId: cp.id,
      result: 'F',
      weight: cp.weight,
      findingText: findingText,
      croId: croId,
    );

    state = state.copyWith(
      currentIndex:
          (state.currentIndex + 1).clamp(0, state.checkpoints.length),
    );
  }

  void goBack() {
    if (state.currentIndex > 0) {
      state = state.copyWith(currentIndex: state.currentIndex - 1);
    }
  }

  void jumpTo(int index) {
    if (index < 0 || index >= state.checkpoints.length) return;
    state = state.copyWith(currentIndex: index);
  }

  void clear() {
    state = const DraftAuditState();
  }
}

final draftAuditProvider =
    StateNotifierProvider<DraftAuditNotifier, DraftAuditState>(
  (ref) => DraftAuditNotifier(),
);
