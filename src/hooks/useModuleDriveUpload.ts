"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  uploadImageToDrive,
  DriveUploadOptions,
  DriveUploadFileRecord,
} from "@/lib/drive-upload-client";
import type { DriveSyncStatus } from "@/components/drive/ModuleDriveSync";

export interface UseModuleDriveUploadOptions {
  moduleName: string;
  defaultSaveToDrive?: boolean;
}

export function useModuleDriveUpload({
  moduleName,
  defaultSaveToDrive = true,
}: UseModuleDriveUploadOptions) {
  const [saveToDrive, setSaveToDriveState] = useState<boolean>(defaultSaveToDrive);
  const saveToDriveRef = useRef<boolean>(defaultSaveToDrive);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const isConnectedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<DriveSyncStatus>("idle");
  const [uploadedRecords, setUploadedRecords] = useState<DriveUploadFileRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>("user");

  useEffect(() => {
    saveToDriveRef.current = saveToDrive;
  }, [saveToDrive]);

  // Inspect Drive connection status and session username
  const checkConnectionAndSession = useCallback(async () => {
    try {
      const [sessionRes, driveRes] = await Promise.allSettled([
        fetch("/api/auth/session"),
        fetch("/api/upload-to-drive"),
      ]);

      if (sessionRes.status === "fulfilled" && sessionRes.value.ok) {
        const data = await sessionRes.value.json();
        if (data?.user?.username) {
          setCurrentUser(data.user.username);
        } else if (data?.user?.id) {
          setCurrentUser(data.user.id);
        }
      }

      if (driveRes.status === "fulfilled" && driveRes.value.ok) {
        const data = await driveRes.value.json();
        const connected = Boolean(data?.connected);
        setIsConnected(connected);
        isConnectedRef.current = connected;
      }
    } catch {
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkConnectionAndSession();
    const handleUpdate = () => checkConnectionAndSession();
    window.addEventListener("app:settings-updated", handleUpdate);
    return () => {
      window.removeEventListener("app:settings-updated", handleUpdate);
    };
  }, [checkConnectionAndSession]);

  // References to eliminate stale closures across callbacks and async intervals
  const statusRef = useRef<DriveSyncStatus>("idle");
  const uploadedRecordsRef = useRef<DriveUploadFileRecord[]>([]);
  const uploadedFingerprintsRef = useRef<Set<string>>(new Set());
  const lastPayloadsRef = useRef<DriveUploadOptions[]>([]);
  const failedPayloadsRef = useRef<DriveUploadOptions[]>([]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    uploadedRecordsRef.current = uploadedRecords;
  }, [uploadedRecords]);

  const triggerUpload = useCallback(
    async (
      payloadOrPayloads: DriveUploadOptions | DriveUploadOptions[],
      options?: { force?: boolean }
    ): Promise<DriveUploadFileRecord[]> => {
      const payloads = Array.isArray(payloadOrPayloads)
        ? payloadOrPayloads
        : [payloadOrPayloads];

      if (payloads.length === 0) {
        return [];
      }

      // If user disabled saveToDrive or Google Drive is not connected, skip silently without console errors
      if (!saveToDriveRef.current || !isConnectedRef.current) {
        return [];
      }

      lastPayloadsRef.current = payloads;

      // Filter out payloads that have already been uploaded (idempotency against React re-renders)
      const pendingPayloads = options?.force
        ? payloads
        : payloads.filter((p) => {
            const fingerprint =
              p.filename +
              (p.file
                ? `_${p.file.size}`
                : `_${(p.content || p.text || p.dataUrl || "").slice(0, 50)}`);
            return !uploadedFingerprintsRef.current.has(fingerprint);
          });

      if (pendingPayloads.length === 0) {
        return uploadedRecordsRef.current;
      }

      setStatus("pending");
      setErrorMessage(null);

      const newlyUploaded: DriveUploadFileRecord[] = [];
      const stillFailed: DriveUploadOptions[] = [];
      let lastErrMsg: string | null = null;

      for (const payload of pendingPayloads) {
        const fingerprint =
          payload.filename +
          (payload.file
            ? `_${payload.file.size}`
            : `_${(payload.content || payload.text || payload.dataUrl || "").slice(0, 50)}`);

        try {
          const record = await uploadImageToDrive({
            ...payload,
            moduleName: payload.moduleName || moduleName,
            description: payload.description || `Uploaded from ${moduleName}`,
            makePublic: payload.makePublic || false, // Private by default
          });

          uploadedFingerprintsRef.current.add(fingerprint);
          newlyUploaded.push(record);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[ModuleDriveSync:${moduleName}] Upload failed for ${payload.filename}:`, msg);
          stillFailed.push(payload);
          lastErrMsg = msg;
        }
      }

      failedPayloadsRef.current = stillFailed;

      if (newlyUploaded.length > 0) {
        setUploadedRecords((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const unique = newlyUploaded.filter((r) => !existingIds.has(r.id));
          return [...prev, ...unique];
        });
      }

      if (stillFailed.length > 0) {
        setStatus("failed");
        setErrorMessage(
          lastErrMsg || `Failed to upload ${stillFailed.length} file(s) to Google Drive.`
        );
      } else {
        setStatus("uploaded");
      }

      return newlyUploaded;
    },
    [moduleName]
  );

  const retryUpload = useCallback(() => {
    const toRetry = failedPayloadsRef.current.length > 0
      ? failedPayloadsRef.current
      : lastPayloadsRef.current;

    if (toRetry.length > 0) {
      triggerUpload(toRetry, { force: true });
    }
  }, [triggerUpload]);

  const resetDriveState = useCallback(() => {
    setStatus("idle");
    setUploadedRecords([]);
    setErrorMessage(null);
    lastPayloadsRef.current = [];
    failedPayloadsRef.current = [];
  }, []);

  const setSaveToDrive = useCallback(
    (enabled: boolean) => {
      setSaveToDriveState(enabled);
      if (
        enabled &&
        failedPayloadsRef.current.length > 0 &&
        statusRef.current !== "pending"
      ) {
        retryUpload();
      }
    },
    [retryUpload]
  );

  const primaryUploadedRecord =
    uploadedRecords.length > 0 ? uploadedRecords[uploadedRecords.length - 1] : null;

  return {
    saveToDrive,
    setSaveToDrive,
    isConnected,
    status,
    uploadedRecords,
    uploadedRecord: primaryUploadedRecord,
    errorMessage,
    currentUser,
    triggerUpload,
    retryUpload,
    resetDriveState,
  };
}
