import React from "react";
import { SanitizedRecentLogin } from "@/lib/admin/queries";
import { ShieldCheck, ShieldAlert, LogOut, Activity } from "lucide-react";

interface RecentActivityTableProps {
  logins: SanitizedRecentLogin[];
}

export function RecentActivityTable({ logins }: RecentActivityTableProps) {
  if (logins.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center">
        <Activity className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
        <p className="mt-2 text-sm text-slate-400">No recent authentication activity recorded in current window.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <caption className="sr-only">Audit log of recent user logins and authentication attempts</caption>
          <thead className="border-b border-slate-800 bg-slate-950/50 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th scope="col" className="px-6 py-3.5 font-semibold">User (Masked)</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Event</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Status</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Client Fingerprint</th>
              <th scope="col" className="px-6 py-3.5 font-semibold">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
            {logins.map((entry) => {
              const isSuccess = entry.outcome === "SUCCESS";
              const isLogout = entry.eventType === "LOGOUT";

              return (
                <tr key={entry.id} className="transition-colors hover:bg-slate-800/30">
                  <td className="whitespace-nowrap px-6 py-4 font-sans font-medium text-slate-200">
                    {entry.maskedIdentifier}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="text-slate-400">{entry.eventType}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {isLogout ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 font-sans text-xs font-medium text-slate-300 border border-slate-700">
                        <LogOut className="h-3 w-3" />
                        Signed Out
                      </span>
                    ) : isSuccess ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-sans text-xs font-medium text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="h-3 w-3" />
                        Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 font-sans text-xs font-medium text-rose-400 border border-rose-500/20">
                        <ShieldAlert className="h-3 w-3" />
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-400">
                    {entry.maskedIp}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-400 font-sans">
                    {new Date(entry.timestamp).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
