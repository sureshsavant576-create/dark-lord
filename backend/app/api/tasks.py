"""BrandShield AI - Work Tracker API Endpoints.

Provides CRUD endpoints for company work-tracking tasks
with Kanban-style status progression.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.models.task import Task, TaskCreateRequest, TaskUpdateRequest
from backend.app.services.task_service import task_service

router = APIRouter(prefix="/tasks", tags=["Work Tracker"])


@router.get("", response_model=List[Task])
def list_tasks(brand_id: Optional[str] = Query(default=None, description="Filter tasks by company brand ID")) -> List[Task]:
    """List all tasks, optionally filtered by company."""
    return task_service.list_tasks(brand_id=brand_id)


@router.get("/stats/{brand_id}")
def get_task_stats(brand_id: str):
    """Get progress statistics for a company's tasks."""
    return task_service.get_progress_stats(brand_id)


@router.get("/{task_id}", response_model=Task)
def get_task(task_id: str) -> Task:
    """Get a single task by ID."""
    task = task_service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task


@router.post("", response_model=Task)
def create_task(request: TaskCreateRequest) -> Task:
    """Create a new task for a company."""
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="Task title is required.")
    if not request.brand_id.strip():
        raise HTTPException(status_code=400, detail="Company brand_id is required.")
    return task_service.create_task(request)


@router.put("/{task_id}", response_model=Task)
def update_task(task_id: str, request: TaskUpdateRequest) -> Task:
    """Update an existing task."""
    task = task_service.update_task(task_id, request)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return task


@router.delete("/{task_id}")
def delete_task(task_id: str):
    """Delete a task."""
    success = task_service.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")
    return {"message": f"Task '{task_id}' deleted successfully."}
