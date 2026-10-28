"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  User,
  Mail,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Camera,
  Edit2,
  Save,
  X,
  Trash2,
} from "lucide-react";
import { getOrRefreshCsrfToken, CSRF_HEADER_NAME } from "@/lib/csrf-client";

export interface ProfileUserData {
  id?: string;
  username: string;
  email: string;
  role: string;
  displayName?: string;
  status?: string;
  createdAt?: number;
  lastLoginAt?: number;
  avatar?: string;
}

interface ProfileManagerProps {
  initialUser?: ProfileUserData | null;
  onUserUpdated?: (user: ProfileUserData) => void;
}

export function ProfileManager({ initialUser, onUserUpdated }: ProfileManagerProps) {
  const [user, setUser] = useState<ProfileUserData | null>(initialUser || null);
  const [loadingUser, setLoadingUser] = useState(!initialUser);

  // Username edit state
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Password reset state
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Feedback states
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setEditedUsername(initialUser.username);
      setAvatarPreview(initialUser.avatar || null);
      setLoadingUser(false);
      return;
    }

    let isMounted = true;
    async function fetchProfile() {
      try {
        const res = await fetch("/api/auth/profile");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.user) {
            setUser(data.user);
            setEditedUsername(data.user.username);
            setAvatarPreview(data.user.avatar || null);
          }
        }
      } catch {
        try {
          const sRes = await fetch("/api/auth/session");
          if (sRes.ok) {
            const sData = await sRes.json();
            if (isMounted && sData.user) {
              setUser(sData.user);
              setEditedUsername(sData.user.username);
              setAvatarPreview(sData.user.avatar || null);
            }
          }
        } catch {}
      } finally {
        if (isMounted) setLoadingUser(false);
      }
    }

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [initialUser]);

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // 1. Edit & Save Username
  const handleSaveUsername = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    const trimmed = editedUsername.trim().toLowerCase();
    if (!trimmed) {
      setErrorMessage("Username cannot be empty.");
      return;
    }

    if (trimmed === user.username.toLowerCase()) {
      setIsEditingUsername(false);
      return;
    }

    setSavingUsername(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const csrfToken = await getOrRefreshCsrfToken();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify({
          username: trimmed,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update username.");
      }

      setUser(data.user);
      setEditedUsername(data.user.username);
      setIsEditingUsername(false);
      setSuccessMessage("Username updated successfully!");
      if (onUserUpdated) onUserUpdated(data.user);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save username.");
    } finally {
      setSavingUsername(false);
    }
  };

  // 2. Avatar / Profile Picture Upload Validation & Selection
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate MIME type
    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      setErrorMessage("ប្រភេទឯកសារមិនត្រឹមត្រូវ។ សូមជ្រើសរើសរូបភាព JPEG, PNG ឬ WebP (Invalid image format. Allowed: JPEG, PNG, WebP).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate file size (max 5MB)
    const MAX_SIZE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage("ទំហំឯកសារធំជាង 5MB (File size exceeds 5MB limit).");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const maxDim = 4096;
          if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
            reject(new Error("រូបភាពខូច មិនអាចអានបានទេ (Corrupted or empty image)."));
            return;
          }
          if (img.naturalWidth > maxDim || img.naturalHeight > maxDim) {
            reject(new Error(`ទំហំរូបភាពលើសពី ${maxDim}px (Dimensions exceed max 4096px).`));
            return;
          }
          // Downscale to 256x256 max square for clean avatar storage
          const canvas = document.createElement("canvas");
          const targetDim = 256;
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (w > h) {
            if (w > targetDim) {
              h = Math.round((h * targetDim) / w);
              w = targetDim;
            }
          } else {
            if (h > targetDim) {
              w = Math.round((w * targetDim) / h);
              h = targetDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not initialize 2D canvas context."));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("មិនអាចដំណើរការរូបភាពនេះបានទេ (Failed to decode image safely)."));
        };
        img.src = objectUrl;
      });

      setPendingAvatar(base64);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveAvatar = async () => {
    if (!pendingAvatar) return;
    setUploadingAvatar(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const csrfToken = await getOrRefreshCsrfToken();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify({
          avatar: pendingAvatar,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save avatar image.");
      }

      setUser(data.user);
      setAvatarPreview(data.user.avatar || pendingAvatar);
      setPendingAvatar(null);
      setSuccessMessage("រូបភាព Profile ត្រូវបានរក្សាទុកជោគជ័យ (Profile picture saved successfully)!");
      if (onUserUpdated) onUserUpdated(data.user);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCancelAvatar = () => {
    setPendingAvatar(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const csrfToken = await getOrRefreshCsrfToken();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify({
          avatar: "",
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove avatar.");
      }

      setUser(data.user);
      setAvatarPreview(null);
      setPendingAvatar(null);
      setSuccessMessage("រូបភាព Profile ត្រូវបានលុបរួចរាល់ (Profile picture removed)!");
      if (onUserUpdated) onUserUpdated(data.user);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to remove avatar.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 3. Set New Password (Admin direct override)
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const trimmed = newPassword.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a new password.");
      return;
    }

    setSavingPassword(true);
    try {
      const csrfToken = await getOrRefreshCsrfToken();
      const res = await fetch("/api/auth/admin-force-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        },
        body: JSON.stringify({
          newPassword: trimmed,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password");
      }

      setSuccessMessage("Password successfully updated and securely hashed in Upstash Redis!");
      setNewPassword("");
      if (data.user && onUserUpdated) {
        onUserUpdated(data.user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reset password. Please try again.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading account details...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Account Info Card with Circular Avatar & Username Editing */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-5 gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Circular Avatar */}
            <div className="relative shrink-0">
              <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-indigo-500/60 bg-slate-950 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                {uploadingAvatar ? (
                  <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                ) : (pendingAvatar || avatarPreview) ? (
                  <img
                    src={pendingAvatar || avatarPreview!}
                    alt="User Avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-9 w-9 text-indigo-400" />
                )}
              </div>
              {pendingAvatar && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950 shadow">
                  Preview
                </span>
              )}
            </div>

            {/* Avatar Actions & Identity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  {user?.displayName || user?.username || "Admin Profile"}
                </h2>
              </div>
              <p className="text-xs text-slate-400">Authenticated account credentials</p>

              {/* Explicit, Accessible Avatar Action Buttons (Visible on desktop, tablet, mobile) */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {pendingAvatar ? (
                  <>
                    <button
                      type="button"
                      data-testid="save-avatar-btn"
                      onClick={handleSaveAvatar}
                      disabled={uploadingAvatar}
                      className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/40 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span>Save / រក្សាទុក</span>
                    </button>
                    <button
                      type="button"
                      data-testid="cancel-avatar-btn"
                      onClick={handleCancelAvatar}
                      disabled={uploadingAvatar}
                      className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      <span>Cancel / បោះបង់</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid="change-avatar-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white font-medium text-xs flex items-center gap-1.5 border border-indigo-400/40 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      aria-label="Change Profile Picture / ប្តូររូប Profile"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Change Profile Picture / ប្តូររូប Profile</span>
                    </button>

                    {avatarPreview && (
                      <button
                        type="button"
                        data-testid="remove-avatar-btn"
                        onClick={handleRemoveAvatar}
                        disabled={uploadingAvatar}
                        className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Remove Profile Picture"
                        aria-label="Remove profile image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove / លុបរូបភាព</span>
                      </button>
                    )}
                  </>
                )}

                <input
                  ref={fileInputRef}
                  id="avatar-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarSelect}
                  className="sr-only"
                  aria-label="Upload profile image"
                />
              </div>
            </div>
          </div>

          {user?.role && (
            <span className="self-start sm:self-center inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield className="h-3.5 w-3.5 mr-1" />
              {user.role}
            </span>
          )}
        </div>

        {/* Global Feedback Banners */}
        {successMessage && (
          <div className="flex items-start p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-x-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Editable Username Field */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
            <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span className="flex items-center">
                <User className="h-3.5 w-3.5 mr-1 text-slate-500" />
                Username
              </span>
              <div className="flex items-center space-x-1">
                {user?.username && !isEditingUsername && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(user.username, "username")}
                    className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                    title="Copy username"
                  >
                    {copiedField === "username" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {!isEditingUsername ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedUsername(user?.username || "");
                      setIsEditingUsername(true);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors p-1"
                    title="Edit Username"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingUsername(false)}
                    className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                    title="Cancel edit"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {isEditingUsername ? (
              <form onSubmit={handleSaveUsername} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={editedUsername}
                  onChange={(e) => setEditedUsername(e.target.value)}
                  disabled={savingUsername}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={savingUsername || !editedUsername.trim()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  {savingUsername ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>Save</span>
                </button>
              </form>
            ) : (
              <p className="text-sm font-semibold text-slate-200 truncate">{user?.username || "—"}</p>
            )}
          </div>

          {/* Email Field */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
            <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span className="flex items-center">
                <Mail className="h-3.5 w-3.5 mr-1 text-slate-500" />
                Email
              </span>
              {user?.email && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(user.email, "email")}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                  title="Copy email"
                >
                  {copiedField === "email" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-200 truncate">{user?.email || "—"}</p>
          </div>
        </div>
      </div>

      {/* Set New Password Card */}
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur-xl shadow-xl space-y-5">
        <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">Set New Password</h3>
            <p className="text-xs text-slate-400">
              Authenticated Admin direct override (No old password required)
            </p>
          </div>
        </div>

        <form onSubmit={handleSavePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              New Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={savingPassword}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={savingPassword || !newPassword.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
            >
              {savingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving to Redis...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Save Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileManager;
