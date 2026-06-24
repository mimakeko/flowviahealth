"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, GitBranch, ListChecks, MessageSquareText, Route, UsersRound } from "lucide-react";

const previews = [
  ["Scheduling Dashboard", CalendarDays], ["Patient Timeline", Route], ["SMS Communication Center", MessageSquareText],
  ["Visit Management", ListChecks], ["Care Team Coordination", UsersRound], ["Workflow Automation", GitBranch], ["Reporting & Analytics", BarChart3],
] as const;

const people = ["Olivia Johnson", "James Williams", "Sophia Martinez", "Ethan Brown"];

export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const title = previews[active][0];
  return (
    <div className="mt-12 lg:grid lg:grid-cols-[280px_1fr] lg:gap-8">
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:mb-0 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0" aria-label="Product preview selector">
        {previews.map(([label, Icon], index) => <button key={label} type="button" aria-pressed={active === index} onClick={() => setActive(index)} className={`flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition lg:w-full ${active === index ? "bg-ink text-white shadow-panel" : "border border-line bg-white text-slate-600 hover:border-teal/50 hover:text-ink"}`}><Icon size={18} className={active === index ? "text-teal" : "text-blue"}/>{label}</button>)}
      </div>
      <PreviewFrame title={title}>{renderPreview(active)}</PreviewFrame>
    </div>
  );
}

function PreviewFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <figure className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft"><div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><div><p className="text-xs font-semibold text-ink">{title}</p><p className="mt-0.5 text-[10px] text-slate-400">Flowvia workspace</p></div><span className="concept-label"><i className="h-1.5 w-1.5 rounded-full bg-teal"/>Concept Preview</span></div><div className="min-h-[430px] bg-mist p-4 sm:p-6">{children}</div><figcaption className="sr-only">Concept Preview of {title}.</figcaption></figure>;
}

function renderPreview(index: number) {
  if (index === 0) return <SchedulePreview/>;
  if (index === 1) return <TimelinePreview/>;
  if (index === 2) return <MessagesPreview/>;
  if (index === 3) return <VisitsPreview/>;
  if (index === 4) return <TeamPreview/>;
  if (index === 5) return <AutomationPreview/>;
  return <ReportsPreview/>;
}

function SchedulePreview() {
  return <div className="grid h-full gap-4 lg:grid-cols-[1fr_230px]"><section className="rounded-xl border border-line bg-white p-4"><div className="mb-4 flex justify-between"><h3 className="text-sm font-semibold">Week of May 18</h3><span className="text-xs text-blue">Today</span></div><div className="grid grid-cols-5 gap-2">{["Mon 18","Tue 19","Wed 20","Thu 21","Fri 22"].map((day,i)=><div key={day}><p className={`mb-3 rounded-md py-2 text-center text-[9px] ${i===2?"bg-ink text-white":"bg-mist text-slate-500"}`}>{day}</p>{people.slice(0,i%2+2).map((p,j)=><div key={p} className={`mb-2 rounded-md border-l-2 p-2 text-[8px] ${j%2?"border-teal bg-teal/5":"border-blue bg-blue/5"}`}><b className="block text-ink">{9+j*2}:00</b>{p.split(" ")[0]}</div>)}</div>)}</div></section><section className="rounded-xl border border-line bg-white p-4"><h3 className="text-sm font-semibold">Unscheduled visits</h3>{people.slice(1).map((p,i)=><div key={p} className="mt-3 rounded-lg border border-line p-3 text-[9px]"><b>{p}</b><p className="mt-1 text-slate-400">{i+1} visit{ i ? "s" : ""} remaining</p></div>)}</section></div>;
}

function TimelinePreview() {
  const events=[["8:42 AM","Reminder delivered","SMS"],["9:03 AM","Patient confirmed visit","Confirmation"],["10:00 AM","Therapist checked in","Visit"],["10:48 AM","Visit completed","Completed"],["11:02 AM","Follow-up task created","Automation"]];
  return <div className="grid gap-4 lg:grid-cols-[220px_1fr]"><aside className="rounded-xl border border-line bg-white p-5"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-ice font-semibold text-blue">OJ</div><h3 className="mt-4 font-semibold">Olivia Johnson</h3><p className="mt-1 text-xs text-slate-400">PT · Tuesday 9:00 AM</p><dl className="mt-5 space-y-3 text-xs"><div><dt className="text-slate-400">Care plan</dt><dd className="mt-1 font-medium">Lower Extremity Strengthening</dd></div><div><dt className="text-slate-400">Assigned therapist</dt><dd className="mt-1 font-medium">Sarah Thompson, PT</dd></div></dl></aside><section className="rounded-xl border border-line bg-white p-5"><h3 className="text-sm font-semibold">Patient timeline</h3><div className="relative mt-5 border-l-2 border-teal/25 pl-6">{events.map(([time,event,type],i)=><div key={event} className="relative pb-6 last:pb-0"><i className={`absolute -left-[31px] top-0 h-3 w-3 rounded-full border-2 border-white ${i===3?"bg-success":"bg-teal"}`}/><div className="flex items-start justify-between gap-4"><div><b className="text-xs">{event}</b><p className="mt-1 text-[10px] text-slate-400">{type}</p></div><span className="text-[10px] text-slate-400">{time}</span></div></div>)}</div></section></div>;
}

