// Public source links and private uploads share one viewer without copying files.
(function(root){
 function externalUrl(value){return typeof value==='string'&&(/^(?:https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view|https:\/\/www\.iamateacher\.org\/_files\/ugd\/[A-Za-z0-9_]+\.pdf|https:\/\/cpge-paradise\.com\/Concours[0-9]{4}\/CNC\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.pdf|https:\/\/www\.cpgemaroc\.com\/cnc\/[a-z0-9]+\/(?:e|c|c2)_[a-z0-9]+\.pdf|https:\/\/rtc\.ma\/pdfs\/(?:MP|PSI|TSI)\/cnc\/[a-z]+\/[A-Za-z0-9%_-]+\.pdf)$/.test(value))?value:null}
 function previewUrl(value){const safe=externalUrl(value);return safe?safe.replace(/\/view$/,'/preview'):value}
 async function resolve(record,signedUrl){
  const subjectUrl=record.subject_path?await signedUrl(record.subject_path):externalUrl(record.subject_url);
  if(!subjectUrl)throw new Error('document');
  const correctionUrl=record.correction_path?await signedUrl(record.correction_path):externalUrl(record.correction_url);
  const sourceUrl=['https://laminehoucin.blogspot.com/2017/09/quelques-livres.html','https://www.iamateacher.org/cnc-concours-national-commun','https://www.cpgemaroc.com/','https://rtc.ma/'].includes(record.source_url)||/^https:\/\/cpge-paradise\.com\/SujetsCNC(?:2023|2026)\.php$/.test(record.source_url)?record.source_url:null;
  return {subjectUrl,correctionUrl,previewUrl:record.subject_path?subjectUrl:previewUrl(subjectUrl),sourceUrl,sourceLabel:record.source_label||'Source des documents',external:!record.subject_path};
 }
 const api={externalUrl,previewUrl,resolve};root.PrepagoCncDocuments=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
