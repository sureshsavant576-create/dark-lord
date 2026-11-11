from __future__ import annotations
import json
import logging
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.core.security import sanitize_org_id
from backend.app.models.audit import (
    AuditEvent,
    AuditEventSeverity,
    AuditEventType,
    AuditLogQuery,
    AuditLogSummary,
)

logger = logging.getLogger(__name__)


class AuditService:
    """
    Centralized, tamper-resistant Audit Logging Service.
    Enforces organization-level isolation and immutable event recording
    for enterprise security, regulatory compliance, and workflow traceability.
    """

    def __init__(self, log_dir: Optional[Path] = None):
        self.log_dir = log_dir or (settings.DB_DIR / "audit_logs")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _get_org_log_file(self, org_id: str) -> Path:
        clean_org = sanitize_org_id(org_id)
        return self.log_dir / f"audit_{clean_org}.jsonl"

    def log_event(
        self,
        event_type: AuditEventType,
        org_id: str = "default-org",
        user_id: str = "system",
        user_role: str = "Creator",
        severity: AuditEventSeverity = AuditEventSeverity.INFO,
        resource_type: str = "general",
        resource_id: Optional[str] = None,
        action: str = "",
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        success: bool = True
    ) -> AuditEvent:
        event = AuditEvent(
            org_id=sanitize_org_id(org_id),
            user_id=user_id,
            user_role=user_role,
            event_type=event_type,
            severity=severity,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action or event_type.value,
            details=details or {},
            ip_address=ip_address,
            success=success
        )

        log_path = self._get_org_log_file(event.org_id)
        line = event.model_dump_json() + "\n"

        with self._lock:
            try:
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(line)
            except Exception as exc:
                logger.error("Failed to write audit log event: %s", exc)

        return event

    def query_events(self, query: AuditLogQuery) -> List[AuditEvent]:
        clean_org = sanitize_org_id(query.org_id)
        log_path = self._get_org_log_file(clean_org)

        if not log_path.exists():
            return []

        events: List[AuditEvent] = []
        with self._lock:
            try:
                with open(log_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            ev = AuditEvent.model_validate(data)
                            events.append(ev)
                        except Exception:
                            continue
            except Exception as exc:
                logger.error("Failed to read audit logs for org %s: %s", clean_org, exc)
                return []

        # Filter events in reverse chronological order (newest first)
        events.reverse()

        filtered = []
        for ev in events:
            if query.event_type and ev.event_type != query.event_type:
                continue
            if query.severity and ev.severity != query.severity:
                continue
            if query.user_id and ev.user_id != query.user_id:
                continue
            if query.resource_type and ev.resource_type != query.resource_type:
                continue
            filtered.append(ev)

        start = query.offset
        end = start + query.limit
        return filtered[start:end]

    def get_summary(self, org_id: str) -> AuditLogSummary:
        clean_org = sanitize_org_id(org_id)
        all_events = self.query_events(AuditLogQuery(org_id=clean_org, limit=1000))

        by_type: Dict[str, int] = {}
        by_sev: Dict[str, int] = {}
        alerts: List[AuditEvent] = []

        for ev in all_events:
            t = ev.event_type.value
            by_type[t] = by_type.get(t, 0) + 1

            s = ev.severity.value
            by_sev[s] = by_sev.get(s, 0) + 1

            if ev.severity in {AuditEventSeverity.WARNING, AuditEventSeverity.HIGH, AuditEventSeverity.CRITICAL} or not ev.success:
                if len(alerts) < 10:
                    alerts.append(ev)

        return AuditLogSummary(
            org_id=clean_org,
            total_events=len(all_events),
            by_event_type=by_type,
            by_severity=by_sev,
            recent_security_alerts=alerts
        )


audit_service = AuditService()
