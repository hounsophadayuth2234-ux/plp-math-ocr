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
  const [saveToDrive, setSaveToDrive] = useState<boolean>(defaultSaveToDrive);
  const [status, setStatus] = useState<DriveSyncStatus>("idle");
  const [uploadedRecord, setUploadedRecord] = useState<DriveUploadFileRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set of uploaded fingerprints to prevent duplicate uploads across re-renders
  const uploadedFingerprintsRef = useRef<Set<string>>(new Set());
  // Store last payload options for retry
  const lastPayloadRef = useRef<DriveUploadOptions | null>(null);

  const triggerUpload = useCallback(
    async (
      payload: DriveUploadOptions,
      options?: { force?: boolean }
    ): Promise<DriveUploadFileRecord | null> => {
      lastPayloadRef.current = payload;

      // Honor user preference: only upload if consent is active or explicitly forced
      if (!saveToDrive && !options?.force) {
        return null;
      }

      // Compute fingerprint to avoid duplicates on re-render
      const fingerprint = payload.filename + (payload.file ? `_${payload.file.size}` : `_${payload.dataUrl?.slice(0, 50)}`);

      if (!options?.force && uploadedFingerprintsRef.current.has(fingerprint)) {
        return uploadedRecord;
      }

      setStatus("pending");
      setErrorMessage(null);

      try {
        const record = await uploadImageToDrive({
          ...payload,
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
    [saveToDrive, moduleName, uploadedRecord]
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
