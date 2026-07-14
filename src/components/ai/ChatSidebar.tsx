"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeTime, type Conversation } from "@/lib/chat-store";

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  function startEdit(c: Conversation) {
    setEditingId(c.id);
    setDraft(c.title);
  }
  function commitEdit() {
    if (editingId) onRename(editingId, draft.trim() || "New chat");
    setEditingId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-[13.5px] font-semibold text-(--color-fg) hover:border-(--color-brand-300) hover:bg-(--color-brand-50)"
      >
        <Plus className="h-4 w-4" /> New chat
      </button>

      <p className="mt-4 text-[11px] uppercase tracking-[0.14em] font-semibold text-(--color-fg-subtle)">Chats</p>
      <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto">
        {sorted.length === 0 && <li className="px-1 py-2 text-[12.5px] text-(--color-fg-subtle)">No saved chats yet.</li>}
        {sorted.map((c) => {
          const active = c.id === activeId;
          const editing = editingId === c.id;
          return (
            <li key={c.id} className="group relative">
              {editing ? (
                <div className="flex items-center gap-1 rounded-lg border border-(--color-brand-300) bg-(--color-surface) px-2 py-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                  />
                  <button type="button" onClick={commitEdit} className="text-(--color-brand-700)" aria-label="Save name">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-(--color-fg-subtle)" aria-label="Cancel">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left",
                    active ? "bg-(--color-surface-2)" : "hover:bg-(--color-surface-2)/60",
                  )}
                >
                  <MessageSquare className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "text-(--color-brand-700)" : "text-(--color-fg-subtle)")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px]", active ? "font-semibold text-(--color-fg)" : "text-(--color-fg-muted)")}>
                      {c.title}
                    </span>
                    <span className="block text-[10.5px] text-(--color-fg-subtle)">{relativeTime(c.updatedAt)}</span>
                  </span>
                  <span className="ml-1 flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          startEdit(c);
                        }
                      }}
                      className="rounded p-1 text-(--color-fg-subtle) hover:bg-(--color-surface-3) hover:text-(--color-fg)"
                      aria-label="Rename chat"
                    >
                      <Pencil className="h-3 w-3" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onDelete(c.id);
                        }
                      }}
                      className="rounded p-1 text-(--color-fg-subtle) hover:bg-(--color-down-soft) hover:text-(--color-down)"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </span>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-xl border border-(--color-border) bg-(--color-surface-2) p-3 text-[11.5px] leading-relaxed text-(--color-fg-muted)">
        Sense is for educational use only. Not financial advice. Always cross-check critical info.
      </div>
    </div>
  );
}
