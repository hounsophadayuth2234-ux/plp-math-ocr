import type { Metadata } from "next";
import DriveUploader from "@/components/DriveUploader";

export const metadata: Metadata = {
  title: "ប្រព័ន្ធគ្រប់គ្រងរូបភាពលំហាត់គណិតវិទ្យា (DYT Ecosystem) | Cloud Storage",
  description:
    "ទម្លាក់រូបភាពលំហាត់ ឬកិច្ចការគ្រូបង្រៀន ដើម្បីរក្សាទុកក្នុង Google Drive 5TB ដោយស្វ័យប្រវត្តិ។",
};

export default function MathContentPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-slate-100">
        ប្រព័ន្ធគ្រប់គ្រងរូបភាពលំហាត់គណិតវិទ្យា (DYT Ecosystem)
      </h1>
      <p className="text-slate-400 mb-6">
        ទម្លាក់រូបភាពលំហាត់ ឬកិច្ចការគ្រូបង្រៀន ដើម្បីរក្សាទុកក្នុង Google Drive 5TB ដោយស្វ័យប្រវត្តិ។
      </p>

      {/* ហៅ Component ដែលបានបង្កើត */}
      <DriveUploader />
    </div>
  );
}
