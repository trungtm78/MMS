class Routes {
  Routes._();

  // ─── Common ──────────────────────────────────────────────────────────────────
  static const splash         = '/';
  static const login          = '/login';
  static const otp            = '/otp';
  static const mfaSetup       = '/mfa-setup';
  static const recoveryCodes  = '/recovery-codes';
  static const forgotPassword = '/forgot-password';

  // ─── CA Shell ────────────────────────────────────────────────────────────────
  static const caHome         = '/ca/home';
  static const caDqtvList     = '/ca/dqtv';
  static const caDqtvDetail   = '/ca/dqtv/:id';
  static const caMap          = '/ca/map';
  static const caTaskCreate   = '/ca/tasks/create';
  static const caApprovals    = '/ca/approvals';
  static const caReports      = '/ca/reports';
  static const caAlerts       = '/ca/alerts';
  static const caProfile      = '/ca/profile';
  static const caNotifications = '/ca/notifications';
  static const caEvaluate     = '/ca/evaluate/:userId';
  static const caChat         = '/ca/chat';
  static const caChatDetail   = '/ca/chat/:id';

  // ─── CA Feature routes ────────────────────────────────────────────────────────
  static const caCompliance       = '/ca/compliance';
  static const caTrainingMgmt     = '/ca/training';

  // ─── DQTV Shell ──────────────────────────────────────────────────────────────
  static const dqtvHome       = '/dqtv/home';
  static const dqtvTasks      = '/dqtv/tasks';
  static const dqtvTaskDetail = '/dqtv/tasks/:id';
  static const dqtvCheckIn    = '/dqtv/checkin';
  static const dqtvReport     = '/dqtv/report';
  static const dqtvProfile    = '/dqtv/profile';
  static const dqtvNotifications = '/dqtv/notifications';
}
