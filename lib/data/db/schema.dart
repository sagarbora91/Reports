/// SQLite schema for the Saagar Audit App.
///
/// 14 tables, mapped 1:1 from Spec §4. Field names, types, and constraints
/// must stay in sync with the spec — any drift breaks the Firestore mirror.
///
/// Notes on departures from a strict reading of the spec:
///   * `audits.cash_variance_rupees` is added: implied by Spec §6.7 (CW.7
///     cumulative cash variance) but missing from the §4.6 column list.
///     Recorded by S7 at checkpoint 6.5; nullable for non-cash audits.
///   * `audit_log.id` uses INTEGER PRIMARY KEY AUTOINCREMENT per Spec §4.14.
///     Every other PK is TEXT (UUID) so cross-device sync stays deterministic.
class Schema {
  static const int currentVersion = 1;

  /// All CREATE statements, executed in order on first install or upgrade.
  /// Order matters because of foreign key dependencies — `users` and `sops`
  /// must exist before anything that references them.
  static const List<String> createStatements = [
    _enableForeignKeys,
    _users,
    _devices,
    _sops,
    _checkpoints,
    _cros,
    _audits,
    _auditResults,
    _photos,
    _caps,
    _capActions,
    _capLog,
    _reports,
    _escalations,
    _auditLog,
    // Indexes
    _idxAuditsAuditDate,
    _idxAuditResultsAuditId,
    _idxCheckpointsSop,
    _idxPhotosResult,
    _idxPhotosCap,
    _idxPhotosUploadStatus,
    _idxCapsStatus,
    _idxCapsDeadline,
    _idxCapLogCap,
    _idxEscalationsStatus,
    _idxAuditLogTableRow,
  ];

  // SQLite foreign-key enforcement is off by default; turn it on per connection.
  static const _enableForeignKeys = 'PRAGMA foreign_keys = ON;';

  // §4.1 users
  static const _users = '''
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 50),
  role            TEXT NOT NULL CHECK (role IN ('SM','GM','OWNER')),
  pin_hash        TEXT NOT NULL,
  language_pref   TEXT NOT NULL DEFAULT 'en' CHECK (language_pref IN ('en','mr')),
  phone           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL,
  last_login_at   TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL
);
''';

  // §4.2 devices
  static const _devices = '''
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  model         TEXT,
  os_version    TEXT,
  app_version   TEXT,
  last_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_seen_at  TEXT,
  sync_state    TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced','syncing','failed')),
  last_sync_at  TEXT
);
''';

  // §4.3 sops
  static const _sops = '''
CREATE TABLE sops (
  id            TEXT PRIMARY KEY,
  number        INTEGER NOT NULL UNIQUE CHECK (number BETWEEN 1 AND 8),
  name_en       TEXT NOT NULL,
  name_mr       TEXT NOT NULL,
  weight        INTEGER NOT NULL CHECK (weight IN (1,2)),
  is_critical   INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0,1)),
  display_order INTEGER NOT NULL
);
''';

  // §4.4 checkpoints (68 daily + 36 weekly + monthly in P3)
  static const _checkpoints = '''
CREATE TABLE checkpoints (
  id                       TEXT PRIMARY KEY,
  sop_id                   TEXT NOT NULL REFERENCES sops(id) ON DELETE RESTRICT,
  frequency                TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  sequence                 INTEGER NOT NULL,
  text_en                  TEXT NOT NULL,
  text_mr                  TEXT NOT NULL,
  evidence_en              TEXT,
  evidence_mr              TEXT,
  weight                   INTEGER NOT NULL CHECK (weight IN (1,2)),
  allows_na                INTEGER NOT NULL DEFAULT 1 CHECK (allows_na IN (0,1)),
  requires_photo_on_fail   INTEGER NOT NULL DEFAULT 0 CHECK (requires_photo_on_fail IN (0,1)),
  display_order            INTEGER NOT NULL
);
''';

  // §4.5 cros
  static const _cros = '''
CREATE TABLE cros (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  counter     TEXT NOT NULL CHECK (counter IN ('Titan','Helios')),
  shift       TEXT NOT NULL CHECK (shift IN ('morning','afternoon','flexible')),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  joined_at   TEXT NOT NULL
);
''';

