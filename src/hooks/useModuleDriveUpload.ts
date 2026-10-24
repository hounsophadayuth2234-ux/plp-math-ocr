"use client";

import { useState, useRef, useCallback } from "react";
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
  defaultSaveToDrive = false,
}: UseModuleDriveUploadOptions) {
  const [saveToDrive, setSaveToDriveState] = useState<boolean>(defaultSaveToDrive);
  const [status, setStatus] = useState<DriveSyncStatus>("idle");
  const [uploadedRecord, setUploadedRecord] = useState<DriveUploadFileRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // References to eliminate stale closure bugs across callbacks and asynchronous events
  const saveToDriveRef = useRef<boolean>(defaultSaveToDrive);
  const statusRef = useRef<DriveSyncStatus>("idle");
  const uploadedRecordRef = useRef<DriveUploadFileRecord | null>(null);
  // Set of uploaded fingerprints to prevent duplicate uploads across re-renders
  const uploadedFingerprintsRef = useRef<Set<string>>(new Set());
  // Store last payload options for retry or deferred upload upon user enabling sync
  const lastPayloadRef = useRef<DriveUploadOptions | null>(null);

  saveToDriveRef.current = saveToDrive;
  statusRef.current = status;
  uploadedRecordRef.current = uploadedRecord;

  const triggerUpload = useCallback(
    async (
      payload: DriveUploadOptions,
      options?: { force?: boolean }
    ): Promise<DriveUploadFileRecord | null> => {
      lastPayloadRef.current = payload;

      // Honor user preference: only upload if consent is active or explicitly forced
      const isConsentActive = options?.force || saveToDriveRef.current;
      if (!isConsentActive) {
        return null;
      }

      // Compute fingerprint to avoid duplicates on re-render
      const fingerprint =
        payload.filename +
        (payload.file ? `_${payload.file.size}` : `_${payload.dataUrl?.slice(0, 50)}`);

      if (!options?.force && uploadedFingerprintsRef.current.has(fingerprint)) {
        return uploadedRecordRef.current;
      }

      setStatus("pending");
      setErrorMessage(null);

      try {
        const record = await uploadImageToDrive({
          ...payload,
          moduleName: payload.moduleName || moduleName,
          description: payload.description || `Uploaded from ${moduleName}`,
          makePublic: payload.makePublic || false, // Private by default
        });

        uploadedFingerprintsRef.current.add(fingerprint);
        setUploadedRecord(record);
        setStatus("uploaded");
        return record;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ModuleDriveSync:${moduleName}] Drive upload failed (non-blocking):`, msg);
        setErrorMessage(msg);
        setStatus("failed");
        return null;
      }
    },
    [moduleName]
  );

  // User setting checkbox toggle: when user enables "Save to Drive", immediately upload any pending image!
  const setSaveToDrive = useCallback(
    (enabled: boolean) => {
      setSaveToDriveState(enabled);
      saveToDriveRef.current = enabled;

      if (
        enabled &&
        lastPayloadRef.current &&
        statusRef.current !== "uploaded" &&
        statusRef.current !== "pending"
      ) {
        triggerUpload(lastPayloadRef.current, { force: true });
      }
    },
    [triggerUpload]
  );

  const retryUpload = useCallback(() => {
    if (lastPayloadRef.current) {
      triggerUpload(lastPayloadRef.current, { force: true });
    }
  }, [triggerUpload]);

  const resetDriveState = useCallback(() => {
    setStatus("idle");
    setUploadedRecord(null);
    setErrorMessage(null);
    lastPayloadRef.current = null;
  }, []);

  return {
    saveToDrive,
    setSaveToDrive,
    status,
    uploadedRecord,
    errorMessage,
    triggerUpload,
    retryUpload,
    resetDriveState,
  };
}
