/* Pure calculations shared by the focus UI and its regression tests. */
(function(root){
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function dates(start,n){return Array.from({length:n},(_,i)=>{const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+i);return iso(d)})}
 function monday(now=new Date()){const d=new Date(now);d.setDate(d.getDate()-(d.getDay()+6)%7);return iso(d)}
 function parts(row){
  const result={};if(row.deleted_at||row.kind==='break'||!['completed','cancelled'].includes(row.status))return result;
  if(row.legacy_date){result[row.legacy_date]=Number(row.duration_seconds)||0;return result}
  for(const segment of row.segments||[]){
   if(segment.date){result[segment.date]=(result[segment.date]||0)+Number(segment.seconds||0);continue}
   let cursor=Date.parse(segment.start),end=Date.parse(segment.end);if(!Number.isFinite(cursor)||!Number.isFinite(end))continue;
   while(cursor<end){const d=new Date(cursor),key=iso(d),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),stop=Math.min(next,end);result[key]=(result[key]||0)+(stop-cursor)/1000;cursor=stop}
  }
  return result;
 }
 function seconds(row,now=Date.now()){if(!row)return 0;const cap=row.kind==='break'?row.break_duration:row.focus_duration;return Math.min(cap,Math.max(0,Number(row.duration_seconds)||0)+(row.status==='active'&&row.resumed_at?Math.max(0,(now-Date.parse(row.resumed_at))/1000):0))}
 function totals(rows,start,end,subject='',chapter=''){
  const daily={},subjects={},selected=[];let total=0,longest=0;
  for(const r of rows){if(subject&&r.subject_id!==subject||chapter&&r.chapter_id!==chapter)continue;const p=parts(r);let count=0;for(const [date,value] of Object.entries(p)){if(date<start||date>end)continue;count+=value;daily[date]=(daily[date]||0)+value}if(count>0){total+=count;longest=Math.max(longest,count);selected.push(r);const key=r.subject_id||r.subject_name||'free';subjects[key]||={name:r.subject_name||'Étude libre',seconds:0};subjects[key].seconds+=count}}
  return {total,longest,count:selected.length,average:selected.length?total/selected.length:0,daily,subjects:Object.values(subjects).sort((a,b)=>b.seconds-a.seconds),rows:selected.sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))};
 }
 function streak(rows,minimum,today=iso(new Date())){const daily={};for(const r of rows.filter(r=>r.status==='completed'))for(const [d,s] of Object.entries(parts(r)))daily[d]=(daily[d]||0)+s;let d=new Date(today+'T12:00:00'),n=0;if((daily[today]||0)<minimum)d.setDate(d.getDate()-1);while((daily[iso(d)]||0)>=minimum){n++;d.setDate(d.getDate()-1)}return n}
 function duration(sec){const m=Math.floor(Math.max(0,sec)/60);return sec>0&&m===0?'< 1 min':m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:`${m} min`}
 root.FocusData={iso,dates,monday,parts,seconds,totals,streak,duration};
})(typeof window!=='undefined'?window:globalThis);
