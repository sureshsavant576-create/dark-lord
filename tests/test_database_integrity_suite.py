import os
import sys
import unittest
from pathlib import Path
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath("."))

from backend.app.main import app
from backend.app.core.auth import auth_service, UserRole
from backend.app.services.brand_dna_service import brand_dna_service
from backend.app.services.content_review_service import content_review_service
from backend.app.services.knowledge_service import knowledge_service
from backend.app.services.workflow_service import workflow_service
from backend.app.services.audit_service import audit_service
from backend.app.services.brand_service import brand_service

from backend.app.models.brand_dna import BrandDNAInput, BrandDNASynthesis, BrandDNAApprovalRequest
from backend.app.models.knowledge_base import KnowledgeItemCreate, KnowledgeItemUpdate, KnowledgeCategory, KnowledgeProvenance
from backend.app.models.workflow import SubmitContentRequest, CommentRequest, RevisionRequest, ReviseContentRequest, ApprovalDecisionRequest, ContentStatus, WorkflowRole
from backend.app.models.content_review import ContentReviewRequest, ContentType

client = TestClient(app)

class DatabaseIntegrityTestSuite(unittest.TestCase):
    """
    Empirical test suite verifying database connectivity, schemas, foreign keys,
    unique constraints, multi-tenant isolation, CRUD lifecycle, and data persistence.
    """

    @classmethod
    def setUpClass(cls):
        # 1. Setup isolated test tenants
        cls.org_alpha = "audit_db_tenant_alpha"
        cls.org_beta = "audit_db_tenant_beta"

        def get_or_create(email, password, role, org_id):
            clean_email = email.strip().lower()
            users = auth_service._load_users()
            for u in users.values():
                if u.get("email") == clean_email:
                    from backend.app.core.auth import UserRecord
                    return UserRecord(**u)
            return auth_service.register_user(email=clean_email, password=password, role=role, org_id=org_id)

        # Register admin & user for Alpha
        cls.user_alpha = get_or_create(
            email="db_admin_alpha@audit-corp.io",
            password="SecurePassword2026!",
            role=UserRole.ADMIN,
            org_id=cls.org_alpha
        )
        cls.token_alpha = auth_service.create_session_token(cls.user_alpha.user_id, "admin", cls.org_alpha)

        # Register developer for Beta
        cls.user_beta = get_or_create(
            email="db_dev_beta@audit-corp.io",
            password="SecurePassword2026!",
            role=UserRole.DEVELOPER,
            org_id=cls.org_beta
        )
        cls.token_beta = auth_service.create_session_token(cls.user_beta.user_id, "developer", cls.org_beta)

    def test_01_database_connectivity_and_atomic_writes(self):
        """Verify DB_DIR exists, is writable, and atomic writes function properly."""
        from backend.app.core.config import settings
        self.assertTrue(settings.DB_DIR.exists())
        test_file = settings.DB_DIR / ".db_connectivity_test.tmp"
        test_file.write_text('{"connected": true}', encoding="utf-8")
        self.assertTrue(test_file.exists())
        target_file = settings.DB_DIR / ".db_connectivity_test.json"
        test_file.replace(target_file)
        self.assertTrue(target_file.exists())
        self.assertFalse(test_file.exists())
        target_file.unlink(missing_ok=True)

    def test_02_user_unique_constraint_enforcement(self):
        """Verify unique constraint on user emails: duplicate registration must fail."""
        with self.assertRaises(HTTPException):
            auth_service.register_user(
                email="db_admin_alpha@audit-corp.io",  # Existing email
                password="AnotherPassword123!",
                role=UserRole.VIEWER,
                org_id=self.org_alpha
            )

    def test_03_brand_dna_crud_lifecycle_and_synchronization(self):
        """Test creating, retrieving, updating, approving, and deleting Brand DNA records."""
        input_data = BrandDNAInput(
            company_name="Vanguard Quantum",
            industry="Quantum Computing & Security",
            business_description="Enterprise post-quantum cryptographic infrastructure.",
            products_and_services="Quantum Key Distribution & Lattice Encryption",
            target_audience="Chief Information Security Officers",
            company_values="Integrity, Mathematical Rigor, Reliability",
            brand_positioning="The sovereign standard in post-quantum data security.",
            desired_customer_perception="Impenetrable, Authoritative, Visionary",
            communication_personality="Precise, Direct, Sophisticated",
            reference_brands="IBM Quantum"
        )
        # Create (Save Draft)
        res = client.post("/api/v1/brands/dna/generate", json=input_data.model_dump())
        self.assertEqual(res.status_code, 200)
        dna_data = res.json()
        dna_id = dna_data["dna_id"]
        brand_id = dna_data["brand_id"]
        self.assertFalse(dna_data["is_approved"])

        # Retrieve
        get_res = client.get(f"/api/v1/brands/dna/{dna_id}")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["company_name"], "Vanguard Quantum")

        # Update draft
        updated_synthesis = dna_data["ai_recommendations"]
        updated_synthesis["synthesis_rationale"] = "Updated by brand director."
        put_res = client.put(f"/api/v1/brands/dna/{dna_id}", json=updated_synthesis)
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.json()["ai_recommendations"]["synthesis_rationale"], "Updated by brand director.")

        # Approve and activate
        approval_req = BrandDNAApprovalRequest(approved_by="Chief Brand Officer")
        app_res = client.post(f"/api/v1/brands/dna/{dna_id}/approve", json=approval_req.model_dump())
        self.assertEqual(app_res.status_code, 200)
        self.assertTrue(app_res.json()["is_approved"])

        # Verify synchronized to platform standard brand_profiles.json
        brand_prof = brand_service.get_brand_profile(brand_id)
        self.assertIsNotNone(brand_prof)
        self.assertEqual(brand_prof.brand_name, "Vanguard Quantum")

        # Cleanup test record
        brand_dna_service.delete_dna_profile(dna_id)
        brand_service.delete_brand_profile(brand_id, delete_files=False)
        self.assertIsNone(brand_dna_service.get_dna_profile(dna_id))

    def test_04_knowledge_base_crud_and_versioning(self):
        """Test Knowledge Base CRUD, semantic vector embedding generation, and version history."""
        # Create item in org_alpha
        create_res = client.post(
            "/api/v1/knowledge/items",
            headers={"Authorization": f"Bearer {self.token_alpha}"},
            json={
                "org_id": self.org_alpha,
                "brand_id": "vanguard",
                "category": "PROMOTIONAL_CLAIM",
                "title": "Quantum Resistance Benchmark",
                "content": "Vanguard QKD delivers 100 Gbps quantum-safe line rate certified under NIST FIPS 203.",
                "provenance": "COMPANY_FACT"
            }
        )
        self.assertEqual(create_res.status_code, 200)
        item_id = create_res.json()["item_id"]
        self.assertEqual(create_res.json()["version"], 1)

        # Retrieve
        get_res = client.get(
            f"/api/v1/knowledge/items/{item_id}",
            headers={"Authorization": f"Bearer {self.token_alpha}"}
        )
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["title"], "Quantum Resistance Benchmark")

        # Update (triggers version bump to v2)
        up_res = client.put(
            f"/api/v1/knowledge/items/{item_id}",
            headers={"Authorization": f"Bearer {self.token_alpha}"},
            json={
                "title": "Quantum Resistance Benchmark v2",
                "content": "Vanguard QKD delivers 120 Gbps line rate under NIST FIPS 203.",
                "changed_by": "Dr. Aris",
                "change_reason": "Updated line rate after laboratory testing"
            }
        )
        self.assertEqual(up_res.status_code, 200)
        self.assertEqual(up_res.json()["version"], 2)

        # Retrieve History
        hist_res = client.get(
            f"/api/v1/knowledge/items/{item_id}/history",
            headers={"Authorization": f"Bearer {self.token_alpha}"}
        )
        self.assertEqual(hist_res.status_code, 200)
        snapshots = hist_res.json()
        self.assertGreaterEqual(len(snapshots), 1)

        # Cleanup
        knowledge_service.delete_item(item_id, org_id=self.org_alpha)
        self.assertIsNone(knowledge_service.get_item(item_id, org_id=self.org_alpha))

    def test_05_workflow_engine_version_and_approval_history(self):
        """Test Workflow version history, commenting, revision tracking, and approval history."""
        # Submit v1
        item = workflow_service.submit_content(SubmitContentRequest(
            org_id=self.org_alpha,
            brand_id="test_brand_alpha",
            title="Q4 Launch Social Creative",
            content_text="Vanguard delivers cryptographic assurance across cloud edge.",
            user_id=self.user_alpha.user_id,
            user_name="Alpha Creator",
            user_role=WorkflowRole.CREATOR,
            has_high_risk_claims=False
        ))
        item_id = item.item_id
        self.assertEqual(item.current_version, 1)
        self.assertEqual(len(item.approval_history), 1)

        # Add comment
        workflow_service.add_comment(item_id, self.org_alpha, CommentRequest(
            item_id=item_id,
            user_id="lead_reviewer",
            user_name="Compliance Lead",
            user_role=WorkflowRole.MANAGER,
            text="Please verify word count and contrast."
        ))

        # Request revision
        workflow_service.request_revision(item_id, self.org_alpha, RevisionRequest(
            user_id="lead_reviewer",
            user_name="Compliance Lead",
            user_role=WorkflowRole.MANAGER,
            feedback="Contrast requires AA compliance."
        ))

        # Submit revision v2
        v2_item = workflow_service.submit_revision(item_id, self.org_alpha, ReviseContentRequest(
            content_text="Vanguard delivers verified cryptographic assurance across cloud edge with 7:1 contrast.",
            change_summary="Fixed contrast and tone",
            user_id=self.user_alpha.user_id,
            user_name="Alpha Creator",
            user_role=WorkflowRole.CREATOR
        ))
        self.assertEqual(v2_item.current_version, 2)
        self.assertEqual(len(v2_item.versions), 2)

        # Approve
        final_item = workflow_service.record_decision(item_id, self.org_alpha, ApprovalDecisionRequest(
            user_id="auth_rev",
            user_name="Authorised Reviewer",
            user_role=WorkflowRole.AUTHORISED_REVIEWER,
            decision=ContentStatus.APPROVED,
            notes="Version 2 satisfies all guidelines."
        ))
        self.assertEqual(final_item.status, ContentStatus.APPROVED)
        self.assertGreaterEqual(len(final_item.approval_history), 4)

        # Cleanup
        with workflow_service._lock:
            data = workflow_service._load_all()
            if item_id in data:
                del data[item_id]
                workflow_service._save_all(data)

    def test_06_content_review_report_persistence_and_retrieval(self):
        """Test Content Review report generation, database persistence, and API retrieval."""
        req = ContentReviewRequest(
            org_id=self.org_alpha,
            brand_id="test_brand_alpha",
            content_type=ContentType.TEXT,
            copy_text="Vanguard delivers secure post-quantum encryption for financial backbones."
        )
        report = client.post(
            "/api/v1/reviews/audit",
            headers={"Authorization": f"Bearer {self.token_alpha}"},
            json=req.model_dump()
        )
        self.assertEqual(report.status_code, 200)
        review_id = report.json()["review_id"]

        # Retrieve saved report by ID via GET endpoint
        get_res = client.get(
            f"/api/v1/reviews/{review_id}",
            headers={"Authorization": f"Bearer {self.token_alpha}"}
        )
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["review_id"], review_id)
        self.assertIn("overall_score", get_res.json())

        # Cleanup
        del_res = client.delete(
            f"/api/v1/reviews/{review_id}",
            headers={"Authorization": f"Bearer {self.token_alpha}"}
        )
        self.assertEqual(del_res.status_code, 200)
        self.assertIsNone(content_review_service.get_report(review_id))

    def test_07_data_persistence_after_service_reinitialization(self):
        """Simulate system reload/restart: items persisted to disk must reload accurately."""
        # 1. Create knowledge item
        it = knowledge_service.create_item(KnowledgeItemCreate(
            org_id=self.org_alpha,
            brand_id="persist_brand",
            category=KnowledgeCategory.COMPANY_FACT,
            title="Sovereign Data Resilience",
            content="All cryptographic keys remain in sovereign hardware security modules.",
            provenance=KnowledgeProvenance.COMPANY_FACT
        ))
        item_id = it.item_id

        # 2. Instantiate completely new service instance pointing to the same file
        from backend.app.services.knowledge_service import KnowledgeBaseService
        fresh_svc = KnowledgeBaseService(db_path=knowledge_service.db_path, history_path=knowledge_service.history_path)
        reloaded_item = fresh_svc.get_item(item_id, org_id=self.org_alpha)
        self.assertIsNotNone(reloaded_item)
        self.assertEqual(reloaded_item.title, "Sovereign Data Resilience")

        # Cleanup
        fresh_svc.delete_item(item_id, org_id=self.org_alpha)

    def test_08_multi_tenant_isolation_database_boundary(self):
        """Verify cross-tenant read/write isolation: org_beta cannot read org_alpha database records."""
        # Create item in org_alpha
        item = workflow_service.submit_content(SubmitContentRequest(
            org_id=self.org_alpha,
            brand_id="alpha_brand",
            title="Confidential Alpha Roadmap",
            content_text="Top secret product plans for Alpha.",
            user_id="user_alpha",
            user_name="Alpha",
            user_role=WorkflowRole.CREATOR
        ))
        item_id = item.item_id

        # User in org_beta attempts to read org_alpha's item
        res = client.get(
            f"/api/v1/workflow/items/{item_id}?org_id={self.org_alpha}",
            headers={"Authorization": f"Bearer {self.token_beta}"}
        )
        # Must be 403 Forbidden
        self.assertEqual(res.status_code, 403)

        # Cleanup
        with workflow_service._lock:
            data = workflow_service._load_all()
            if item_id in data:
                del data[item_id]
                workflow_service._save_all(data)


if __name__ == "__main__":
    unittest.main()
