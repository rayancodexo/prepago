-- Allow verified public PDFs from cpgemaroc.com (énoncés and corrigés) and rtc.ma.
alter table public.cnc_exams
 drop constraint cnc_subject_external_url,
 drop constraint cnc_correction_external_url,
 drop constraint cnc_source_url;
alter table public.cnc_exams
 add constraint cnc_subject_external_url check(subject_url is null or subject_url ~ '^(https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view|https://www[.]iamateacher[.]org/_files/ugd/[A-Za-z0-9_]+[.]pdf|https://cpge-paradise[.]com/Concours[0-9]{4}/CNC/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.]pdf|https://www[.]cpgemaroc[.]com/cnc/[a-z0-9]+/(e|c|c2)_[a-z0-9]+[.]pdf|https://rtc[.]ma/pdfs/(MP|PSI|TSI)/cnc/[a-z]+/[A-Za-z0-9%_-]+[.]pdf)$'),
 add constraint cnc_correction_external_url check(correction_url is null or correction_url ~ '^(https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]+/view|https://www[.]iamateacher[.]org/_files/ugd/[A-Za-z0-9_]+[.]pdf|https://cpge-paradise[.]com/Concours[0-9]{4}/CNC/([A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+[.]pdf|https://www[.]cpgemaroc[.]com/cnc/[a-z0-9]+/(e|c|c2)_[a-z0-9]+[.]pdf|https://rtc[.]ma/pdfs/(MP|PSI|TSI)/cnc/[a-z]+/[A-Za-z0-9%_-]+[.]pdf)$'),
 add constraint cnc_source_url check(source_url is null or source_url in ('https://laminehoucin.blogspot.com/2017/09/quelques-livres.html','https://www.iamateacher.org/cnc-concours-national-commun','https://www.cpgemaroc.com/','https://rtc.ma/') or source_url ~ '^https://cpge-paradise[.]com/SujetsCNC(2023|2026)[.]php$');
