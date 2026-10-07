-- Link verified public source documents while preserving private uploads and RLS.
alter table public.cnc_exams alter column subject_path drop not null;
alter table public.cnc_exams
 add column subject_url text,
 add column correction_url text,
 add column source_url text,
 add column source_label text,
 add constraint cnc_subject_document check ((subject_path is not null) <> (subject_url is not null)),
 add constraint cnc_correction_document check (correction_path is null or correction_url is null),
 add constraint cnc_subject_external_url check (subject_url is null or subject_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view$'),
 add constraint cnc_correction_external_url check (correction_url is null or correction_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view$'),
 add constraint cnc_source_url check (source_url is null or source_url ~ '^https://laminehoucin[.]blogspot[.]com/2017/09/quelques-livres[.]html$'),
 add constraint cnc_source_label check (source_label is null or length(source_label) between 1 and 150);
-- No changes to catalogue grants, subscription access, storage or student state.
