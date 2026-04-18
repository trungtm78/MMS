export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MilitiaProfile {
  id: string;
  userId: string | null;
  militiaCode: string;
  fullName: string;
  cccd: string;
  dob: Date;
  gender: string | null;
  phone: string | null;
  address: string | null;
  unitId: string;
  unitName: string;
  position: string | null;
  rank: string | null;
  joinDate: Date;
  status: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
}

export type TaskType = 'patrol' | 'guard' | 'inspection' | 'support' | 'training' | 'admin' | 'other';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
export type AssignmentStatus = 'assigned' | 'accepted' | 'rejected' | 'in_progress' | 'completed';

export interface TaskAssignment {
  id: string;
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  assignedBy: string;
  assignedByName: string;
  status: AssignmentStatus;
  assignedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  progress: number;
}

export interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date | null;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  unitId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  completedBy: string | null;
  assignments: TaskAssignment[];
}

export interface AttendanceRecord {
  id: string;
  militiaId: string;
  taskId: string | null;
  workDate: Date;
  checkinAt: Date | null;
  checkinLat: number | null;
  checkinLng: number | null;
  checkinAccuracy: number | null;
  checkinLocationName: string | null;
  checkoutAt: Date | null;
  checkoutLat: number | null;
  checkoutLng: number | null;
  checkoutAccuracy: number | null;
  checkoutLocationName: string | null;
  source: string;
  status: string;
  workHours: number | null;
  note: string | null;
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  workHours: number;
  onTimeRate: number;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  code: string;
  requesterId: string;
  requesterName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  fromDate: Date;
  toDate: Date;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string;
  replacementId: string | null;
  replacementName: string | null;
  status: LeaveStatus;
  totalDays: number;
  createdAt: Date;
  approvals: LeaveApproval[];
}

export interface LeaveApproval {
  id: string;
  leaveRequestId: string;
  approverId: string;
  approverName: string;
  action: 'approved' | 'rejected';
  reason: string | null;
  actedAt: Date;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxDaysPerYear: number | null;
  requiresDocument: boolean;
  isPaid: boolean;
}

export type IncidentType = 'sos' | 'security' | 'fire' | 'medical' | 'accident' | 'utility' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'urgent';
export type IncidentStatus = 'open' | 'acknowledged' | 'responding' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  code: string;
  reporterId: string;
  reporterName: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  title: string;
  message: string;
  lat: number | null;
  lng: number | null;
  locationName: string | null;
  status: IncidentStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KPIScore {
  id: string;
  periodId: string;
  periodYear: number;
  periodMonth: number;
  militiaId: string;
  attendanceScore: number;
  taskScore: number;
  disciplineScore: number;
  attitudeScore: number;
  supervisorScore: number;
  totalScore: number;
  rank: number | null;
  rankInUnit: number | null;
  comments: string | null;
}

export type NotificationType = 'task' | 'attendance' | 'leave' | 'incident' | 'kpi' | 'system' | 'message';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  senderId: string | null;
  senderName: string | null;
  readAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore?: boolean;
  };
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
