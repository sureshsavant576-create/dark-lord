"""BrandShield AI - Work Tracker Service.

Manages CRUD operations for company work-tracking tasks
with persistent JSON storage per company.
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
import uuid

from backend.app.core.config import settings
from backend.app.models.task import Task, TaskCreateRequest, TaskStatus, TaskPriority, TaskUpdateRequest

logger = logging.getLogger(__name__)


class TaskService:
    """Manages company work-tracker tasks with local JSON persistence."""

    def __init__(self):
        self._tasks: Dict[str, Task] = {}
        self._loaded = False

    @property
    def _db_path(self) -> Path:
        return settings.DB_DIR / "tasks.json"

    def _ensure_loaded(self):
        if not self._loaded:
            self._load_from_disk()
            self._loaded = True

    def _load_from_disk(self):
        """Load all tasks from persistent JSON storage."""
        if self._db_path.exists():
            try:
                with open(self._db_path, "r") as f:
                    data = json.load(f)
                self._tasks = {
                    tid: Task(**tdata) for tid, tdata in data.items()
                }
                logger.info(f"Loaded {len(self._tasks)} tasks from disk.")
            except Exception as e:
                logger.warning(f"Could not load tasks from disk: {e}")
                self._tasks = {}
        else:
            self._tasks = {}

    def _save_to_disk(self):
        """Persist all tasks to JSON storage."""
        settings.init_directories()
        try:
            with open(self._db_path, "w") as f:
                json.dump(
                    {tid: t.model_dump() for tid, t in self._tasks.items()},
                    f, indent=2, default=str
                )
        except Exception as e:
            logger.error(f"Failed to save tasks to disk: {e}")

    def list_tasks(self, brand_id: Optional[str] = None) -> List[Task]:
        """List all tasks, optionally filtered by company brand_id."""
        self._ensure_loaded()
        tasks = list(self._tasks.values())
        if brand_id:
            tasks = [t for t in tasks if t.brand_id == brand_id]
        priority_order = {"URGENT": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        tasks.sort(key=lambda t: (priority_order.get(t.priority, 9), t.created_at))
        return tasks

    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a single task by ID."""
        self._ensure_loaded()
        return self._tasks.get(task_id)

    def create_task(self, request: TaskCreateRequest) -> Task:
        """Create a new task for a company."""
        self._ensure_loaded()
        task_id = f"TASK-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc).isoformat()
        task = Task(
            task_id=task_id,
            brand_id=request.brand_id,
            title=request.title,
            description=request.description,
            status=TaskStatus.TODO,
            priority=TaskPriority(request.priority) if request.priority in [e.value for e in TaskPriority] else TaskPriority.MEDIUM,
            assignee=request.assignee,
            created_at=now,
            updated_at=now,
            due_date=request.due_date,
        )
        self._tasks[task_id] = task
        self._save_to_disk()
        logger.info(f"Created task {task_id} for brand {request.brand_id}")
        return task

    def update_task(self, task_id: str, request: TaskUpdateRequest) -> Optional[Task]:
        """Update an existing task's fields."""
        self._ensure_loaded()
        task = self._tasks.get(task_id)
        if not task:
            return None

        if request.title is not None:
            task.title = request.title
        if request.description is not None:
            task.description = request.description
        if request.status is not None and request.status in [e.value for e in TaskStatus]:
            task.status = TaskStatus(request.status)
        if request.priority is not None and request.priority in [e.value for e in TaskPriority]:
            task.priority = TaskPriority(request.priority)
        if request.assignee is not None:
            task.assignee = request.assignee
        if request.due_date is not None:
            task.due_date = request.due_date

        task.updated_at = datetime.now(timezone.utc).isoformat()
        self._tasks[task_id] = task
        self._save_to_disk()
        logger.info(f"Updated task {task_id}")
        return task

    def delete_task(self, task_id: str) -> bool:
        """Delete a task by ID."""
        self._ensure_loaded()
        if task_id in self._tasks:
            del self._tasks[task_id]
            self._save_to_disk()
            logger.info(f"Deleted task {task_id}")
            return True
        return False

    def get_progress_stats(self, brand_id: str) -> dict:
        """Get progress statistics for a company's tasks."""
        self._ensure_loaded()
        tasks = [t for t in self._tasks.values() if t.brand_id == brand_id]
        total = len(tasks)
        if total == 0:
            return {"total": 0, "todo": 0, "in_progress": 0, "review": 0, "done": 0, "progress_pct": 0}

        counts = {
            "total": total,
            "todo": sum(1 for t in tasks if t.status == TaskStatus.TODO),
            "in_progress": sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS),
            "review": sum(1 for t in tasks if t.status == TaskStatus.REVIEW),
            "done": sum(1 for t in tasks if t.status == TaskStatus.DONE),
        }
        weight_map = {TaskStatus.TODO: 0, TaskStatus.IN_PROGRESS: 33, TaskStatus.REVIEW: 66, TaskStatus.DONE: 100}
        weighted_sum = sum(weight_map[t.status] for t in tasks)
        counts["progress_pct"] = round(weighted_sum / total)
        return counts


task_service = TaskService()
