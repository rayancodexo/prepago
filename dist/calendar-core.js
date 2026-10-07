/* Calendar calculations: local dates, clipped intervals and collision layout. */
(function(root) {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const at = (date,time='00:00') => new Date(`${date}T${time}:00`).getTime();
  const next = day => {const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+1);return iso(d);};
  const minutes = time => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0,2))*60+Number(time.slice(3)) : null;
  const clock = minute => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(Math.floor(minute%60)).padStart(2,'0')}`;
  function clipped(start,end,day) {
    const floor=at(day),ceil=at(next(day)),a=Math.max(start,floor),b=Math.min(end,ceil);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b<=a) return null;
    const toMinute=t => {const d=new Date(t);return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;};
    return {startMinute:a===floor?0:toMinute(a),endMinute:b===ceil?1440:toMinute(b),seconds:(b-a)/1000};
  }
  function planned(state,day,{category='all',tipe=false,ids=new Set()}={}) {
    const rows=[];
    for(const item of [...(state.events || []).map(e=>({...e,kind:'event'})),...(state.tasks || []).map(t=>({...t,kind:'task'}))]) {
      if (tipe && !ids.has(item.projectId)) continue;
      const cat=item.kind==='task'?'task':item.category || 'study';
      if (category!=='all' && category!==cat) continue;
      if (!item.date) continue;
      const endDate=item.endDate || item.date;
      if (item.allDay || minutes(item.time)===null) {
        if (day>=item.date && day<=endDate) rows.push({item,category:cat,allDay:true,seconds:item.kind==='task'?Math.max(0,Number(item.minutes) || 0)*60:0,key:item.kind+':'+item.id});
        continue;
      }
      const start=at(item.date,item.time),known=item.kind==='task'?Number(item.minutes)>0:!!item.end;
      const end=item.kind==='task'?start+(Number(item.minutes)>0?Number(item.minutes):20)*60000:item.end?at(endDate,item.end):start+20*60000;
      const interval=clipped(start,end,day);if(!interval)continue;
      rows.push({item,category:cat,allDay:false,endKnown:known,...interval,seconds:known?interval.seconds:0,key:item.kind+':'+item.id});
    }
    return rows.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||(a.startMinute || 0)-(b.startMinute || 0));
  }
  function recorded(rows,day,{category='all',tipe=false,ids=new Set()}={}) {
    if (category!=='all' && category!=='study') return [];
    const result=[];
    for (const item of rows || []) {
      if (item.kind!=='work' || item.deleted_at || !['completed','cancelled'].includes(item.status) || !(item.duration_seconds>0) || (tipe && !ids.has(item.project_id))) continue;
      const total=root.FocusData.parts(item)[day] || 0;if(!total)continue;
      const base={item,day,category:'study',kind:'session',seconds:total,key:'session:'+item.id};
      const segments=(item.segments || []).map((s,i)=>s.start && s.end ? {interval:clipped(Date.parse(s.start),Date.parse(s.end),day),index:i} : null).filter(s=>s?.interval);
      if (!segments.length) result.push({...base,allDay:true,unknownTime:true});
      else segments.forEach(({interval,index})=>result.push({...base,...interval,dayTotal:total,allDay:false,endKnown:true,key:base.key+':'+index}));
    }
    return result.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||(a.startMinute || 0)-(b.startMinute || 0));
  }
  function layout(rows,minDuration=0) {
    const sorted=rows.filter(r=>!r.allDay).map(r=>({...r})).sort((a,b)=>a.startMinute-b.startMinute||b.endMinute-a.endMinute);
    let cluster=[],end=-1;
    function flush() {
      const columns=[];
      for(const row of cluster) {
        let col=columns.findIndex(last=>last<=row.startMinute);if(col<0)col=columns.length;
        row.column=col;columns[col]=Math.max(row.endMinute,row.startMinute+minDuration);
      }
      cluster.forEach(row=>row.columns=columns.length);cluster=[];
    }
    for(const row of sorted) {if(cluster.length && row.startMinute>=end)flush();cluster.push(row);const visualEnd=Math.max(row.endMinute,row.startMinute+minDuration);end=Math.max(cluster.length===1?visualEnd:end,visualEnd);}
    if(cluster.length)flush();return sorted;
  }
  function monthDays(day) {
    const base=new Date(day+'T12:00:00'),first=new Date(base.getFullYear(),base.getMonth(),1);
    first.setDate(first.getDate()-(first.getDay()+6)%7);
    return Array.from({length:42},(_,i)=>{const d=new Date(first);d.setDate(d.getDate()+i);return iso(d);});
  }
  function shift(day,view,direction) {
    const d=new Date(day+'T12:00:00');
    if(view==='month') {const n=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+direction);d.setDate(Math.min(n,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}
    else d.setDate(d.getDate()+direction*(view==='week'?7:1));
    return iso(d);
  }
  function retireEvent(state,id) {
    const event=state.events.find(e=>e.id===id);if(!event)return false;
    (state.calendarTrash ||= []).push(event);state.events=state.events.filter(e=>e.id!==id);
    const tipe=root.PrepagoTipeCore,p=tipe?.primary(state);
    if(p&&event.tipeMilestone&&tipe.ids(state).has(event.projectId)) {
      const d=tipe.data(p);if(d.deadlines[event.tipeMilestone]===event.date)p.tipeData={...d,deadlines:{...d.deadlines,[event.tipeMilestone]:''}};
    }
    return true;
  }
  function restoreEvent(state,id) {
    const event=(state.calendarTrash || []).find(e=>e.id===id);if(!event)return false;
    if(!state.events.some(e=>e.id===id))state.events.push(event);
    state.calendarTrash=state.calendarTrash.filter(e=>e.id!==id);
    const tipe=root.PrepagoTipeCore,p=tipe?.primary(state);
    if(p&&event.tipeMilestone&&tipe.ids(state).has(event.projectId)) {
      const d=tipe.data(p);if(!d.deadlines[event.tipeMilestone])p.tipeData={...d,deadlines:{...d.deadlines,[event.tipeMilestone]:event.date}};
    }
    return true;
  }
  root.PrepagoCalendarCore={iso,at,next,minutes,clock,clipped,planned,recorded,layout,monthDays,shift,retireEvent,restoreEvent};
})(typeof window!=='undefined'?window:globalThis);
