PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TABLE institution (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1))
) STRICT;

CREATE TABLE academic_year (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL REFERENCES institution(id),
    start_year INTEGER NOT NULL CHECK (start_year BETWEEN 1900 AND 9998),
    end_year INTEGER NOT NULL CHECK (end_year = start_year + 1),
    UNIQUE (institution_id, start_year),
    UNIQUE (id, institution_id)
) STRICT;

CREATE TABLE class_section (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 8),
    section_name TEXT NOT NULL CHECK (length(trim(section_name)) > 0),
    FOREIGN KEY (academic_year_id, institution_id)
        REFERENCES academic_year(id, institution_id),
    UNIQUE (academic_year_id, grade_level, section_name),
    UNIQUE (id, institution_id),
    UNIQUE (id, institution_id, grade_level)
) STRICT;

CREATE TABLE student (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL REFERENCES institution(id),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
    UNIQUE (id, institution_id)
) STRICT;

CREATE TABLE enrollment (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    class_section_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'promoted', 'transferred', 'completed')),
    FOREIGN KEY (student_id, institution_id) REFERENCES student(id, institution_id),
    FOREIGN KEY (class_section_id, institution_id, grade_level)
        REFERENCES class_section(id, institution_id, grade_level),
    UNIQUE (student_id, class_section_id),
    UNIQUE (id, student_id, institution_id, grade_level)
) STRICT;

CREATE TABLE staff (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL REFERENCES institution(id),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
    UNIQUE (id, institution_id)
) STRICT;

CREATE TABLE subject (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL REFERENCES institution(id),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    UNIQUE (institution_id, name),
    UNIQUE (id, institution_id)
) STRICT;

CREATE TABLE staff_assignment (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    class_section_id TEXT NOT NULL,
    subject_id TEXT,
    role TEXT NOT NULL CHECK (length(trim(role)) > 0),
    FOREIGN KEY (staff_id, institution_id) REFERENCES staff(id, institution_id),
    FOREIGN KEY (class_section_id, institution_id) REFERENCES class_section(id, institution_id),
    FOREIGN KEY (subject_id, institution_id) REFERENCES subject(id, institution_id)
) STRICT;

CREATE TABLE archive_document (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL REFERENCES institution(id),
    document_type TEXT NOT NULL CHECK (
        document_type IN ('catalog', 'matriculation_register', 'enrollment_file', 'other')
    ),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    physical_location TEXT,
    is_synthetic INTEGER NOT NULL DEFAULT 0 CHECK (is_synthetic IN (0, 1)),
    UNIQUE (id, institution_id)
) STRICT;

CREATE TABLE document_academic_year (
    document_id TEXT NOT NULL,
    academic_year_id TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    PRIMARY KEY (document_id, academic_year_id),
    FOREIGN KEY (document_id, institution_id) REFERENCES archive_document(id, institution_id),
    FOREIGN KEY (academic_year_id, institution_id) REFERENCES academic_year(id, institution_id)
) STRICT;

CREATE TABLE document_page (
    document_id TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    PRIMARY KEY (document_id, page_number),
    FOREIGN KEY (document_id, institution_id) REFERENCES archive_document(id, institution_id),
    UNIQUE (document_id, page_number, institution_id)
) STRICT;

CREATE TABLE document_student (
    document_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    PRIMARY KEY (document_id, student_id),
    FOREIGN KEY (document_id, institution_id) REFERENCES archive_document(id, institution_id),
    FOREIGN KEY (student_id, institution_id) REFERENCES student(id, institution_id),
    UNIQUE (document_id, student_id, institution_id)
) STRICT;

CREATE TABLE document_student_page (
    document_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    PRIMARY KEY (document_id, student_id, page_number),
    FOREIGN KEY (document_id, student_id, institution_id)
        REFERENCES document_student(document_id, student_id, institution_id),
    FOREIGN KEY (document_id, page_number, institution_id)
        REFERENCES document_page(document_id, page_number, institution_id),
    UNIQUE (document_id, student_id, page_number, institution_id)
) STRICT;

CREATE TABLE grade_transcription (
    id TEXT PRIMARY KEY NOT NULL,
    institution_id TEXT NOT NULL,
    enrollment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    subject_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'confirmed', 'rejected')),
    qualitative_result TEXT,
    numeric_result REAL,
    FOREIGN KEY (enrollment_id, student_id, institution_id, grade_level)
        REFERENCES enrollment(id, student_id, institution_id, grade_level),
    FOREIGN KEY (subject_id, institution_id) REFERENCES subject(id, institution_id),
    FOREIGN KEY (document_id, student_id, page_number, institution_id)
        REFERENCES document_student_page(document_id, student_id, page_number, institution_id),
    CHECK (
        (grade_level BETWEEN 1 AND 4
            AND qualitative_result IS NOT NULL
            AND qualitative_result IN ('FB', 'B', 'S', 'I')
            AND numeric_result IS NULL)
        OR
        (grade_level BETWEEN 5 AND 8
            AND qualitative_result IS NULL
            AND numeric_result IS NOT NULL
            AND numeric_result BETWEEN 1 AND 10)
    )
) STRICT;

PRAGMA user_version = 1;
COMMIT;
