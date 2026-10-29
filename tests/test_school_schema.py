import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "db/migrations/001_school_archive.sql"
SEED = ROOT / "db/seeds/synthetic_school.sql"
INSTITUTION = "00000000-0000-4000-8000-000000000001"


class SchoolSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(MIGRATION.read_text(encoding="utf-8"))
        self.db.executescript(SEED.read_text(encoding="utf-8"))

    def assert_rejected(self, sql, parameters=()):
        self.db.execute("SAVEPOINT invalid_write")
        try:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql, parameters)
        finally:
            self.db.execute("ROLLBACK TO invalid_write")
            self.db.execute("RELEASE invalid_write")

    def test_fresh_migration_and_seed_integrity(self):
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("""
            SELECT y.start_year, count(DISTINCT c.grade_level)
            FROM academic_year y JOIN class_section c ON c.academic_year_id = y.id
            GROUP BY y.start_year ORDER BY y.start_year
        """).fetchall(), [(2024, 8), (2025, 8)])

    def test_migration_without_seed(self):
        with sqlite3.connect(":memory:") as db:
            db.executescript(MIGRATION.read_text(encoding="utf-8"))
            self.assertEqual(db.execute("SELECT count(*) FROM institution").fetchone()[0], 0)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            with self.assertRaises(sqlite3.OperationalError):
                db.executescript(MIGRATION.read_text(encoding="utf-8"))
            db.rollback()
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)

    def test_people_and_documents_are_explicitly_synthetic(self):
        for table, name in (("institution", "name"), ("student", "display_name"),
                            ("staff", "display_name"), ("archive_document", "title")):
            with self.subTest(table=table):
                rows = self.db.execute(f"SELECT {name}, is_synthetic FROM {table}").fetchall()
                self.assertTrue(rows)
                self.assertTrue(all("SINTETIC" in label and flag == 1 for label, flag in rows))

    def test_promotion_preserves_previous_year(self):
        rows = self.db.execute("""
            SELECT s.id, y.start_year, e.grade_level, e.status
            FROM student s JOIN enrollment e ON e.student_id = s.id
            JOIN class_section c ON c.id = e.class_section_id
            JOIN academic_year y ON y.id = c.academic_year_id
            WHERE s.display_name = 'Elev SINTETIC 01' ORDER BY y.start_year
        """).fetchall()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][0], rows[1][0])
        self.assertEqual([row[1:] for row in rows],
                         [(2024, 1, "promoted"), (2025, 2, "active")])
        self.assertEqual(self.db.execute("""
            SELECT count(*) FROM enrollment WHERE status = 'promoted'
        """).fetchone()[0], 7)

    def test_sections_and_assignments_are_configurable(self):
        section = self.db.execute("""
            SELECT id FROM class_section WHERE section_name = 'Atelier'
        """).fetchone()[0]
        self.db.execute("""
            INSERT INTO staff_assignment
            SELECT 'new-assignment', institution_id, staff_id, ?, NULL, 'coordonare'
            FROM staff_assignment LIMIT 1
        """, (section,))
        self.db.execute("""
            UPDATE class_section SET section_name = 'Grupa flexibila' WHERE id = ?
        """, (section,))
        self.assertEqual(self.db.execute("""
            SELECT count(DISTINCT role) FROM staff_assignment WHERE class_section_id = ?
        """, (section,)).fetchone()[0], 2)
        self.assertEqual(self.db.execute("""
            SELECT count(DISTINCT subject_id) FROM staff_assignment
        """).fetchone()[0], 2)

    def test_invalid_levels_and_years(self):
        for level in (0, 9, -1, 1.5, "invalid", None):
            with self.subTest(level=level):
                self.assert_rejected("""
                    UPDATE class_section SET grade_level = ? WHERE section_name = 'Atelier'
                """, (level,))
        self.assert_rejected("UPDATE academic_year SET end_year = start_year")
        self.assert_rejected("UPDATE academic_year SET start_year = 2024.5")
        self.assert_rejected("UPDATE class_section SET section_name = '   '")
        self.assert_rejected("""
            INSERT INTO class_section SELECT 'duplicate', institution_id, academic_year_id,
                grade_level, section_name FROM class_section LIMIT 1
        """)

    def test_qualitative_results_and_numeric_results(self):
        for mark in ("FB", "B", "S", "I"):
            self.db.execute("""
                UPDATE grade_transcription SET qualitative_result = ?
                WHERE grade_level = 1
            """, (mark,))
        for mark in (1, 8, 9.5, 10):
            self.db.execute("""
                UPDATE grade_transcription SET numeric_result = ? WHERE grade_level = 5
            """, (mark,))
        for status in ("pending", "confirmed", "rejected"):
            self.db.execute("UPDATE grade_transcription SET review_status = ?", (status,))

    def test_invalid_marks_and_mixed_types(self):
        for mark in ("A", "", "fb", "10", None):
            with self.subTest(qualitative=mark):
                self.assert_rejected("""
                    UPDATE grade_transcription SET qualitative_result = ?
                    WHERE grade_level = 1
                """, (mark,))
        for mark in (0, 10.1, -1, "eight", float("inf"), None):
            with self.subTest(numeric=mark):
                self.assert_rejected("""
                    UPDATE grade_transcription SET numeric_result = ? WHERE grade_level = 5
                """, (mark,))
        for sql in (
            "UPDATE grade_transcription SET numeric_result = 8 WHERE grade_level = 1",
            "UPDATE grade_transcription SET qualitative_result = 'B' WHERE grade_level = 5",
            """UPDATE grade_transcription SET qualitative_result = NULL, numeric_result = 8
               WHERE grade_level = 1""",
            """UPDATE grade_transcription SET qualitative_result = 'FB', numeric_result = NULL
               WHERE grade_level = 5""",
            "UPDATE grade_transcription SET review_status = 'automatic'",
            "UPDATE grade_transcription SET review_status = NULL",
        ):
            with self.subTest(sql=sql):
                self.assert_rejected(sql)

    def test_transcriptions_require_matching_enrollment_and_source_page(self):
        for sql in (
            "UPDATE grade_transcription SET document_id = 'missing'",
            "UPDATE grade_transcription SET page_number = 99",
            "UPDATE grade_transcription SET page_number = 2 WHERE grade_level = 1",
            "UPDATE grade_transcription SET page_number = NULL",
            "UPDATE grade_transcription SET subject_id = 'missing'",
            "UPDATE grade_transcription SET enrollment_id = 'missing'",
            """UPDATE grade_transcription SET student_id =
               '30000000-0000-4000-8000-000000000002' WHERE grade_level = 1""",
            "UPDATE grade_transcription SET grade_level = 2 WHERE grade_level = 1",
            "UPDATE enrollment SET grade_level = 2 WHERE grade_level = 1",
            "UPDATE class_section SET grade_level = 2 WHERE grade_level = 1",
            "DELETE FROM document_student_page",
            "DELETE FROM document_page",
            "DELETE FROM enrollment",
            "DELETE FROM student",
        ):
            with self.subTest(sql=sql):
                self.assert_rejected(sql)

    def test_document_links_are_many_to_many_and_multiyear(self):
        self.assertEqual(self.db.execute("""
            SELECT count(*) FROM document_student WHERE document_id =
                '80000000-0000-4000-8000-000000000001'
        """).fetchone()[0], 2)
        self.assertEqual(self.db.execute("""
            SELECT count(*) FROM document_student WHERE student_id =
                '30000000-0000-4000-8000-000000000001'
        """).fetchone()[0], 2)
        self.assertEqual(self.db.execute("""
            SELECT count(*) FROM document_academic_year WHERE document_id =
                '80000000-0000-4000-8000-000000000002'
        """).fetchone()[0], 2)
        self.assert_rejected("UPDATE document_page SET page_number = 0")
        self.assert_rejected("""
            INSERT INTO document_student_page VALUES (
                '80000000-0000-4000-8000-000000000002',
                '30000000-0000-4000-8000-000000000001', ?, 1)
        """, (INSTITUTION,))
        self.assert_rejected("""
            INSERT INTO document_page SELECT * FROM document_page LIMIT 1
        """)

    def test_cross_institution_links_are_rejected(self):
        other = "00000000-0000-4000-8000-000000000002"
        self.db.execute("INSERT INTO institution VALUES (?, 'Alta scoala SINTETICA', 1)", (other,))
        self.db.execute("INSERT INTO student VALUES ('other-student', ?, 'Elev SINTETIC', 1)",
                        (other,))
        self.db.execute("INSERT INTO staff VALUES ('other-staff', ?, 'Cadru SINTETIC', 1)",
                        (other,))
        self.db.execute("INSERT INTO subject VALUES ('other-subject', ?, 'Subiect SINTETIC')",
                        (other,))
        self.db.execute("INSERT INTO academic_year VALUES ('other-year', ?, 2024, 2025)",
                        (other,))
        self.db.execute("""
            INSERT INTO class_section VALUES ('other-class', ?, 'other-year', 1, 'Liber')
        """, (other,))
        self.db.execute("""
            INSERT INTO archive_document VALUES (
                'other-document', ?, 'other', 'Document SINTETIC', NULL, 1)
        """, (other,))
        for sql in (
            "UPDATE class_section SET academic_year_id = 'other-year'",
            "UPDATE enrollment SET student_id = 'other-student'",
            "UPDATE enrollment SET class_section_id = 'other-class' WHERE grade_level = 1",
            "UPDATE staff_assignment SET staff_id = 'other-staff'",
            "UPDATE staff_assignment SET subject_id = 'other-subject'",
            "UPDATE staff_assignment SET class_section_id = 'other-class'",
            "UPDATE document_academic_year SET academic_year_id = 'other-year'",
            "UPDATE document_academic_year SET document_id = 'other-document'",
            "UPDATE document_page SET document_id = 'other-document'",
            "UPDATE document_student SET student_id = 'other-student'",
            "UPDATE document_student SET document_id = 'other-document'",
            "UPDATE grade_transcription SET subject_id = 'other-subject'",
        ):
            with self.subTest(sql=sql):
                self.assert_rejected(sql)

    def test_missing_references_are_rejected(self):
        for sql in (
            "UPDATE academic_year SET institution_id = 'missing'",
            "UPDATE class_section SET academic_year_id = 'missing'",
            "UPDATE enrollment SET student_id = 'missing'",
            "UPDATE enrollment SET class_section_id = 'missing'",
            "UPDATE staff_assignment SET staff_id = 'missing'",
            "UPDATE staff_assignment SET class_section_id = 'missing'",
            "UPDATE staff_assignment SET subject_id = 'missing'",
            "UPDATE archive_document SET institution_id = 'missing'",
            "UPDATE document_student SET student_id = 'missing'",
        ):
            with self.subTest(sql=sql):
                self.assert_rejected(sql)


if __name__ == "__main__":
    unittest.main()
