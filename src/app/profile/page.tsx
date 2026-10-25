"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  User,
  Shield,
  KeyRound,
  Send,
  Lock,
  Users,
  Activity,
  Cloud,
  FileText,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Trash2,
  Edit,
  ExternalLink,
  ChevronRight,
  Clock,
  HardDrive,
  Calendar,
  Layers,
  ArrowRight,
  BarChart3,
  Sparkles,
  Sliders,
} from "lucide-react";
import { GoogleDriveOAuthSettings } from "@/components/drive/GoogleDriveOAuthSettings";
import { SystemSettingsTab } from "@/components/profile/SystemSettingsTab";
import { getOrRefreshCsrfToken, fetchFreshCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf-client";

interface SafeUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  status: "ACTIVE" | "DISABLED";
  mustChangePassword?: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  visiblePassword?: string | null;
  telegramLinked?: boolean;
  telegramUsername?: string;
  telegramLinkedAt?: number;
  googleDriveConnected?: boolean;
  googleDriveEmail?: string;
}

interface UserActivitySummary {
  userId: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  totalActions: number;
  lastActiveAt: number;
  moduleBreakdown: Record<string, number>;
}

interface ActivityRecord {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  module: string;
  action: string;
  title: string;
  details?: Record<string, any>;
  timestamp: number;
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

type ProfileTab = "profile" | "password" | "security" | "activity" | "users" | "drive" | "settings" | "audit";

function ProfileHubInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active User & Session State
  const [currentUser, setCurrentUser] = useState<SafeUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [loading, setLoading] = useState(true);

