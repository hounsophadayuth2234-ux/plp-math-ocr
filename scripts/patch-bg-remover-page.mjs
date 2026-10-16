import fs from 'fs';

const filePath = 'src/app/bg-remover/page.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add selectedPurpose state and cleanCutError state
const stateMarker = 'const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);';
const newState = `const [initialCompositeUrl, setInitialCompositeUrl] = useState<string | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState<"white" | "pink" | "transparent">("white");
  const [statusMessage, setStatusMessage] = useState<string>("");`;

code = code.replace(stateMarker, newState);

// 2. Prevent duplicate clicks and support targetMaxDim in handleRunSegmentation
const runMarker = 'const handleRunSegmentation = async (mode: "preview" | "final" | "worker") => {';
const newRun = `const handleRunSegmentation = async (mode: "preview" | "final" | "worker", targetMaxDim?: number) => {
    if (!imageFile) return;
    if (isProcessingRef.current) {
      console.log("[bg-remover] Ignoring duplicate click during processing");
      return;
    }
    const previousResult = cachedResult;
    const startTime = performance.now();`;

code = code.replace(runMarker, newRun);

// 3. Update removeBackgroundBrowser options to pass targetMaxDimension and track totalMs
const callMarker = `output = await removeBackgroundBrowser(imageFile, {
          mode,
          erosionRadius: 0,
          featherRadius: 0.75,
          decontaminationRadius: mode === "preview" ? 1 : 1.5,
          alphaMatting: true,
          signal: abortController.signal,
          onProgress: (p) => {
            setProgressInfo(p);
            if (p.stage === "Segmenting" || p.stage === "Refining mask") {
              startInferenceDeadline();
            }
          },
        });`;

const newCall = `output = await removeBackgroundBrowser(imageFile, {
          mode,
          targetMaxDimension: targetMaxDim,
          erosionRadius: 0,
          featherRadius: 0.75,
          decontaminationRadius: mode === "preview" ? 1 : 1.5,
          alphaMatting: true,
          signal: abortController.signal,
          onProgress: (p) => {
            setProgressInfo(p);
            if (p.stage === "Segmenting" || p.stage === "Refining mask") {
              startInferenceDeadline();
            }
          },
        });
        const elapsedTotal = Math.round(performance.now() - startTime);
        if (output.metrics) {
          output.metrics.totalMs = elapsedTotal;
        } else {
          output.metrics = { totalMs: elapsedTotal };
        }`;

code = code.replace(callMarker, newCall);

// 4. In catch block, preserve previous preview if Clean Cut failed
const catchMarker = `console.error("[bg-remover] Error:", err);
      setError(
        err instanceof Error ? err.message : "Background removal segmentation failed."
      );`;

const newCatch = `console.error("[bg-remover] Error:", err);
      // Retain previous valid result if clean cut failed
      if (previousResult && !cachedResult) {
        setCachedResult(previousResult);
      }
      setError(
        err instanceof Error
          ? err.message
          : "ដំណើរការកាត់រូបភាពជួបបញ្ហា។ អ្នកអាចព្យាយាមម្តងទៀត ឬដំណើរការកម្រិត 1024px។"
      );`;

code = code.replace(catchMarker, newCatch);

// 5. Update ColorStudio invocation to pass truthful props and selectedPurpose
const studioMarker = `<ColorStudio
                originalUrl={originalUrl}
                originalFile={imageFile}
                transparentBlob={cachedResult.transparentBlob}
                transparentUrl={cachedResult.transparentUrl}
                alphaMaskUrl={cachedResult.alphaMaskUrl}
                alphaMaskBuffer={cachedResult.alphaMaskBuffer}
                sourceImageData={cachedResult.sourceImageData}
                initialCompositeUrl={initialCompositeUrl}
                width={cachedResult.width}
                height={cachedResult.height}
                mode={cachedResult.mode}
                provider={cachedResult.model}
                processingLabel={cachedResult.label}
                metrics={cachedResult.metrics}
                onReset={handleReset}
                onRerunFinal={() => handleRunSegmentation("final")}
              />`;

const newStudio = `<ColorStudio
                originalUrl={originalUrl}
                originalFile={imageFile}
                transparentBlob={cachedResult.transparentBlob}
                transparentUrl={cachedResult.transparentUrl}
                alphaMaskUrl={cachedResult.alphaMaskUrl}
                alphaMaskBuffer={cachedResult.alphaMaskBuffer}
                sourceImageData={cachedResult.sourceImageData}
                initialCompositeUrl={initialCompositeUrl}
                width={cachedResult.width}
                height={cachedResult.height}
                sourceWidth={cachedResult.sourceWidth}
                sourceHeight={cachedResult.sourceHeight}
                wasDownscaled={cachedResult.wasDownscaled}
                mode={cachedResult.mode}
                initialPurpose={selectedPurpose}
                provider={cachedResult.model}
                processingLabel={cachedResult.label}
                metrics={cachedResult.metrics}
                isProcessingFinal={isProcessing && processingMode === "final"}
                onReset={handleReset}
                onRerunFinal={(dim) => handleRunSegmentation("final", dim)}
              />`;

code = code.replace(studioMarker, newStudio);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated page.tsx with stability and state preservation!');
