"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pill, Calendar } from "lucide-react";
import { NewRecordSheet } from "./_new-record-sheet";

const MOCK_REMINDERS = [
  { id: 1, kind: "藥", text: "早餐後 — 高血壓藥 1 顆", time: "08:00" },
  { id: 2, kind: "回診", text: "下週三 內科陳醫師", time: "週三 14:30" },
];

export default function TodayPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">今日</h1>
      <Button size="lg" className="h-16 w-full text-lg" onClick={() => setOpen(true)}>
        <Plus className="mr-2" /> 新增今日紀錄
      </Button>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-500">提醒</h2>
        {MOCK_REMINDERS.map((r) => (
          <Card key={r.id} className="flex items-center gap-3 p-4">
            {r.kind === "藥" ? <Pill /> : <Calendar />}
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