  // §4.6 audits — note added `cash_variance_rupees` field (see class doc).
  static const _audits = '''
CREATE TABLE audits (
  id                    TEXT PRIMARY KEY,
  audit_type            TEXT NOT NULL CHECK (audit_type IN ('daily','weekly','monthly')),
  audit_date            TEXT NOT NULL,
  week_number           INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  month_number          INTEGER CHECK (month_number BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL,
  auditor_id            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id             TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','verified','hidden')),
  raw_score             REAL,
  max_score             REAL,
  compliance_pct        REAL,
  band                  TEXT CHECK (band IN ('excellent','good','fair','poor','critical')),
  fail_count            INTEGER NOT NULL DEFAULT 0,
  pass_count            INTEGER NOT NULL DEFAULT 0,
  na_count              INTEGER NOT NULL DEFAULT 0,
  cash_variance_rupees  REAL,
  draft_started_at      TEXT,
  submitted_at          TEXT,
  verified_at           TEXT,
  verifier_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  supersedes_audit_id   TEXT REFERENCES audits(id) ON DELETE SET NULL,
  hidden_at             TEXT,
  hidden_by             TEXT REFERENCES users(id) ON DELETE SET NULL,
  hidden_reason         TEXT,
  notes                 TEXT
);
''';

  // §4.7 audit_results
  static const _auditResults = '''
CREATE TABLE audit_results (
  id                TEXT PRIMARY KEY,
  audit_id          TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  checkpoint_id     TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE RESTRICT,
  result            TEXT NOT NULL CHECK (result IN ('P','F','NA')),
  weighted_points   REAL,
  finding_text      TEXT,
  cro_id            TEXT REFERENCES cros(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  UNIQUE (audit_id, checkpoint_id)
);
''';

  // §4.8 photos
  static const _photos = '''
CREATE TABLE photos (
  id                TEXT PRIMARY KEY,
  audit_result_id   TEXT REFERENCES audit_results(id) ON DELETE CASCADE,
  cap_id            TEXT REFERENCES caps(id) ON DELETE CASCADE,
  context           TEXT NOT NULL CHECK (context IN ('fail_evidence','cap_progress','cap_verification')),
  local_path        TEXT NOT NULL,
  cloud_url         TEXT,
  thumb_local_path  TEXT,
  upload_status     TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending','uploading','uploaded','failed')),
  captured_at       TEXT NOT NULL,
  captured_lat      REAL,
  captured_lng      REAL,
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_size_bytes   INTEGER,
  CHECK (
    (audit_result_id IS NOT NULL AND cap_id IS NULL)
    OR (audit_result_id IS NULL AND cap_id IS NOT NULL)
  )
);
''';

  // §4.9 caps
  static const _caps = '''
CREATE TABLE caps (
  id                       TEXT PRIMARY KEY,
  origin_audit_id          TEXT NOT NULL REFERENCES audits(id) ON DELETE RESTRICT,
  origin_result_id         TEXT REFERENCES audit_results(id) ON DELETE SET NULL,
  origin_checkpoint_id     TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE RESTRICT,
  is_pattern               INTEGER NOT NULL DEFAULT 0 CHECK (is_pattern IN (0,1)),
  problem_statement        TEXT NOT NULL,
  why_1                    TEXT NOT NULL,
  why_2                    TEXT,
  why_3                    TEXT,
  why_4                    TEXT,
  why_5                    TEXT,
  root_cause               TEXT NOT NULL,
  responsible_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deadline                 TEXT NOT NULL,
  verification_method      TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','verified','closed','aged','reopened')),
  opened_at                TEXT NOT NULL,
  done_at                  TEXT,
  verified_at              TEXT,
  closed_at                TEXT,
  verified_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_by                TEXT REFERENCES users(id) ON DELETE SET NULL,
  aged_count               INTEGER NOT NULL DEFAULT 0,
  extension_count          INTEGER NOT NULL DEFAULT 0,
  latest_extension_reason  TEXT
);
''';

  // §4.10 cap_actions
  static const _capActions = '''
CREATE TABLE cap_actions (
  id           TEXT PRIMARY KEY,
  cap_id       TEXT NOT NULL REFERENCES caps(id) ON DELETE CASCADE,
  sequence     INTEGER NOT NULL,
  action_text  TEXT NOT NULL,
  is_done      INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  done_at      TEXT,
  done_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  done_notes   TEXT,
  UNIQUE (cap_id, sequence)
);
''';

