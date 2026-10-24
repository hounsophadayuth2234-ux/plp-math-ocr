import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DriveUploader } from "../src/components/DriveUploader";

describe("DriveUploader Component Rendering & Structure", () => {
  it("renders Google Drive Uploader header, drag zone, and upload button without errors", () => {
    const element = React.createElement(DriveUploader, {
      defaultFolderId: "1dS_Ul_WnVCCbJAKsn6CAT0vy9AB8Yx8f",
    });
    const html = renderToString(element);

    // Verify Header
    expect(html).toContain("Google Drive Uploader");
    expect(html).toContain("v3 Cloud");
    expect(html).toContain("Drive Connected");

    // Verify Drag & Drop area text
    expect(html).toContain("ចុចដើម្បីជ្រើសរើស");
    expect(html).toContain("អូសទម្លាក់រូបភាពទីនេះ");
    expect(html).toContain("២៥ MB");

    // Verify Upload button
    expect(html).toContain("Upload to Drive");
  });

  it("applies custom className cleanly", () => {
    const element = React.createElement(DriveUploader, {
      defaultFolderId: "test_folder_id",
      className: "custom-test-class",
    });
    const html = renderToString(element);
    expect(html).toContain("custom-test-class");
  });
});
