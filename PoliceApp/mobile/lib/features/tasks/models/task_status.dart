/// What a task's status allows (Web/backend/src/tasks/tasks.service.ts, task-sql.ts TASK_STATUSES).
library;

/// An assignee accepts a task not yet under way (ACCEPTABLE_STATUSES); anything else is
/// 409 task_not_acceptable
const acceptableTaskStatuses = {'pending', 'assigned', 'overdue'};

/// A task under way is completed through a report (POST /tasks/:id/report)
const reportableTaskStatus = 'in_progress';