  // Status & Notification Banners
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Tab 1: Profile Edit State
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Tab 2: Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Tab 3: Telegram & MFA State
  const [telegramConfig, setTelegramConfig] = useState<{ enabled: boolean; botUsername: string } | null>(null);
  const [telegramChallengeToken, setTelegramChallengeToken] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaQrSvg, setMfaQrSvg] = useState<string | null>(null);
  const [mfaManualKey, setMfaManualKey] = useState<string | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [mfaCopied, setMfaCopied] = useState(false);

  // Tab 4: Activity Tracking State (ADMIN & SUPER_ADMIN)
  const [activityTotalCount, setActivityTotalCount] = useState(0);
  const [activityUserSummaries, setActivityUserSummaries] = useState<UserActivitySummary[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityRecord[]>([]);
  const [selectedDrillDownUser, setSelectedDrillDownUser] = useState<UserActivitySummary | null>(null);
  const [drillDownLogs, setDrillDownLogs] = useState<ActivityRecord[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  // Tab 5: User Management State (SUPER_ADMIN only)
  const [allUsers, setAllUsers] = useState<SafeUser[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<SafeUser | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "delete" | "disable" | "enable" | "resetPassword";
    user: SafeUser;
  } | null>(null);

  // User Creation Form
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState<"SUPER_ADMIN" | "ADMIN" | "USER">("USER");
  const [newCustomPassword, setNewCustomPassword] = useState("");
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);
  const [tempPasswordDisplay, setTempPasswordDisplay] = useState<{ username: string; password: string } | null>(null);

  // Tab 6 & 7: Audit Logs State (SUPER_ADMIN only)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Clear messages after 5 seconds
  const showSuccess = (msg: string) => {
    setSuccessBanner(msg);
    setErrorBanner(null);
    setTimeout(() => setSuccessBanner(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorBanner(msg);
    setSuccessBanner(null);
  };

  // Sync initial tab from URL query (?tab=...)
  useEffect(() => {
    const tabParam = searchParams.get("tab") as ProfileTab;
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Strict RBAC Tab Guard: Redirect unauthorized tab attempts back to profile
  useEffect(() => {
    if (!currentUser) return;
    const allowedTabs: ProfileTab[] =
      currentUser.role === "SUPER_ADMIN"
        ? ["profile", "password", "security", "activity", "users", "drive", "settings", "audit"]
        : currentUser.role === "ADMIN"
        ? ["profile", "password", "security", "activity"]
        : ["profile", "password", "security"];

    if (!allowedTabs.includes(activeTab)) {
      setActiveTab("profile");
    }
  }, [currentUser, activeTab]);

  // Load Session & Profile
  const fetchSessionAndProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/session?_t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (data.authenticated && data.user) {
        setCurrentUser(data.user);
        setEditDisplayName(data.user.displayName || "");
        setEditUsername(data.user.username || "");
        setEditEmail(data.user.email || "");
      }
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
    } catch {
      showError("Failed to load user session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessionAndProfile();
  }, [fetchSessionAndProfile]);

  // Load Activity Tracking (ADMIN or SUPER_ADMIN)
  const fetchActivityOverview = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch("/api/admin/activity-tracking", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setActivityTotalCount(data.totalActivities || 0);
        setActivityUserSummaries(data.userSummaries || []);
        setRecentActivities(data.recentActivities || []);
      }
    } catch {}
    finally {
      setActivityLoading(false);
    }
  }, []);

  // Load User Drill-Down History
  const fetchUserDrillDown = async (summary: UserActivitySummary) => {
    setSelectedDrillDownUser(summary);
    setDrillDownLoading(true);
    try {
      const res = await fetch(`/api/admin/activity-tracking?userId=${encodeURIComponent(summary.userId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDrillDownLogs(data.activities || []);
      }
    } catch {
      setDrillDownLogs([]);
    } finally {
      setDrillDownLoading(false);
    }
  };

  // Load User Management List (SUPER_ADMIN only)
  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setAllUsers(data.users || []);
      }
    } catch {}
    finally {
      setUsersLoading(false);
    }
  }, []);

  // Load Audit Logs (SUPER_ADMIN only)
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/admin/audit-log?limit=100", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setAuditEvents(data.events || []);
      }
    } catch {}
    finally {
      setAuditLoading(false);
    }
  }, []);

  // Load Telegram & MFA Info
  const fetchTelegramAndMfa = useCallback(async () => {
    try {
      const telRes = await fetch("/api/auth/telegram/config");
      const telData = await telRes.json().catch(() => ({}));
      if (telData.enabled) {
        setTelegramConfig(telData);
      }

      const mfaRes = await fetch("/api/admin/mfa", { credentials: "include" });
      const mfaData = await mfaRes.json().catch(() => ({}));
      if (mfaRes.ok) {
        setMfaEnabled(Boolean(mfaData.mfaEnabled));
      }
    } catch {}
  }, []);

  // Fetch data on active tab change
  useEffect(() => {
    if (!currentUser) return;

    if (activeTab === "activity" && (currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN")) {
      fetchActivityOverview();
    } else if (activeTab === "users" && currentUser.role === "SUPER_ADMIN") {
      fetchAllUsers();
    } else if (activeTab === "audit" && currentUser.role === "SUPER_ADMIN") {
      fetchAuditLogs();
    } else if (activeTab === "security") {
      fetchTelegramAndMfa();
    }
  }, [activeTab, currentUser, fetchActivityOverview, fetchAllUsers, fetchAuditLogs, fetchTelegramAndMfa]);

  const getCsrf = async (): Promise<string> => {
    return csrfToken || (await getOrRefreshCsrfToken()) || "";
  };

  // Tab 1 Action: Update Personal Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setErrorBanner(null);

    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          username: editUsername.trim().toLowerCase(),
          email: editEmail.trim().toLowerCase(),
          csrfToken: activeCsrf,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setCurrentUser(data.user);
      showSuccess(data.message || "ព័ត៌មានផ្ទាល់ខ្លួនត្រូវបានកែប្រែជោគជ័យ (Profile updated)!");
    } catch (err: any) {
      showError(err.message || "Could not update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  // Tab 2 Action: Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showError("ពាក្យសម្ងាត់ថ្មីទាំងពីរមិនដូចគ្នាទេ (Passwords do not match)");
      return;
    }

    setPasswordSaving(true);
    setErrorBanner(null);

    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
          csrfToken: activeCsrf,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccess("ពាក្យសម្ងាត់ត្រូវបានផ្លាស់ប្តូរដោយជោគជ័យ (Password changed successfully)!");
    } catch (err: any) {
      showError(err.message || "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Tab 3 Actions: Telegram & MFA
  const handleStartTelegramLink = async () => {
    setTelegramLoading(true);
    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/auth/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({ csrfToken: activeCsrf }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.challengeToken) {
        setTelegramChallengeToken(data.challengeToken);
      }
    } catch {
      showError("Could not generate Telegram link challenge.");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({ action: "setup", csrfToken: activeCsrf }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMfaQrSvg(data.qrSvg || null);
        setMfaManualKey(data.manualKey || null);
      } else {
        showError(data.error || "Failed to start 2FA setup");
      }
    } catch {
      showError("Could not initialize 2FA setup.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfaSetup = async () => {
    if (!mfaVerificationCode.trim()) return;
    setMfaLoading(true);
    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({
          action: "enable",
          totpCode: mfaVerificationCode.trim(),
          csrfToken: activeCsrf,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMfaEnabled(true);
        setMfaQrSvg(null);
        setMfaManualKey(null);
        setMfaRecoveryCodes(data.recoveryCodes || []);
        showSuccess("2FA TOTP បានបើកដំណើរការដោយជោគជ័យ (2FA Enabled)!");
      } else {
        showError(data.error || "Invalid 2FA Verification Code");
      }
    } catch {
      showError("Failed to verify 2FA code.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!confirm("តើអ្នកពិតជាចង់បិទ 2FA មែនទេ? (Are you sure you want to disable 2FA?)")) return;
    setMfaLoading(true);
    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({ action: "disable", csrfToken: activeCsrf }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMfaEnabled(false);
        setMfaRecoveryCodes([]);
        showSuccess("2FA ត្រូវបានបិទដោយជោគជ័យ (2FA Disabled).");
      }
    } catch {
      showError("Could not disable 2FA.");
    } finally {
      setMfaLoading(false);
    }
  };

  // Tab 5 Actions: User Management (SUPER_ADMIN)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormSubmitting(true);
    setErrorBanner(null);

    try {
      const activeCsrf = await getCsrf();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({
          username: newUsername.trim().toLowerCase(),
          email: newEmail.trim().toLowerCase(),
          displayName: newDisplayName.trim(),
          role: newRole,
          password: newCustomPassword.trim() || undefined,
          csrfToken: activeCsrf,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      setCreateModalOpen(false);
      setNewUsername("");
      setNewEmail("");
      setNewDisplayName("");
      setNewCustomPassword("");
      fetchAllUsers();

      if (data.temporaryPassword) {
        setTempPasswordDisplay({
          username: data.user.username,
          password: data.temporaryPassword,
        });
      }

      showSuccess(`គណនី ${data.user.username} ត្រូវបានបង្កើតជោគជ័យ (Account created)!`);
    } catch (err: any) {
      showError(err.message || "Failed to create user account");
    } finally {
      setUserFormSubmitting(false);
    }
  };

  const handleConfirmUserAction = async () => {
    if (!confirmDialog) return;
    const { type, user } = confirmDialog;
    setConfirmDialog(null);

    try {
      const activeCsrf = await getCsrf();

      if (type === "delete") {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: "DELETE",
          headers: { [CSRF_HEADER_NAME]: activeCsrf },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to delete user");
        showSuccess(`បានលុបគណនី ${user.username} រួចរាល់ (User deleted).`);
        fetchAllUsers();
      } else if (type === "disable") {
        const res = await fetch(`/api/admin/users/${user.id}/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: activeCsrf,
          },
          body: JSON.stringify({ csrfToken: activeCsrf }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to disable user");
        showSuccess(`បានបិទគណនី ${user.username} (User disabled).`);
        fetchAllUsers();
      } else if (type === "enable") {
        const res = await fetch(`/api/admin/users/${user.id}/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: activeCsrf,
          },
          body: JSON.stringify({ csrfToken: activeCsrf }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to enable user");
        showSuccess(`បានបើកដំណើរការគណនី ${user.username} (User enabled).`);
        fetchAllUsers();
      } else if (type === "resetPassword") {
        const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: activeCsrf,
          },
          body: JSON.stringify({ csrfToken: activeCsrf }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to reset password");
        if (data.temporaryPassword) {
          setTempPasswordDisplay({
            username: user.username,
            password: data.temporaryPassword,
          });
        }
        showSuccess(`បានកំណត់លេខសម្ងាត់ថ្មីសម្រាប់ ${user.username} រួចរាល់!`);
      }
    } catch (err: any) {
      showError(err.message || "Action failed");
    }
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;

    try {
      const activeCsrf = await getCsrf();
      const res = await fetch(`/api/admin/users/${editModalUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: activeCsrf,
        },
        body: JSON.stringify({
          displayName: editModalUser.displayName,
          email: editModalUser.email,
          role: editModalUser.role,
          csrfToken: activeCsrf,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update user");

      setEditModalUser(null);
      showSuccess(`បានកែសម្រួលគណនី ${data.user.username} ជោគជ័យ!`);
      fetchAllUsers();
    } catch (err: any) {
      showError(err.message || "Failed to update user");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-slate-400 font-mono">កំពុងផ្ទុកព័ត៌មាន Profile...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl border border-rose-500/30 bg-rose-950/20 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-2">មិនទាន់ចូលគណនី (Unauthorized)</h2>
        <p className="text-sm text-slate-400 mb-4">សូមចូលគណនីដើម្បីចូលប្រើប្រាស់ទំព័រ Profile Hub</p>
        <button
          onClick={() => router.push("/login")}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-all"
        >
          ចូលគណនី (Go to Login)
        </button>
      </div>
    );
  }

  // Filtered Users for Tab 5
  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ── Hub Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-cyan-500/20 font-bold text-xl">
              {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : currentUser.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                  {currentUser.displayName || currentUser.username}
                </h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${
                    currentUser.role === "SUPER_ADMIN"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                      : currentUser.role === "ADMIN"
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {currentUser.role === "SUPER_ADMIN" ? "👑 SUPER ADMIN" : currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                @{currentUser.username} • {currentUser.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10 text-xs font-mono text-slate-400">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Last active: {currentUser.lastLoginAt ? new Date(currentUser.lastLoginAt).toLocaleString() : "Just now"}</span>
          </div>
        </div>

        {/* ── Notification Banners ── */}
        {successBanner && (
          <div className="p-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-sm flex items-center gap-3 backdrop-blur-md animate-in fade-in">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {errorBanner && (
          <div className="p-4 rounded-2xl border border-rose-500/40 bg-rose-950/40 text-rose-200 text-sm flex items-center gap-3 backdrop-blur-md animate-in fade-in">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
        )}

        {/* ── Navigation Tabs Scoped Strictly by Role ── */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {/* USER Tabs */}
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeTab === "profile"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <User className="h-4 w-4" />
            <span>ព័ត៌មានផ្ទាល់ខ្លួន (Profile)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("password")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeTab === "password"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            <span>លេខសម្ងាត់ (Password)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              activeTab === "security"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>Telegram & 2FA</span>
          </button>

          {/* ADMIN & SUPER_ADMIN Tabs: Activity Tracking */}
          {(currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN") && (
            <button
              type="button"
              onClick={() => setActiveTab("activity")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeTab === "activity"
                  ? "bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <BarChart3 className="h-4 w-4 text-indigo-400" />
              <span>តាមដានសកម្មភាព (Activity Tracking)</span>
            </button>
          )}

          {/* SUPER_ADMIN Tabs: User Management, Google Drive, Audit Logs */}
          {currentUser.role === "SUPER_ADMIN" && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === "users"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Users className="h-4 w-4 text-amber-400" />
                <span>គ្រប់គ្រងអ្នកប្រើប្រាស់ (User Management)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("drive")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === "drive"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Cloud className="h-4 w-4 text-sky-400" />
                <span>Google Drive Storage</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === "settings"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Sliders className="h-4 w-4 text-emerald-400" />
                <span>ការកំណត់ប្រព័ន្ធ (Settings)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("audit")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  activeTab === "audit"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <FileText className="h-4 w-4 text-purple-400" />
                <span>Audit Logs & System</span>
              </button>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB 1: Personal Profile (All Roles)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "profile" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-5">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="h-4 w-4 text-cyan-400" />
                  <span>កែប្រែព័ត៌មានផ្ទាល់ខ្លួន (Edit Personal Information)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  អ្នកអាចផ្លាស់ប្តូរឈ្មោះបង្ហាញ (Display Name), ឈ្មោះអ្នកប្រើប្រាស់ (Username) និងអ៊ីមែលបាននៅទីនេះ។
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                    ឈ្មោះបង្ហាញ (Display Name)
                  </label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="ឈ្មោះរបស់អ្នក"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                      ឈ្មោះគណនី (Username)
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm font-mono text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="username"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                      អ៊ីមែល (Email)
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="user@dyt-ecosystem.local"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
                  >
                    {profileSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>កំពុងរក្សាទុក...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>រក្សាទុកព័ត៌មាន (Save Changes)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Account Metadata Card */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-400" />
                <span>ព័ត៌មានសន្តិសុខគណនី (Account Meta)</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">User ID:</span>
                  <span className="font-mono text-slate-300 text-[11px] select-all">{currentUser.id}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Role:</span>
                  <span className="font-mono text-cyan-300 font-bold">{currentUser.role}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Status:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ACTIVE
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80">
                  <span className="text-slate-400">Joined:</span>
                  <span className="text-slate-300">{new Date(currentUser.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: Change Password (All Roles)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "password" && (
          <div className="max-w-2xl p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-400" />
                <span>ផ្លាស់ប្តូរលេខសម្ងាត់ (Change Password)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                សូមបញ្ចូលលេខសម្ងាត់ចាស់ និងលេខសម្ងាត់ថ្មីដែលមានសុវត្ថិភាពខ្ពស់។
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                  លេខសម្ងាត់បច្ចុប្បន្ន (Current Password)
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white pr-10 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                  លេខសម្ងាត់ថ្មី (New Password)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white pr-10 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 font-sans">
                  បញ្ជាក់លេខសម្ងាត់ថ្មី (Confirm New Password)
                </label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  placeholder="••••••••"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
                >
                  {passwordSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>កំពុងផ្លាស់ប្តូរ...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>ផ្លាស់ប្តូរលេខសម្ងាត់ (Update Password)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: Telegram & Two-Factor Authentication (All Roles)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Telegram Account Linking */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="h-4 w-4 text-sky-400" />
                  <span>Telegram Login Link</span>
                </h3>
                {currentUser.telegramLinked ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Linked
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Not Linked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                ភ្ជាប់គណនី Telegram របស់អ្នកជាមួយ DYT Platform ដើម្បីទទួលការជូនដំណឹង និងចូលប្រើប្រាស់ដោយសុវត្ថិភាព។
              </p>

              {currentUser.telegramLinked ? (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>គណនី Telegram បានភ្ជាប់រួចរាល់ ({currentUser.telegramUsername ? `@${currentUser.telegramUsername}` : "Active"})</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleStartTelegramLink}
                    disabled={telegramLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all disabled:opacity-50"
                  >
                    {telegramLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    <span>បង្កើតកូដភ្ជាប់ Telegram (Generate Link Token)</span>
                  </button>

                  {telegramChallengeToken && telegramConfig && (
                    <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-950/30 space-y-2 text-xs">
                      <p className="text-slate-300 font-medium">សូមផ្ញើកូដនេះទៅកាន់ Bot របស់អ្នក៖</p>
                      <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-cyan-300 font-bold text-center select-all border border-slate-800">
                        /start {telegramChallengeToken}
                      </div>
                      <a
                        href={`https://t.me/${telegramConfig.botUsername}?start=${telegramChallengeToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 underline font-medium"
                      >
                        <span>បើក Bot ក្នុង Telegram</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2FA TOTP Authenticator */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="h-4 w-4 text-indigo-400" />
                  <span>Two-Factor Authentication (2FA TOTP)</span>
                </h3>
                {mfaEnabled ? (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Active
                  </span>
                ) : (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                បន្ថែមស្រទាប់សុវត្ថិភាពជាមួយ Google Authenticator ឬ 1Password។
              </p>

              {mfaEnabled ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>2FA បានបើកដំណើរការដោយជោគជ័យ។</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisableMfa}
                    disabled={mfaLoading}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-950/40 text-xs transition-colors"
                  >
                    បិទដំណើរការ 2FA (Disable 2FA)
                  </button>
                </div>
              ) : mfaQrSvg ? (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/90 space-y-3 text-xs">
                  <p className="text-slate-300 font-medium">ស្កេន QR Code ខាងក្រោមដោយប្រើ Authenticator App៖</p>
                  <div
                    className="w-48 h-48 mx-auto bg-white p-2 rounded-xl flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: mfaQrSvg }}
                  />
                  {mfaManualKey && (
                    <div className="text-center font-mono text-[11px] text-slate-400">
                      Secret Key: <span className="text-cyan-300 select-all">{mfaManualKey}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mfaVerificationCode}
                      onChange={(e) => setMfaVerificationCode(e.target.value)}
                      placeholder="កូដ 6 ខ្ទង់"
                      maxLength={6}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm font-mono text-center text-white"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyMfaSetup}
                      disabled={mfaLoading}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-all"
                    >
                      ផ្ទៀងផ្ទាត់ (Verify)
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartMfaSetup}
                  disabled={mfaLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-all disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>ដំឡើង 2FA (Setup 2FA Authenticator)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 4: Activity Tracking Dashboard (ADMIN & SUPER_ADMIN)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "activity" && (currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN") && (
          <div className="space-y-6">
            {/* Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl border border-indigo-500/30 bg-slate-900/60 backdrop-blur-xl">
                <span className="text-xs font-semibold text-slate-400 font-sans">សមាជិកដែលបានធ្វើការ (Active Members)</span>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-white mt-1">
                  {activityUserSummaries.length} <span className="text-xs text-indigo-400 font-sans font-normal">នាក់</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl">
                <span className="text-xs font-semibold text-slate-400 font-sans">ប្រតិបត្តិការសរុប (Total Operations)</span>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-cyan-300 mt-1">
                  {activityTotalCount} <span className="text-xs text-cyan-400 font-sans font-normal">ដង</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-emerald-500/30 bg-slate-900/60 backdrop-blur-xl">
                <span className="text-xs font-semibold text-slate-400 font-sans">ប្រព័ន្ធតាមដាន (Tracking Mode)</span>
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm sm:text-base mt-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Silent Auto-Telemetry</span>
                </div>
              </div>
            </div>

            {/* Member Activity Breakdown Table */}
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-400" />
                    <span>សង្ខេបសកម្មភាពតាមសមាជិក (Team Activity Summary)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ចុចលើឈ្មោះសមាជិកដើម្បីមើលព័ត៌មានលម្អិតពីចំណុចការងារ និងម៉ោងជាក់លាក់ (Drill-Down View)។
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchActivityOverview}
                  className="p-2 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white"
                  title="Refresh Activity"
                >
                  <RefreshCw className={`h-4 w-4 ${activityLoading ? "animate-spin text-cyan-400" : ""}`} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-3">សមាជិក (Member)</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">ចំនួនដង (Total Actions)</th>
                      <th className="py-3 px-3">ម៉ូឌុលដែលបានប្រើ (Modules Breakdown)</th>
                      <th className="py-3 px-3">សកម្មភាពចុងក្រោយ (Last Active)</th>
                      <th className="py-3 px-3 text-right">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activityUserSummaries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                          មិនទាន់មានទិន្នន័យសកម្មភាពនៅឡើយ (No activity recorded yet)
                        </td>
                      </tr>
                    ) : (
                      activityUserSummaries.map((summary) => (
                        <tr
                          key={summary.userId}
                          onClick={() => fetchUserDrillDown(summary)}
                          className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                        >
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                              {summary.displayName}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">@{summary.username}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                summary.role === "SUPER_ADMIN"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : summary.role === "ADMIN"
                                  ? "bg-indigo-500/20 text-indigo-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {summary.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-cyan-400 text-sm">
                            {summary.totalActions}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(summary.moduleBreakdown).map(([mod, count]) => (
                                <span
                                  key={mod}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 font-mono"
                                >
                                  {mod.replace(/^0\d_/, "")}: <b className="text-cyan-400">{count}</b>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                            {new Date(summary.lastActiveAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 group-hover:bg-indigo-500/40 text-indigo-300 text-[11px] font-medium transition-colors"
                            >
                              មើលលម្អិត &rarr;
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drill-Down Details Modal / Section */}
            {selectedDrillDownUser && (
              <div className="p-6 rounded-2xl border border-cyan-500/40 bg-slate-900/90 backdrop-blur-xl space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold">
                      {selectedDrillDownUser.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        ប្រវត្តិកិច្ចការលម្អិតរបស់ {selectedDrillDownUser.displayName} (@{selectedDrillDownUser.username})
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        សរុប {drillDownLogs.length} សកម្មភាពជាក់ស្តែង
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDrillDownUser(null)}
                    className="text-xs px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    បិទផ្ទាំង (Close)
                  </button>
                </div>

                {drillDownLoading ? (
                  <div className="py-8 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                    <span>កំពុងទាញយកប្រវត្តិកិច្ចការ...</span>
                  </div>
                ) : drillDownLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center font-mono">គ្មានប្រវត្តិលម្អិតឡើយ</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {drillDownLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl border border-slate-800/80 bg-slate-950/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[10px] font-semibold border border-cyan-500/30">
                              {log.module}
                            </span>
                            <span className="font-semibold text-slate-200">{log.action}</span>
                          </div>
                          <p className="text-slate-300 font-sans text-xs">{log.title}</p>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 shrink-0">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 5: User Management (SUPER_ADMIN ONLY)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "users" && currentUser.role === "SUPER_ADMIN" && (
          <div className="space-y-5">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="ស្វែងរកឈ្មោះ, គណនី, អ៊ីមែល ឬ Role..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchAllUsers}
                  className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${usersLoading ? "animate-spin text-amber-400" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-500/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>បង្កើតអ្នកប្រើប្រាស់ថ្មី (Add User)</span>
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-mono uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">ឈ្មោះ និងគណនី (User)</th>
                      <th className="py-3 px-4">អ៊ីមែល (Email)</th>
                      <th className="py-3 px-4">សិទ្ធិ (Role)</th>
                      <th className="py-3 px-4">ស្ថានភាព (Status)</th>
                      <th className="py-3 px-4">ចូលចុងក្រោយ (Last Login)</th>
                      <th className="py-3 px-4 text-right">ឧបករណ៍គ្រប់គ្រង (Actions)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-mono">
                          រកមិនឃើញអ្នកប្រើប្រាស់ឡើយ (No users found)
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white font-sans">{user.displayName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">@{user.username}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{user.email}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                user.role === "SUPER_ADMIN"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  : user.role === "ADMIN"
                                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {user.status === "ACTIVE" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ACTIVE
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-[11px]">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> DISABLED
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => setEditModalUser({ ...user })}
                                className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                                title="Edit User"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>

                              {/* Reset Password Button */}
                              <button
                                type="button"
                                onClick={() => setConfirmDialog({ type: "resetPassword", user })}
                                className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60"
                                title="Reset Temporary Password"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>

                              {/* Enable / Disable Button */}
                              {user.status === "ACTIVE" ? (
                                <button
                                  type="button"
                                  disabled={user.id === currentUser.id}
                                  onClick={() => setConfirmDialog({ type: "disable", user })}
                                  className="p-1.5 rounded-lg border border-amber-500/30 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 disabled:opacity-30"
                                  title="Disable User"
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDialog({ type: "enable", user })}
                                  className="p-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                                  title="Enable User"
                                >
                                  <UserCheck className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Delete Button */}
                              <button
                                type="button"
                                disabled={user.id === currentUser.id}
                                onClick={() => setConfirmDialog({ type: "delete", user })}
                                className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 disabled:opacity-30"
                                title="Delete User"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create User Modal */}
            {createModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="w-full max-w-md p-6 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Plus className="h-4 w-4 text-amber-400" />
                      <span>បង្កើតអ្នកប្រើប្រាស់ថ្មី (Add User)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      &times;
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">ឈ្មោះបង្ហាញ (Display Name)</label>
                      <input
                        type="text"
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                        placeholder="ឧ. សុខ សាន"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">ឈ្មោះគណនី (Username)</label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono"
                        placeholder="username"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">អ៊ីមែល (Email)</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        placeholder="user@dyt-ecosystem.local"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">សិទ្ធិ (Role)</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold"
                      >
                        <option value="USER">USER (អ្នកផលិតមាតិកា)</option>
                        <option value="ADMIN">ADMIN (អ្នកគ្រប់គ្រង Activity Tracking)</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN (ម្ចាស់ប្រព័ន្ធពេញសិទ្ធិ)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        លេខសម្ងាត់ដំបូង (Custom Password - ទុកទទេដើម្បីបង្កើតស្វ័យប្រវត្តិ)
                      </label>
                      <input
                        type="text"
                        value={newCustomPassword}
                        onChange={(e) => setNewCustomPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        placeholder="ទុកទទេដើម្បីបង្កើតលេខសម្ងាត់បណ្តោះអាសន្ន"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setCreateModalOpen(false)}
                        className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                      >
                        បោះបង់
                      </button>
                      <button
                        type="submit"
                        disabled={userFormSubmitting}
                        className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md"
                      >
                        {userFormSubmitting ? "កំពុងបង្កើត..." : "បង្កើតគណនី (Create)"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit User Modal */}
            {editModalUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="w-full max-w-md p-6 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Edit className="h-4 w-4 text-cyan-400" />
                      <span>កែប្រែគណនី @{editModalUser.username}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditModalUser(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      &times;
                    </button>
                  </div>

                  <form onSubmit={handleEditUserSubmit} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">ឈ្មោះបង្ហាញ (Display Name)</label>
                      <input
                        type="text"
                        value={editModalUser.displayName}
                        onChange={(e) => setEditModalUser({ ...editModalUser, displayName: e.target.value })}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">អ៊ីមែល (Email)</label>
                      <input
                        type="email"
                        value={editModalUser.email}
                        onChange={(e) => setEditModalUser({ ...editModalUser, email: e.target.value })}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">សិទ្ធិ (Role)</label>
                      <select
                        value={editModalUser.role}
                        onChange={(e) => setEditModalUser({ ...editModalUser, role: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold"
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setEditModalUser(null)}
                        className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
                      >
                        បោះបង់
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-md"
                      >
                        រក្សាទុក (Save Changes)
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Confirm Action Dialog */}
            {confirmDialog && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="w-full max-w-sm p-6 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-4">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span>បញ្ជាក់ប្រតិបត្តិការ (Confirmation)</span>
                  </h4>
                  <p className="text-xs text-slate-300">
                    តើអ្នកប្រាកដជាចង់ធ្វើសកម្មភាព{" "}
                    <b className="text-amber-300 uppercase">{confirmDialog.type}</b> ទៅលើគណនី{" "}
                    <b>@{confirmDialog.user.username}</b> មែនទេ?
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDialog(null)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs"
                    >
                      បោះបង់
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmUserAction}
                      className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                    >
                      យល់ព្រម (Confirm)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Temporary Password Modal */}
            {tempPasswordDisplay && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="w-full max-w-sm p-6 rounded-3xl border border-emerald-500/50 bg-slate-900 shadow-2xl space-y-4 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-bold text-white">លេខសម្ងាត់បណ្តោះអាសន្ន</h4>
                  <p className="text-xs text-slate-400">
                    សម្រាប់គណនី <b className="text-white">@{tempPasswordDisplay.username}</b>៖
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-emerald-300 font-bold text-base select-all">
                    {tempPasswordDisplay.password}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(tempPasswordDisplay.password);
                      setTempPasswordDisplay(null);
                      showSuccess("បានចម្លងលេខសម្ងាត់រួចរាល់!");
                    }}
                    className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    ចម្លង និងបិទ (Copy & Close)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 6: Google Drive Storage (SUPER_ADMIN ONLY)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "drive" && currentUser.role === "SUPER_ADMIN" && (
          <div className="space-y-4">
            <GoogleDriveOAuthSettings />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: System Settings (SUPER_ADMIN ONLY)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && currentUser.role === "SUPER_ADMIN" && (
          <SystemSettingsTab />
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB 7: Audit Logs & System (SUPER_ADMIN ONLY)
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === "audit" && currentUser.role === "SUPER_ADMIN" && (
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-400" />
                  <span>Security Audit Logs</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  កត់ត្រារាល់សកម្មភាពសន្តិសុខប្រព័ន្ធ (IP, User Mutation, Auth Events)។
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAuditLogs}
                className="p-2 rounded-xl border border-slate-800 bg-slate-950/60 text-slate-300 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${auditLoading ? "animate-spin text-purple-400" : ""}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">IP Hash</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditEvents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        គ្មានកំណត់ត្រា Audit ឡើយ
                      </td>
                    </tr>
                  ) : (
                    auditEvents.map((evt) => (
                      <tr key={evt.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-purple-300 font-bold">{evt.type}</td>
                        <td className="py-2 px-3 text-slate-300">{evt.actorUsername || "system"}</td>
                        <td className="py-2 px-3 text-slate-400">{evt.targetUsername || "-"}</td>
                        <td className="py-2 px-3 text-slate-500 text-[10px]">{evt.ipHash}</td>
                        <td className="py-2 px-3 text-slate-400">{new Date(evt.timestamp).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfileHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <ProfileHubInner />
    </Suspense>
  );
}
