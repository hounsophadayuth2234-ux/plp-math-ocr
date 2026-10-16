import fs from 'fs';

let page = fs.readFileSync('src/app/bg-remover/page.tsx', 'utf8');
page = page.replace('  const [statusMessage, setStatusMessage] = useState<string>("");\r\n', '');
page = page.replace('  const [statusMessage, setStatusMessage] = useState<string>("");\n', '');
page = page.replace('  const [remoteNoticeOpen, setRemoteNoticeOpen] = useState(false);\r\n', '');
page = page.replace('  const [remoteNoticeOpen, setRemoteNoticeOpen] = useState(false);\n', '');
fs.writeFileSync('src/app/bg-remover/page.tsx', page, 'utf8');
console.log('Removed unused state vars');
