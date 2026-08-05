"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

const FIELD_CLASS =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:focus:border-zinc-100 dark:disabled:bg-zinc-950";
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400";
const BUTTON_CLASS =
  "self-start rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";
const SECTION_CLASS = "flex flex-col gap-3 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800";

// MR-3.2 (Customer Experience Sprint): profile/settings, the one piece of
// "edit account" the customer journey was still missing. Talks directly to
// better-auth's own /update-user and /change-password endpoints via the
// client SDK (authClient) — no custom API route needed, matching how
// login/signup/logout already work. Email is deliberately read-only:
// better-auth's changeEmail flow requires a working verification email,
// which doesn't exist yet (NoOpEmailProvider, docs/EMAIL_PROVIDER.md) —
// shipping a "change email" button that silently never completes would be
// worse than not having one.
export function SettingsForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameBusy(true);
    setNameError(null);
    setNameSaved(false);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      setNameBusy(false);
      return;
    }
    const { error } = await authClient.updateUser({ name: trimmed });
    setNameBusy(false);
    if (error) {
      setNameError(error.message ?? "Couldn't save your name.");
      return;
    }
    setNameSaved(true);
    router.refresh();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }

    setPasswordBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
    setPasswordBusy(false);
    if (error) {
      setPasswordError(error.message ?? "Couldn't change your password.");
      return;
    }
    setPasswordSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={SECTION_CLASS}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Profile</h2>
        <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
          <label className={LABEL_CLASS}>
            Name
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Email
            <input type="email" value={email} disabled className={FIELD_CLASS} />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={nameBusy} className={BUTTON_CLASS}>
              {nameBusy ? "Saving…" : "Save"}
            </button>
            {nameSaved && <p className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>}
          </div>
          {nameError && <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>}
        </form>
      </section>

      <section className={SECTION_CLASS}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Password</h2>
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <label className={LABEL_CLASS}>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setPasswordSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordSaved(false);
              }}
              className={FIELD_CLASS}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}
              className={BUTTON_CLASS}
            >
              {passwordBusy ? "Saving…" : "Change password"}
            </button>
            {passwordSaved && <p className="text-xs text-emerald-600 dark:text-emerald-400">Password changed.</p>}
          </div>
          {passwordError && <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p>}
        </form>
      </section>
    </div>
  );
}
