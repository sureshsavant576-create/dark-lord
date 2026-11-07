"""BrandShield AI - Work Tracker Task Data Models.

Defines schemas for company work-tracking tasks with
status progression: TODO -> IN_PROGRESS -> REVIEW -> DONE.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"


class TaskPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class Task(BaseModel):
    """A single trackable work item for a company."""
    task_id: str = Field(description="Unique identifier for the task")
    brand_id: str = Field(description="The company/brand this task belongs to")
    title: str = Field(description="Short task title")
    description: str = Field(default="", description="Detailed description of the work")
    status: TaskStatus = Field(default=TaskStatus.TODO)
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    assignee: str = Field(default="", description="Person assigned to this task")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    due_date: Optional[str] = Field(default=None, description="Optional due date (ISO format)")


class TaskCreateRequest(BaseModel):
    """Payload for creating a new task."""
    brand_id: str
    title: str
    description: str = ""
    priority: str = "MEDIUM"
    assignee: str = ""
    due_date: Optional[str] = None


class TaskUpdateRequest(BaseModel):
    """Payload for updating a task (all fields optional)."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None
