import type { Metadata } from "next";
import DriveUploader from "@/components/DriveUploader";
import { GoogleDriveOAuthSettings } from "@/components/drive/GoogleDriveOAuthSettings";

export const metadata: Metadata = {
  title: "ប្រព័ន្ធគ្រប់គ្រងរូបភាពលំហាត់គណិតវិទ្យា (DYT Ecosystem) | Cloud Storage",
  description:
    "ទម្លាក់រូបភាពលំហាត់ ឬកិច្ចការគ្រូបង្រៀន ដើម្បីរក្សាទុកក្នុង Google Drive ដោយប្រើទំហំផ្ទុកផ្ទាល់ខ្លួន។",
};

export default function MathContentPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-slate-100">
        ប្រព័ន្ធគ្រប់គ្រងរូបភាពលំហាត់គណិតវិទ្យា (DYT Ecosystem)
      </h1>
      <p className="text-slate-400 mb-6 text-sm">
        ទម្លាក់រូបភាពលំហាត់ ឬកិច្ចការគ្រូបង្រៀន ដើម្បីរក្សាទុកក្នុង Google Drive ដោយប្រើប្រាស់ទំហំផ្ទុកផ្ទាល់ខ្លួនរបស់អ្នក។
      </p>

      {/* Protected Google Drive Settings Area (OAuth Connection, Status, Disconnect) */}
      <GoogleDriveOAuthSettings />

      {/* Direct Uploader Tool */}
      <DriveUploader />
    </div>
  );
}
