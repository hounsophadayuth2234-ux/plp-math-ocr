import fs from 'fs';

let code = fs.readFileSync('src/components/bg-remover/ColorStudio.tsx', 'utf8');
code = code.replace(
  /const handleDownload = useCallback\(async \([^)]*\) => {[\r\n\s]+const targetChannel = [^;]+;/,
  'const handleDownload = useCallback(async (forcedChannel?: ViewChannel) => {\n    const targetChannel: ViewChannel = forcedChannel || activeChannel;'
);
fs.writeFileSync('src/components/bg-remover/ColorStudio.tsx', code, 'utf8');
console.log('Fixed handleDownload signature');