function MessagesPreview() {
  return <div className="grid min-h-[380px] overflow-hidden rounded-xl border border-line bg-white md:grid-cols-[220px_1fr]"><aside className="border-b border-line p-3 md:border-b-0 md:border-r"><h3 className="px-2 py-2 text-sm font-semibold">Conversations</h3>{people.map((p,i)=><div key={p} className={`mt-1 rounded-lg p-3 text-[10px] ${i===0?"bg-ice":"hover:bg-mist"}`}><div className="flex justify-between"><b>{p}</b><span className="text-slate-400">{i+9}:14</span></div><p className="mt-1 truncate text-slate-400">{i===0?"Visit confirmed for tomorrow":"Scheduling update sent"}</p></div>)}</aside><section className="flex flex-col p-4"><div className="border-b border-line pb-3"><h3 className="text-sm font-semibold">Olivia Johnson</h3><p className="text-[10px] text-success">SMS consent confirmed</p></div><div className="flex-1 space-y-4 py-5 text-[11px]"><p className="max-w-[76%] rounded-xl rounded-bl-sm bg-ice p-3">Hi Olivia, this is a reminder of your appointment tomorrow at 9:00 AM. Reply STOP to opt out.</p><p className="ml-auto max-w-[62%] rounded-xl rounded-br-sm bg-teal/10 p-3">Confirmed, thank you!</p><p className="max-w-[76%] rounded-xl rounded-bl-sm bg-ice p-3">Great — your care team has been notified.</p></div><div className="rounded-lg border border-line px-3 py-2 text-xs text-slate-400">Write a message…</div></section></div>;
}

function VisitsPreview() {
  return <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="flex items-center justify-between border-b border-line p-4"><h3 className="text-sm font-semibold">Today&apos;s visits</h3><span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-medium text-emerald-700">18 completed</span></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[10px]"><thead className="bg-mist text-slate-400"><tr>{["Time","Patient","Discipline","Clinician","Status","Next step"].map(h=><th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{people.map((p,i)=><tr key={p} className="border-t border-line"><td className="px-4 py-4 font-medium">{9+i}:00 AM</td><td className="px-4 py-4 font-semibold">{p}</td><td className="px-4 py-4">{i%2?"OT":"PT"}</td><td className="px-4 py-4">{["S. Thompson","M. Davis","J. Wilson","A. Lee"][i]}</td><td className="px-4 py-4"><span className={`font-medium ${i<2?"text-emerald-600":i===2?"text-amber-500":"text-blue"}`}>{i<2?"Completed":i===2?"In progress":"Scheduled"}</span></td><td className="px-4 py-4 text-blue">{i<2?"Review note":"View visit"}</td></tr>)}</tbody></table></div></section>;
}

function TeamPreview() {
  const columns=[["Needs review",["Verify insurance · Olivia","Review plan of care · James"]],["In progress",["Home safety checklist · Sophia","Coordinate equipment · Ethan"]],["Completed",["Confirm visit · Olivia","Send referral update · James"]]];
  return <div className="grid gap-3 md:grid-cols-3">{columns.map(([title,tasks],i)=><section key={title as string} className="rounded-xl border border-line bg-white p-4"><div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold">{title as string}</h3><span className={`h-2 w-2 rounded-full ${i===2?"bg-success":i===1?"bg-amber-400":"bg-blue"}`}/></div>{(tasks as string[]).map((task,j)=><div key={task} className="mb-3 rounded-lg border border-line p-3"><p className="text-[10px] font-medium">{task}</p><div className="mt-3 flex items-center justify-between"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-ice text-[8px] font-semibold text-blue">{["ST","MD","JW"][j+i]}</span><span className="text-[8px] text-slate-400">Due today</span></div></div>)}</section>)}</div>;
}

function AutomationPreview() {
  const steps=[["Trigger","Visit scheduled"],["Wait","24 hours before visit"],["Action","Send SMS reminder"],["Condition","Patient response received?"],["Action","Notify assigned clinician"]];
  return <div className="mx-auto max-w-xl"><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Appointment reminder</h3><p className="mt-1 text-[10px] text-slate-400">Active workflow</p></div><span className="rounded-full bg-success/15 px-3 py-1 text-[10px] font-semibold text-emerald-700">Active</span></div><div className="space-y-0">{steps.map(([type,name],i)=><div key={name} className="relative"><div className="rounded-xl border border-line bg-white p-4"><span className="text-[9px] font-semibold uppercase tracking-wider text-teal">{type}</span><p className="mt-1 text-xs font-semibold">{name}</p></div>{i<steps.length-1?<div className="mx-auto h-5 w-px bg-teal/40"/>:null}</div>)}</div></div>;
}

function ReportsPreview() {
  const bars=[58,72,46,84,66,92,76];
  return <div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Visits completed","1,248","+12%"],["On-time rate","94%","+3%"],["SMS confirmed","87%","+8%"],["Open tasks","12","-18%"]].map(([label,value,delta])=><div key={label} className="rounded-xl border border-line bg-white p-4"><p className="text-[9px] text-slate-400">{label}</p><strong className="mt-2 block text-xl">{value}</strong><span className="text-[9px] text-emerald-600">{delta} this month</span></div>)}</div><section className="mt-4 rounded-xl border border-line bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Visit volume</h3><span className="text-[10px] text-slate-400">Last 7 days</span></div><div className="mt-8 flex h-48 items-end gap-3 border-b border-line">{bars.map((height,i)=><div key={i} className="flex flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t-md bg-gradient-to-t from-blue to-teal" style={{height:`${height}%`}}/><span className="text-[8px] text-slate-400">{["M","T","W","T","F","S","S"][i]}</span></div>)}</div></section></div>;
}
