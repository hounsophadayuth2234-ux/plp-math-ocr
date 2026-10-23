"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  Plus,
  RefreshCw,
  Search,
  KeyRound,
  Trash2,
  Edit,
  AlertTriangle,
  History,
  Copy,
  Check,
  Activity,
  Eye,
  EyeOff,
  Send,
} from "lucide-react";

interface SafeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "DISABLED";
  mustChangePassword: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  visiblePassword?: string | null;
  telegramLinked?: boolean;
  telegramUsername?: string;
  telegramLinkedAt?: number;
}

interface AuditEvent {
  id: string;
  type: string;
  actorId?: string;
  actorUsername?: string;
  targetId?: string;
  targetUsername?: string;
  timestamp: number;
  ipHash: string;
  details?: Record<string, any>;
}

export default function AdminPage() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"users" | "audit" | "mfa" | "telegram">("users");
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);
  const [sessionUser, setSessionUser] = useState<SafeUser | null>(null);

  // Telegram Linking State
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramStatusMessage, setTelegramStatusMessage] = useState<string | null>(null);
  const [telegramErrorMessage, setTelegramErrorMessage] = useState<string | null>(null);
  const [telegramChallengeToken, setTelegramChallengeToken] = useState<string | null>(null);
  const challengeTokenRef = useRef<string | null>(null);

  // MFA Management State
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaQrSvg, setMfaQrSvg] = useState<string | null>(null);
  const [mfaManualKey, setMfaManualKey] = useState<string | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaStatusMessage, setMfaStatusMessage] = useState<string | null>(null);
  const [mfaErrorMessage, setMfaErrorMessage] = useState<string | null>(null);

  // Dialog & Modal States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<SafeUser | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "delete" | "disable" | "enable" | "role" | "resetPassword";
    user: SafeUser;
    newRole?: "ADMIN" | "USER";
  } | null>(null);

  // Temporary password display modal
  const [tempPasswordDisplay, setTempPasswordDisplay] = useState<{
    username: string;
    password: string;
    isCopied: boolean;
  } | null>(null);

  // Reset password inputs
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [resetConfirmPasswordInput, setResetConfirmPasswordInput] = useState("");

  // Create User Form State
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "USER">("USER");
  const [customPassword, setCustomPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [createPasswordCopied, setCreatePasswordCopied] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleGenerateSimplePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let pass = "";
    for (let i = 0; i < 6; i++) {
      pass += chars[Math.floor(Math.random() * chars.length)];
    }
    setCustomPassword(pass);
    setNewConfirmPassword(pass);
  };

  const handleCopyCreatePassword = () => {
    if (!customPassword) return;
    navigator.clipboard.writeText(customPassword);
    setCreatePasswordCopied(true);
    setTimeout(() => setCreatePasswordCopied(false), 2000);
  };

  const handleUseAdminExample = () => {
    setNewUsername("admin1");
    setCustomPassword("admin1");
    setNewConfirmPassword("admin1");
    setNewRole("ADMIN");
    setFormError(null);
  };

  const handleUseUserExample = () => {
    setNewUsername("user1");
    setCustomPassword("user1");
    setNewConfirmPassword("user1");
    setNewRole("USER");
    setFormError(null);
  };

  const handleClearForm = () => {
    setNewUsername("");
    setCustomPassword("");
    setNewConfirmPassword("");
    setNewDisplayName("");
    setNewEmail("");
    setNewRole("USER");
    setFormError(null);
    setCreatePasswordCopied(false);
  };

  // Fetch Session & CSRF
  const initSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
      if (data.user) {
        setSessionUser(data.user);
      }
    } catch {}
  }, []);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load users");
      }
      setUsers(data.users || []);
      setCurrentTimestamp(Date.now());
    } catch (err: any) {
      setError(err.message || "Failed to load user accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Audit Log
  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-log");
      const data = await res.json();
      if (res.ok) {
        setAuditEvents(data.events || []);
      }
    } catch {}
  }, []);

  // Fetch MFA Status
  const fetchMfaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mfa");
      const data = await res.json();
      if (res.ok) {
        setMfaEnabled(Boolean(data.mfaEnabled));
      }
    } catch {}
  }, []);

  useEffect(() => {
    setCurrentTimestamp(Date.now());
    initSession();
    fetchUsers();
    fetchAuditLog();
    fetchMfaStatus();
  }, [initSession, fetchUsers, fetchAuditLog, fetchMfaStatus]);

  const handleInitiateMfa = async () => {
    setMfaLoading(true);
    setMfaErrorMessage(null);
    try {
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start MFA setup");
      setMfaQrSvg(data.qrSvg);
      setMfaManualKey(data.manualKey);
    } catch (err: any) {
      setMfaErrorMessage(err.message || "Failed to initiate MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaErrorMessage(null);
    try {
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ action: "verify", code: mfaVerificationCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "MFA code verification failed");
      setMfaEnabled(true);
      setMfaQrSvg(null);
      setMfaManualKey(null);
      setMfaRecoveryCodes(data.recoveryCodes || []);
      setMfaStatusMessage("បានបើកដំណើរការ MFA ដោយជោគជ័យ!");
    } catch (err: any) {
      setMfaErrorMessage(err.message || "Failed to verify MFA code");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!confirm("តើអ្នកពិតជាចង់បិទដំណើរការ 2FA MFA មែនទេ?")) return;
    setMfaLoading(true);
    setMfaErrorMessage(null);
    try {
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ action: "disable" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disable MFA");
      setMfaEnabled(false);
      setMfaRecoveryCodes([]);
      setMfaStatusMessage("បានបិទដំណើរការ MFA រួចរាល់");
    } catch (err: any) {
      setMfaErrorMessage(err.message || "Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  // Telegram Linking Handlers
  const handleCompleteTelegramLink = useCallback(
    async (challengeToken: string, tgUser: any) => {
      setTelegramLoading(true);
      setTelegramErrorMessage(null);
      try {
        const res = await fetch("/api/auth/telegram/link/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            challengeToken,
            telegramData: tgUser,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to complete Telegram link");
        }
        setTelegramStatusMessage("បានភ្ជាប់ Telegram ដោយជោគជ័យ (Telegram linked successfully)!");
        if (data.user) {
          setSessionUser(data.user);
        }
        fetchUsers();
        fetchAuditLog();
      } catch (err: any) {
        setTelegramErrorMessage(err.message || "Error completing Telegram link");
      } finally {
        setTelegramLoading(false);
      }
    },
    [csrfToken, fetchUsers, fetchAuditLog]
  );

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    if (win) {
      win.onTelegramLinkAuth = (tgUser: any) => {
        if (challengeTokenRef.current && tgUser) {
          handleCompleteTelegramLink(challengeTokenRef.current, tgUser);
        }
      };
    }
    return () => {
      if (win) {
        delete win.onTelegramLinkAuth;
      }
    };
  }, [handleCompleteTelegramLink]);

  const handleStartTelegramLink = async () => {
    setTelegramLoading(true);
    setTelegramErrorMessage(null);
    setTelegramStatusMessage(null);
    try {
      const res = await fetch("/api/auth/telegram/link/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start Telegram linking");
      }

      challengeTokenRef.current = data.challengeToken;
      setTelegramChallengeToken(data.challengeToken);

      const win = typeof window !== "undefined" ? (window as any) : null;
      if (win && win.Telegram && win.Telegram.Login && win.Telegram.Login.auth) {
        win.Telegram.Login.auth(
          { bot_id: data.botUsername, request_access: true },
          async (tgUser: any) => {
            if (tgUser) {
              await handleCompleteTelegramLink(data.challengeToken, tgUser);
            }
          }
        );
      } else {
        const container = document.getElementById("telegram-admin-link-widget");
        if (container) {
          container.innerHTML = "";
          const script = document.createElement("script");
          script.src = "https://telegram.org/js/telegram-widget.js?22";
          script.setAttribute("data-telegram-login", data.botUsername);
          script.setAttribute("data-size", "large");
          script.setAttribute("data-request-access", "write");
          script.setAttribute("data-onauth", "onTelegramLinkAuth(user)");
          script.async = true;
          container.appendChild(script);
        }
      }
    } catch (err: any) {
      setTelegramErrorMessage(err.message || "Failed to initiate Telegram link");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    setTelegramLoading(true);
    setTelegramErrorMessage(null);
    setTelegramStatusMessage(null);
    try {
      const res = await fetch("/api/auth/telegram/unlink", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to unlink Telegram");
      }
      setTelegramStatusMessage("បានផ្តាច់ Telegram ដោយជោគជ័យ (Telegram unlinked successfully)!");
      if (data.user) {
        setSessionUser(data.user);
      }
      fetchUsers();
      fetchAuditLog();
    } catch (err: any) {
      setTelegramErrorMessage(err.message || "Error unlinking Telegram");
    } finally {
      setTelegramLoading(false);
    }
  };

  // Summary Metrics
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;
  const disabledUsers = users.filter((u) => u.status === "DISABLED").length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const recentLogins = users.filter(
    (u) =>
      u.lastLoginAt &&
      currentTimestamp > 0 &&
      currentTimestamp - u.lastLoginAt < 86400 * 1000 * 7
  ).length;

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  // Action: Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = newUsername.trim();
    if (!cleanUsername) {
      setFormError("សូមបញ្ចូលឈ្មោះអ្នកប្រើប្រាស់");
      return;
    }
    if (cleanUsername.length < 4) {
      setFormError("ឈ្មោះអ្នកប្រើប្រាស់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
      return;
    }

    if (!customPassword) {
      setFormError("សូមបញ្ចូលពាក្យសម្ងាត់");
      return;
    }
    if (customPassword.length < 4) {
      setFormError("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
      return;
    }
    if (customPassword !== newConfirmPassword) {
      setFormError("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា");
      return;
    }

    setFormSubmitting(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: cleanUsername,
          email: newEmail.trim() || undefined,
          displayName: newDisplayName.trim() || undefined,
          role: newRole,
          password: customPassword,
          confirmPassword: newConfirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      setCreateModalOpen(false);
      setNewUsername("");
      setNewEmail("");
      setNewDisplayName("");
      setCustomPassword("");
      setNewConfirmPassword("");
      setShowOptionalDetails(false);
      setCreatePasswordCopied(false);

      // If temporary password was returned, show it once
      if (data.temporaryPassword) {
        setTempPasswordDisplay({
          username: data.user.username,
          password: data.temporaryPassword,
          isCopied: false,
        });
      }

      await fetchUsers();
      await fetchAuditLog();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Action: Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;
    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/admin/users/${editModalUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          displayName: editModalUser.displayName,
          email: editModalUser.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update account");

      setEditModalUser(null);
      await fetchUsers();
      await fetchAuditLog();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Action: Confirm Dialog Execution
  const handleExecuteConfirm = async () => {
    if (!confirmDialog) return;
    const { type, user, newRole } = confirmDialog;

    if (type === "resetPassword" && resetPasswordInput.trim()) {
      if (resetPasswordInput.trim().length < 4) {
        alert("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ");
        return;
      }
      if (resetPasswordInput.trim() !== resetConfirmPasswordInput.trim()) {
        alert("ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នា");
        return;
      }
    }

    setFormSubmitting(true);

    try {
      if (type === "delete") {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "DELETE",
          headers: { "x-csrf-token": csrfToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to delete account");
      } else if (type === "disable") {
        const res = await fetch(`/api/admin/users/${user.id}/disable`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to disable account");
      } else if (type === "enable") {
        const res = await fetch(`/api/admin/users/${user.id}/enable`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to enable account");
      } else if (type === "role" && newRole) {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ role: newRole }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to change role");
      } else if (type === "resetPassword") {
        const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            password: resetPasswordInput.trim() || undefined,
            confirmPassword: resetConfirmPasswordInput.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to reset password");

        const displayPass = data.temporaryPassword || data.visiblePassword;
        if (displayPass) {
          setTempPasswordDisplay({
            username: user.username,
            password: displayPass,
            isCopied: false,
          });
        }
        setResetPasswordInput("");
        setResetConfirmPasswordInput("");
      }

      setConfirmDialog(null);
      await fetchUsers();
      await fetchAuditLog();
    } catch (err: any) {
      alert(err.message || "Operation failed");
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6 shadow-[0_0_30px_rgba(0,240,255,0.1)] backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/40">
                ADMIN ACCESS
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-sans">
                Admin Panel · ផ្ទាំងគ្រប់គ្រងគណនី
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              User Management, RBAC Permissions &amp; Security Audit Telemetry
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                fetchUsers();
                fetchAuditLog();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              data-testid="create-user-btn"
              onClick={() => {
                setFormError(null);
                setNewUsername("");
                setNewEmail("");
                setNewDisplayName("");
                setCustomPassword("");
                setNewConfirmPassword("");
                setShowCreatePassword(false);
                setShowCreateConfirmPassword(false);
                setCreatePasswordCopied(false);
                setShowOptionalDetails(false);
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.25)] hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>បង្កើតគណនីថ្មី (Create Account)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Summary HUD Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Total Users */}
        <div className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Accounts</span>
            <Users className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{totalUsers}</div>
          <div className="text-[10px] text-cyan-400/80 mt-1">គណនីសរុប</div>
        </div>

        {/* Active Users */}
        <div className="rounded-xl border border-emerald-500/20 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Users</span>
            <UserCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-400">{activeUsers}</div>
          <div className="text-[10px] text-emerald-400/80 mt-1">កំពុងដំណើរការ</div>
        </div>

        {/* Disabled Users */}
        <div className="rounded-xl border border-rose-500/20 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Disabled</span>
            <UserX className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-400">{disabledUsers}</div>
          <div className="text-[10px] text-rose-400/80 mt-1">បានបិទដំណើរការ</div>
        </div>

        {/* Admins */}
        <div className="rounded-xl border border-indigo-500/20 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Administrators</span>
            <Shield className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-300">{adminCount}</div>
          <div className="text-[10px] text-indigo-400/80 mt-1">អ្នកគ្រប់គ្រង</div>
        </div>

        {/* Recent Logins */}
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-sky-500/20 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Past 7d</span>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-sky-300">{recentLogins}</div>
          <div className="text-[10px] text-sky-400/80 mt-1">ចូលប្រើ 7 ថ្ងៃចុងក្រោយ</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold uppercase transition-all ${
            activeTab === "users"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>User Accounts ({totalUsers})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold uppercase transition-all ${
            activeTab === "audit"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span>Security Audit Log ({auditEvents.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mfa")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold uppercase transition-all ${
            activeTab === "mfa"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Shield className="h-3.5 w-3.5 text-cyan-400" />
          <span>Admin MFA (2FA) {mfaEnabled ? "✓ Active" : "Off"}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("telegram")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold uppercase transition-all ${
            activeTab === "telegram"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Send className="h-3.5 w-3.5 text-sky-400" />
          <span>Telegram Link {sessionUser?.telegramLinked ? "✓ បានភ្ជាប់" : "មិនទាន់ភ្ជាប់"}</span>
        </button>
      </div>

      {/* 4. Tab 1: User Accounts Table */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ស្វែងរកគណនីតាម ឈ្មោះ, អ៊ីមែល, ឬ តួនាទី... (Search by username, email, role)"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 font-sans"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">User Details</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4">Last Login</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                      {loading ? "កំពុងទាញយកទិន្នន័យ... (Loading...)" : "រកមិនឃើញគណនីទេ (No accounts found)"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isLastAdmin = u.role === "ADMIN" && adminCount <= 1;
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* User Details */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm">{u.displayName}</div>
                          <div className="text-xs text-cyan-400 font-mono">@{u.username}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </td>

                        {/* Role */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                              u.role === "ADMIN"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.role}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                              u.status === "ACTIVE"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                u.status === "ACTIVE" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                              }`}
                            />
                            {u.status}
                          </span>
                          {u.mustChangePassword && (
                            <div className="text-[9px] text-amber-400 font-mono mt-0.5">
                              ⚠️ Temp Password
                            </div>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>

                        {/* Last Login */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setEditModalUser({ ...u });
                              }}
                              title="Edit user details"
                              className="rounded-lg border border-slate-700 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>

                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDialog({ type: "resetPassword", user: u })
                              }
                              title="Reset password"
                              className="rounded-lg border border-amber-500/30 bg-amber-950/40 p-1.5 text-amber-300 hover:bg-amber-900/60 transition-colors"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>

                            {/* Change Role Toggle */}
                            <button
                              type="button"
                              disabled={isLastAdmin}
                              onClick={() =>
                                setConfirmDialog({
                                  type: "role",
                                  user: u,
                                  newRole: u.role === "ADMIN" ? "USER" : "ADMIN",
                                })
                              }
                              title={
                                isLastAdmin
                                  ? "Cannot demote final admin"
                                  : u.role === "ADMIN"
                                  ? "Demote to User"
                                  : "Promote to Admin"
                              }
                              className={`rounded-lg border p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.role === "ADMIN"
                                  ? "border-indigo-500/30 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60"
                                  : "border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
                              }`}
                            >
                              <Shield className="h-3.5 w-3.5" />
                            </button>

                            {/* Enable/Disable Toggle */}
                            {u.status === "ACTIVE" ? (
                              <button
                                type="button"
                                disabled={isLastAdmin}
                                onClick={() =>
                                  setConfirmDialog({ type: "disable", user: u })
                                }
                                title={
                                  isLastAdmin
                                    ? "Cannot disable final admin"
                                    : "Disable account"
                                }
                                className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-1.5 text-rose-300 hover:bg-rose-900/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDialog({ type: "enable", user: u })
                                }
                                title="Re-enable account"
                                className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-1.5 text-emerald-300 hover:bg-emerald-900/60 transition-colors"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Delete */}
                            <button
                              type="button"
                              disabled={isLastAdmin}
                              onClick={() =>
                                setConfirmDialog({ type: "delete", user: u })
                              }
                              title={
                                isLastAdmin
                                  ? "Cannot delete final admin"
                                  : "Delete account"
                              }
                              className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-1.5 text-rose-300 hover:bg-rose-900/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Security Audit Log */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Safe IP Hash</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-cyan-300">
                        {ev.type}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">
                        {ev.actorUsername || ev.actorId}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {ev.targetUsername || ev.targetId || "—"}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {new Date(ev.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[10px]">
                        {ev.ipHash.slice(0, 12)}...
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                        {ev.details ? JSON.stringify(ev.details) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 3: Admin Two-Factor Authentication (MFA) */}
      {activeTab === "mfa" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/60 p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-cyan-400" />
                  <span>ការផ្ទៀងផ្ទាត់ពីរកត្តា (Two-Factor Authentication / TOTP)</span>
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  ការពារគណនី ADMIN ដោយប្រើលេខកូដសម្ងាត់ ៦ ខ្ទង់ពី Google Authenticator, Microsoft Authenticator ឬ 1Password។
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-mono font-bold border ${
                  mfaEnabled
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {mfaEnabled ? "✓ បើកដំណើរការ (ENABLED)" : "○ បិទ (DISABLED)"}
              </span>
            </div>

            {mfaStatusMessage && (
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3 text-xs text-emerald-200">
                {mfaStatusMessage}
              </div>
            )}

            {mfaErrorMessage && (
              <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                {mfaErrorMessage}
              </div>
            )}

            {/* If MFA not enabled and not in setup flow */}
            {!mfaEnabled && !mfaQrSvg && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  នៅពេលបើកដំណើរការ រាល់ពេល Login ចូលគណនី Admin ប្រព័ន្ធនឹងទាមទារ Password បូកជាមួយលេខកូដ Authenticator App។
                </p>
                <button
                  type="button"
                  onClick={handleInitiateMfa}
                  disabled={mfaLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  <Shield className="h-4 w-4" />
                  <span>{mfaLoading ? "កំពុងរៀបចំ..." : "បើកដំណើរការ MFA (Enable Two-Factor)"}</span>
                </button>
              </div>
            )}

            {/* Active Setup Flow: QR Code SVG & Verification Code Input */}
            {!mfaEnabled && mfaQrSvg && (
              <div className="space-y-5 rounded-xl border border-cyan-500/40 bg-slate-950/80 p-5">
                <div className="text-xs font-semibold text-cyan-300">
                  ជំហានទី ១ ៖ ស្កេន QR Code ឬបញ្ចូល Manual Key ក្នុងកម្មវិធី Authenticator
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* QR SVG Container */}
                  <div
                    className="p-3 bg-white rounded-xl shadow-lg shrink-0 flex items-center justify-center w-[200px] h-[200px]"
                    dangerouslySetInnerHTML={{ __html: mfaQrSvg }}
                  />

                  <div className="space-y-3 text-xs text-slate-300">
                    <p>
                      បើកកម្មវិធី <strong>Google Authenticator</strong> រួចចុចសញ្ញា <strong>(+)</strong> ស្កេនរូប QR ខាងលើ។
                    </p>
                    {mfaManualKey && (
                      <div>
                        <span className="text-slate-400">Manual Setup Key:</span>
                        <div className="mt-1 font-mono text-sm font-bold text-cyan-300 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg select-all">
                          {mfaManualKey}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification Form */}
                <form onSubmit={handleVerifyMfa} className="space-y-3 border-t border-slate-800 pt-4">
                  <div className="text-xs font-semibold text-cyan-300">
                    ជំហានទី ២ ៖ បញ្ចូលលេខកូដ ៦ ខ្ទង់ដែលបង្ហាញក្នុង App ដើម្បីបញ្ជាក់
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      maxLength={6}
                      value={mfaVerificationCode}
                      onChange={(e) => setMfaVerificationCode(e.target.value)}
                      placeholder="123456"
                      className="w-40 rounded-xl border border-cyan-500/50 bg-slate-900 px-4 py-2 text-center text-lg font-mono font-bold text-white tracking-widest focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={mfaLoading || mfaVerificationCode.trim().length !== 6}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {mfaLoading ? "កំពុងផ្ទៀងផ្ទាត់..." : "បញ្ជាក់ & បើកដំណើរការ (Verify & Activate)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMfaQrSvg(null)}
                      className="text-xs text-slate-400 hover:text-rose-300 underline"
                    >
                      បោះបង់ (Cancel)
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Display Recovery Codes After Setup */}
            {mfaRecoveryCodes.length > 0 && (
              <div className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-950/30 p-5">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <AlertTriangle className="h-4 w-4" />
                  <span>កូដសង្គ្រោះគណនី (Backup Recovery Codes) — សូមកត់ទុកនៅកន្លែងមានសុវត្ថិភាព!</span>
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  កូដនីមួយៗអាចប្រើប្រាស់បានតែម្តងគត់ សម្រាប់ចូលប្រព័ន្ធក្នុងករណីលោកអ្នកបាត់ទូរស័ព្ទ ឬបាត់បង់ Authenticator App។
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                  {mfaRecoveryCodes.map((code, idx) => (
                    <div key={idx} className="bg-slate-950 border border-amber-500/40 p-2 rounded text-center text-amber-300 select-all font-bold">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* If MFA is currently active */}
            {mfaEnabled && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-slate-300">
                  គណនីអ្នកគ្រប់គ្រងរបស់អ្នកត្រូវបានការពារដោយ <strong>Two-Factor Authentication (TOTP)</strong> រួចរាល់ហើយ។
                </p>
                <button
                  type="button"
                  onClick={handleDisableMfa}
                  disabled={mfaLoading}
                  className="rounded-xl border border-rose-500/50 bg-rose-950/40 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-900/60 transition-all cursor-pointer"
                >
                  {mfaLoading ? "កំពុងដំណើរការ..." : "បិទដំណើរការ MFA (Disable 2FA)"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5b. Tab 4: Telegram Identity Linking */}
      {activeTab === "telegram" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-sky-500/30 bg-slate-900/60 p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="h-5 w-5 text-sky-400" />
                  <span>ភ្ជាប់ Telegram ជាមួយគណនី (Telegram Identity Linking)</span>
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  ភ្ជាប់គណនី Telegram របស់អ្នកសម្រាប់ការចូលប្រើប្រាស់ប្រកបដោយសុវត្ថិភាពខ្ពស់ និងរហ័ស។ ប្រើបានតែគណនីដែលមានស្រាប់ក្នុងប្រព័ន្ធប៉ុណ្ណោះ។
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-mono font-bold border ${
                  sessionUser?.telegramLinked
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {sessionUser?.telegramLinked ? "Telegram: បានភ្ជាប់" : "Telegram: មិនទាន់បានភ្ជាប់"}
              </span>
            </div>

            {telegramStatusMessage && (
              <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3 text-xs text-emerald-200">
                {telegramStatusMessage}
              </div>
            )}

            {telegramErrorMessage && (
              <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                {telegramErrorMessage}
              </div>
            )}

            {/* If Telegram is already linked */}
            {sessionUser?.telegramLinked ? (
              <div className="space-y-4 pt-2">
                <div className="rounded-xl border border-sky-500/20 bg-slate-950/60 p-4 space-y-2 text-xs">
                  <div className="text-slate-400">គណនី Telegram ដែលបានភ្ជាប់៖</div>
                  <div className="text-sm font-bold text-sky-300 font-mono">
                    {sessionUser.telegramUsername ? `@${sessionUser.telegramUsername}` : "Telegram Verified Account"}
                  </div>
                  {sessionUser.telegramLinkedAt && (
                    <div className="text-[11px] text-slate-500">
                      ភ្ជាប់នៅថ្ងៃទី {new Date(sessionUser.telegramLinkedAt).toLocaleString("km-KH")}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleUnlinkTelegram}
                    disabled={telegramLoading}
                    className="rounded-xl border border-rose-500/50 bg-rose-950/40 px-5 py-2.5 text-xs font-bold text-rose-300 hover:bg-rose-900/60 transition-all cursor-pointer font-khmer"
                  >
                    {telegramLoading ? "កំពុងដំណើរការ..." : "ផ្តាច់ Telegram"}
                  </button>
                  <p className="mt-2 text-[11px] text-slate-400 font-khmer">
                    ចំណាំ៖ អ្នកនៅតែអាចចូលប្រើប្រាស់ដោយប្រើពាក្យសម្ងាត់របស់អ្នកដដែលបន្ទាប់ពីផ្តាច់ Telegram។
                  </p>
                </div>
              </div>
            ) : (
              /* If Telegram is not linked */
              <div className="space-y-4 pt-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs leading-relaxed text-slate-300">
                  <p>
                    ប្រព័ន្ធសុវត្ថិភាពទាមទារការផ្ទៀងផ្ទាត់បញ្ហាប្រឈមតែម្តងគត់ (One-time Challenge) រវាងគណនីបច្ចុប្បន្ន និងអត្តសញ្ញាណ Telegram របស់អ្នក។
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-400">
                    <li>មិនបង្កើតគណនីថ្មីដោយស្វ័យប្រវត្តិទេ</li>
                    <li>អត្តសញ្ញាណ Telegram មួយ អាចភ្ជាប់បានតែគណនីមួយគត់</li>
                    <li>ព័ត៌មានអត្តសញ្ញាណ Telegram ត្រូវបានរក្សាទុកដោយការអ៊ិនគ្រីបកម្រិតខ្ពស់</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleStartTelegramLink}
                    disabled={telegramLoading}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-xs font-bold text-white shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer font-khmer"
                  >
                    <Send className="h-4 w-4" />
                    <span>{telegramLoading ? "កំពុងរៀបចំ..." : "ភ្ជាប់ Telegram"}</span>
                  </button>

                  <div id="telegram-admin-link-widget" className="pt-2 empty:hidden" />

                  {telegramChallengeToken && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>ប្រសិនបើផ្ទាំង Popup ត្រូវបានរារាំងដោយ Browser សូមចុច retry ឬអនុញ្ញាត Popup៖</span>
                      <button
                        type="button"
                        onClick={handleStartTelegramLink}
                        className="text-cyan-400 hover:underline font-mono"
                      >
                        [ព្យាយាមម្តងទៀត]
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Modal: Create Account */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2">
              <Plus className="h-5 w-5 text-cyan-400" />
              <span>បង្កើតគណនីថ្មី (Create Account)</span>
            </h2>

            {formError && (
              <div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              {/* Sample Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={handleUseAdminExample}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-950/50 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-900/70 transition-colors"
                  >
                    Use Admin Example
                  </button>
                  <button
                    type="button"
                    onClick={handleUseUserExample}
                    className="rounded-lg border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-900/70 transition-colors"
                  >
                    Use User Example
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors underline"
                >
                  Clear Form
                </button>
              </div>

              {/* 1. Name */}
              <div>
                <label className="text-xs font-semibold text-slate-300">
                  Name · ឈ្មោះអ្នកប្រើប្រាស់
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. user1, dayuth, plp1, admin"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  យ៉ាងហោចណាស់ ៤ តួអក្សរ
                </p>
              </div>

              {/* 2. Password */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Password · ពាក្យសម្ងាត់
                  </label>
                  <div className="flex items-center gap-2">
                    {customPassword && (
                      <button
                        type="button"
                        onClick={handleCopyCreatePassword}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                        title="Copy password"
                      >
                        {createPasswordCopied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400">បានចម្លង</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>ចម្លង (Copy)</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleGenerateSimplePassword}
                      className="text-[11px] text-slate-400 hover:text-cyan-300 underline transition-colors"
                    >
                      បង្កើតស្វ័យប្រវត្តិ (Generate)
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="e.g. abcd, 1234, user1, plp2026"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300"
                  >
                    {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  យ៉ាងហោចណាស់ ៤ តួអក្សរ
                </p>
              </div>

              {/* 3. Confirm Password */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Confirm Password · បញ្ជាក់ពាក្យសម្ងាត់
                </label>
                <div className="relative">
                  <input
                    type={showCreateConfirmPassword ? "text" : "password"}
                    value={newConfirmPassword}
                    onChange={(e) => setNewConfirmPassword(e.target.value)}
                    placeholder="Confirm Password (បញ្ជាក់ពាក្យសម្ងាត់)"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 pr-10 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreateConfirmPassword(!showCreateConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300"
                  >
                    {showCreateConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* 4. Role */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "ADMIN" | "USER")}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                >
                  <option value="USER">USER (Standard User)</option>
                  <option value="ADMIN">ADMIN (System Administrator)</option>
                </select>
              </div>

              {/* 5. Optional Details: Display Name & Email */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <span>
                    {showOptionalDetails
                      ? "− លាក់ព័ត៌មានបន្ថែម (Hide Optional Details)"
                      : "+ ព័ត៌មានបន្ថែម (Display Name & Email - Optional)"}
                  </span>
                </button>
                {showOptionalDetails && (
                  <div className="mt-3 space-y-3 pl-2 border-l border-slate-800">
                    <div>
                      <label className="text-xs font-semibold text-slate-400">
                        Display Name <span className="text-[10px] text-slate-500">(Optional / មិនបាច់ក៏បាន)</span>
                      </label>
                      <input
                        type="text"
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder="e.g. John Doe / លោក សុខ"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400">
                        Email <span className="text-[10px] text-slate-500">(Optional / មិនបាច់ក៏បាន)</span>
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="e.g. user@dyt-ecosystem.local"
                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors underline"
                >
                  Clear Form
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                  >
                    {formSubmitting ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Edit User */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2">
              <Edit className="h-5 w-5 text-cyan-400" />
              <span>កែប្រែគណនី (Edit Account: @{editModalUser.username})</span>
            </h2>

            {formError && (
              <div className="mt-3 rounded-xl border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Display Name</label>
                <input
                  type="text"
                  value={editModalUser.displayName}
                  onChange={(e) =>
                    setEditModalUser({ ...editModalUser, displayName: e.target.value })
                  }
                  required
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Email</label>
                <input
                  type="email"
                  value={editModalUser.email}
                  onChange={(e) =>
                    setEditModalUser({ ...editModalUser, email: e.target.value })
                  }
                  required
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                >
                  {formSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal: Temporary Password One-Time Display */}
      {tempPasswordDisplay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <KeyRound className="h-6 w-6" />
              <h3 className="font-bold text-base font-sans text-white">
                Temporary Password Generated
              </h3>
            </div>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              ពាក្យសម្ងាត់បណ្តោះអាសន្នសម្រាប់គណនី{" "}
              <strong className="text-cyan-300 font-mono">@{tempPasswordDisplay.username}</strong>{" "}
              ត្រូវបានបង្កើតឡើង។ សូមចម្លងទុកឥឡូវនេះ ព្រោះវានឹងមិនត្រូវបានបង្ហាញម្តងទៀតទេ (This password is shown only once):
            </p>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
              <code className="text-sm font-mono font-bold text-amber-200 select-all tracking-wider">
                {tempPasswordDisplay.password}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordDisplay.password);
                  setTempPasswordDisplay({ ...tempPasswordDisplay, isCopied: true });
                }}
                className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-900/40 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-800/60 transition-colors"
              >
                {tempPasswordDisplay.isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setTempPasswordDisplay(null)}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-bold text-slate-950 shadow hover:brightness-110"
              >
                Done (យល់ព្រម)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-rose-500/50 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <h3 className="font-bold text-base text-white font-sans">
                  {confirmDialog.type === "delete"
                    ? "Delete Account (លុបគណនី)"
                    : confirmDialog.type === "disable"
                    ? "Disable Account (បិទដំណើរការគណនី)"
                    : confirmDialog.type === "enable"
                    ? "Enable Account (បើកដំណើរការគណនី)"
                    : confirmDialog.type === "resetPassword"
                    ? "Reset Password (កំណត់ពាក្យសម្ងាត់ឡើងវិញ)"
                    : "Change Role (ប្តូរតួនាទី)"}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {confirmDialog.type === "delete"
                    ? `តើអ្នកប្រាកដថាចង់លុបគណនី @${confirmDialog.user.username} នេះមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់ថយក្រោយវិញបានទេ។`
                    : confirmDialog.type === "disable"
                    ? `តើអ្នកចង់បិទដំណើរការគណនី @${confirmDialog.user.username} មែនទេ? អ្នកប្រើប្រាស់នេះនឹងមិនអាចចូលប្រើប្រាស់បានទៀតទេ។`
                    : confirmDialog.type === "enable"
                    ? `តើអ្នកចង់បើកដំណើរការគណនី @${confirmDialog.user.username} ឡើងវិញមែនទេ?`
                    : confirmDialog.type === "resetPassword"
                    ? `កំណត់ពាក្យសម្ងាត់ថ្មី ឬពាក្យសម្ងាត់បណ្តោះអាសន្នសម្រាប់ @${confirmDialog.user.username} (យ៉ាងហោចណាស់ ៤ តួអក្សរ ឬទុកទំនេរដើម្បីបង្កើតស្វ័យប្រវត្តិ)៖`
                    : `ប្តូរតួនាទីរបស់ @${confirmDialog.user.username} ទៅជា ${confirmDialog.newRole}?`}
                </p>
                {confirmDialog.type === "resetPassword" && (
                  <div className="mt-3 space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 font-sans">
                        Password · ពាក្យសម្ងាត់ (ទុកទំនេរដើម្បីបង្កើតស្វ័យប្រវត្តិ):
                      </label>
                      <input
                        type="text"
                        value={resetPasswordInput}
                        onChange={(e) => setResetPasswordInput(e.target.value)}
                        placeholder="Password (e.g. 1234, abcd, user1 - យ៉ាងហោចណាស់ ៤ តួ)"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    {resetPasswordInput.trim() && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-300 font-sans">
                          Confirm Password · បញ្ជាក់ពាក្យសម្ងាត់:
                        </label>
                        <input
                          type="text"
                          value={resetConfirmPasswordInput}
                          onChange={(e) => setResetConfirmPasswordInput(e.target.value)}
                          placeholder="Confirm Password (បញ្ជាក់ពាក្យសម្ងាត់)"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={formSubmitting}
                onClick={handleExecuteConfirm}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-rose-500 transition-colors disabled:opacity-50"
              >
                {formSubmitting ? "Processing..." : "Confirm (យល់ព្រម)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
