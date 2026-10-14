import fs from "fs";

let apiKey = process.env.GEMINI_API_KEY;
if (!apiKey && fs.existsSync(".env.local")) {
  const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
  if (match) apiKey = match[1].trim();
}

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  console.log("Fetching models from Google AI API...");
  try {
    const res = await fetch(url);
    console.log("Status:", res.status, res.statusText);
    const data = await res.json();
    if (data.models) {
      console.log("Available models supporting generateContent:");
      const contentModels = data.models
        .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
        .map(m => m.name.replace("models/", ""));
      console.log(contentModels);
    } else {
      console.log("Response:", data);
    }
  } catch (e) {
    console.error("ListModels failed:", e);
  }
}

listModels();