  // §4.11 cap_log
  static const _capLog = '''
CREATE TABLE cap_log (
  id              TEXT PRIMARY KEY,
  cap_id          TEXT NOT NULL REFERENCES caps(id) ON DELETE CASCADE,
  event           TEXT NOT NULL CHECK (event IN ('created','action_done','marked_done','verified','closed','extended','aged','reopened')),
  from_status     TEXT,
  to_status       TEXT,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
  timestamp       TEXT NOT NULL,
  note            TEXT
);
''';

  // §4.12 reports
  static const _reports = '''
CREATE TABLE reports (
  id                         TEXT PRIMARY KEY,
  audit_id                   TEXT NOT NULL REFERENCES audits(id) ON DELETE RESTRICT,
  report_type                TEXT NOT NULL CHECK (report_type IN ('weekly','monthly')),
  headline                   TEXT,
  compliance_table_json      TEXT,
  trend_block_json           TEXT,
  findings_json              TEXT,
  patterns_json              TEXT,
  caps_opened_json           TEXT,
  caps_closed_json           TEXT,
  caps_aged_json             TEXT,
  escalations_json           TEXT,
  author_user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at               TEXT,
  read_by_owner_at           TEXT,
  pdf_local_path             TEXT,
  pdf_cloud_url              TEXT
);
''';

  // §4.13 escalations
  static const _escalations = '''
CREATE TABLE escalations (
  id                    TEXT PRIMARY KEY,
  trigger_number        INTEGER NOT NULL CHECK (trigger_number BETWEEN 0 AND 7),
  trigger_label         TEXT NOT NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN ('audit','cap','trend','manual')),
  source_audit_id       TEXT REFERENCES audits(id) ON DELETE SET NULL,
  source_cap_id         TEXT REFERENCES caps(id) ON DELETE SET NULL,
  raised_by_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  raised_to_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  urgency               TEXT NOT NULL CHECK (urgency IN ('immediate','same_day','same_night','next_audit')),
  what_happened         TEXT NOT NULL,
  evidence              TEXT,
  impact                TEXT,
  requested_action      TEXT,
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  raised_at             TEXT NOT NULL,
  acknowledged_at       TEXT,
  resolved_at           TEXT,
  resolution_notes      TEXT,
  whatsapp_sent         INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_sent IN (0,1))
);
''';

  // §4.14 audit_log (system-level write log)
  static const _auditLog = '''
CREATE TABLE audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  row_id          TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('insert','update','delete_attempt')),
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
  timestamp       TEXT NOT NULL,
  before_json     TEXT,
  after_json      TEXT,
  sync_state      TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending','synced','failed'))
);
''';

  // Indexes — hot paths only. Add more as query plans surface.
  static const _idxAuditsAuditDate =
      'CREATE INDEX idx_audits_audit_date ON audits(audit_date, audit_type);';
  static const _idxAuditResultsAuditId =
      'CREATE INDEX idx_audit_results_audit_id ON audit_results(audit_id);';
  static const _idxCheckpointsSop =
      'CREATE INDEX idx_checkpoints_sop ON checkpoints(sop_id, frequency, display_order);';
  static const _idxPhotosResult =
      'CREATE INDEX idx_photos_result ON photos(audit_result_id);';
  static const _idxPhotosCap =
      'CREATE INDEX idx_photos_cap ON photos(cap_id);';
  static const _idxPhotosUploadStatus =
      'CREATE INDEX idx_photos_upload_status ON photos(upload_status);';
  static const _idxCapsStatus =
      'CREATE INDEX idx_caps_status ON caps(status, deadline);';
  static const _idxCapsDeadline =
      'CREATE INDEX idx_caps_deadline ON caps(deadline) WHERE status IN ("open","aged");';
  static const _idxCapLogCap =
      'CREATE INDEX idx_cap_log_cap ON cap_log(cap_id, timestamp);';
  static const _idxEscalationsStatus =
      'CREATE INDEX idx_escalations_status ON escalations(status, raised_at);';
  static const _idxAuditLogTableRow =
      'CREATE INDEX idx_audit_log_table_row ON audit_log(table_name, row_id, timestamp);';

  Schema._();
}
