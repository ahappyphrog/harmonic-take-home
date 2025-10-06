"""Background task management for long-running operations."""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskProgress(BaseModel):
    """Progress information for a task."""
    current: int
    total: int


class Task(BaseModel):
    """Background task tracking model."""
    id: uuid.UUID
    status: TaskStatus
    progress: Optional[TaskProgress] = None
    message: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TaskStore:
    """In-memory store for background tasks."""

    def __init__(self):
        self._tasks: dict[uuid.UUID, Task] = {}

    def create_task(self, total_items: int, message: str = "Processing...") -> Task:
        """Create a new task."""
        task_id = uuid.uuid4()
        now = datetime.utcnow()
        task = Task(
            id=task_id,
            status=TaskStatus.PENDING,
            progress=TaskProgress(current=0, total=total_items),
            message=message,
            created_at=now,
            updated_at=now,
        )
        self._tasks[task_id] = task
        return task

    def get_task(self, task_id: uuid.UUID) -> Optional[Task]:
        """Get a task by ID."""
        return self._tasks.get(task_id)

    def update_task(
        self,
        task_id: uuid.UUID,
        status: Optional[TaskStatus] = None,
        current: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[Task]:
        """Update a task's status and progress."""
        task = self._tasks.get(task_id)
        if not task:
            return None

        if status is not None:
            task.status = status
        if current is not None and task.progress:
            task.progress.current = current
        if message is not None:
            task.message = message
        if error is not None:
            task.error = error

        task.updated_at = datetime.utcnow()
        return task


# Global task store instance
task_store = TaskStore()
