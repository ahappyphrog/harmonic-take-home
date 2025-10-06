"""API endpoints for task status polling."""
import uuid

from fastapi import APIRouter, HTTPException

from backend.models.tasks import Task, task_store

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
)


@router.get("/{task_id}", response_model=Task)
def get_task_status(task_id: uuid.UUID):
    """Get the status of a background task."""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
