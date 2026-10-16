import fs from 'fs';

let page = fs.readFileSync('src/app/bg-remover/page.tsx', 'utf8');

page = page.replace(
  `    if (mode === "worker" && !isWorkerConfigured) {
      setRemoteNoticeOpen(true);
      return;
    }`,
  `    if (mode === "worker" && !isWorkerConfigured) {
      setError("Remote Worker មិនទាន់កំណត់ក្នុង Settings (BACKGROUND_REMOVAL_WORKER_URL)។ សូមប្រើ Browser AI ជំនួសវិញ។");
      return;
    }`
);

page = page.replace(
  `                      if (!isWorkerConfigured) {
                        setRemoteNoticeOpen(true);
                        return;
                      }`,
  `                      if (!isWorkerConfigured) {
                        setError("Remote Worker មិនទាន់កំណត់ក្នុង Settings (BACKGROUND_REMOVAL_WORKER_URL)។");
                        return;
                      }`
);

fs.writeFileSync('src/app/bg-remover/page.tsx', page, 'utf8');
console.log('Fixed remote notice references in page.tsx');
