import { useCallback, useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import type { Account } from "../types/account";
import { useTotp } from "../hooks/useTotpShared";
import { CountdownRing } from "./CountdownRing";

interface AccountCardProps {
  account: Account;
  onDelete: (id: string) => void;
  onCopy: (account: Account, code: string) => void;
}

function initialsFor(issuer: string): string {
  return issuer.slice(0, 2).toUpperCase() || "?";
}

export function AccountCard({ account, onDelete, onCopy }: AccountCardProps) {
  const { code, remaining, progress, isValid } = useTotp(account);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = useCallback(() => {
    if (!isValid) return;
    onCopy(account, code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [account, code, isValid, onCopy]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onDelete(account.id);
  }, [account.id, confirmDelete, onDelete]);

  return (
    <div
      onClick={handleCopy}
      role="button"
      tabIndex={0}
      aria-label={`Copy current code for ${account.issuer}, ${account.accountName}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCopy();
        }
      }}
      className="account-card group relative cursor-pointer overflow-hidden rounded-xl border border-white/[0.05] bg-black/[0.03] p-4 transition-none"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-black/[0.03] transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black text-white text-xs font-bold shadow-none`}
        >
          {initialsFor(account.issuer)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {account.issuer}
          </h3>
          <p className="truncate text-xs text-slate-400">{account.accountName}</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCopy();
            }}
            title={copied ? "Copied!" : "Copy code"}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.03] hover:text-white"
            aria-label={copied ? "Code copied" : `Copy ${account.issuer} code`}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleDelete();
            }}
            title={confirmDelete ? "Click again to confirm" : "Delete account"}
            className={`rounded-lg p-2 transition-colors ${confirmDelete
              ? "bg-black/[0.03] text-red-400"
              : "text-slate-500 hover:bg-white/[0.03] hover:text-red-400"
              }`}
            aria-label={confirmDelete ? `Confirm deleting ${account.issuer}` : `Delete ${account.issuer}`}
          >
            {confirmDelete ? (
              <KeyRound className="h-4 w-4" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">
            Current code
          </p>
          <p
            className={`mt-1 font-mono text-[28px] font-semibold leading-none tracking-[0.2em] tabular-nums ${isValid ? "text-white" : "text-slate-400"
              }`}
          >
            {code}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <CountdownRing progress={progress} seconds={remaining} />
        </div>
      </div>
    </div>
  );
}
