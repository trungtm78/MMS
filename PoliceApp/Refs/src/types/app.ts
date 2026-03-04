export type ScreenCA =
  | 'dashboard'
  | 'dqtv'
  | 'map'
  | 'tasks'
  | 'profile'
  | 'approvals'
  | 'reports'
  | 'alerts';

export type ScreenDQTV = 'dashboard' | 'tasks' | 'checkin' | 'report' | 'profile';

export type AppScreen = ScreenCA | ScreenDQTV;
