-- Extend existing source allowlists without changing RLS or private uploads.
alter table public.cnc_exams
 drop constraint cnc_subject_external_url,
 drop constraint cnc_correction_external_url,
 drop constraint cnc_source_url;
alter table public.cnc_exams
 add constraint cnc_subject_external_url check (subject_url is null or subject_url ~ '^(https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view|https://www[.]iamateacher[.]org/_files/ugd/[A-Za-z0-9_]+[.]pdf)$'),
 add constraint cnc_correction_external_url check (correction_url is null or correction_url ~ '^(https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view|https://www[.]iamateacher[.]org/_files/ugd/[A-Za-z0-9_]+[.]pdf)$'),
 add constraint cnc_source_url check (source_url is null or source_url in ('https://laminehoucin.blogspot.com/2017/09/quelques-livres.html','https://www.iamateacher.org/cnc-concours-national-commun'));
