"use client";

import { useEffect, useState } from "react";
import { getApiHealth } from "@/lib/api";

type Status = "checking" | "online" | "offline";

export function HealthCheck() {
  const [status, setStatus] = useState<Status>("checking");
  const [database, setDatabase] = useState<string | null>(null);

  useEffect(() => {
    getApiHealth()
      .then((health) => {
        setStatus("online");
        setDatabase(health.database);
      })
      .catch(() => setStatus("offline"));
  }, []);

  const styles: Record<Status, string> = {
    checking: "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400",
    online: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300",
    offline: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300",
  };

  return (
    <div className={`rounded-full px-4 py-1 text-sm font-medium ${styles[status]}`}>
      API: {status}
      {status === "online" && database ? ` · database ${database}` : null}
    </div>
  );
}
