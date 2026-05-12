"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pill, Calendar } from "lucide-react";
import { NewRecordSheet } from "./_new-record-sheet";

const MOCK_REMINDERS = [
  { id: 1, kind: "medication", text: "After breakfast — 1 blood-pressure tablet", time: "08:00" },
  { id: 2, kind: "appointment", text: "Next Wednesday — Dr Smith, Internal Medicine", time: "Wed 14:30" },
];

export default function TodayPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Today</h1>
      <Button size="lg" className="h-16 w-full text-lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2" /> Add today's record
      </Button>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-500">Reminders</h2>
        {MOCK_REMINDERS.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 p-4">
            {r.kind === "medication" ? <Pill /> : <Calendar />}
            <div className="flex-1">
              <p className="text-sm">{r.text}</p>
              <p className="text-xs text-slate-400">{r.time}</p>
            </div>
          </Card>
        ))}
      </section>
      <NewRecordSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
