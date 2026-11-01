import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const adb = path.resolve('android-offline-spike/platform-tools/adb.exe');

function runAdb(args, outFile) {
  try {
    const fullCmd = `"${adb}" ${args}`;
    const stdout = execSync(fullCmd, { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
    if (outFile) {
      fs.writeFileSync(outFile, stdout, 'utf-8');
    }
    return stdout;
  } catch (err) {
    const output = (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + err.message;
    if (outFile) {
      fs.writeFileSync(outFile, output, 'utf-8');
    }
    return output;
  }
}

// 1. Logcat LMKD / FATAL inside Android shell
console.log('Querying logcat for lmkd / fatal inside Android shell...');
runAdb('shell "logcat -d -b all | grep -iE \'lmkd|lowmemorykiller|FATAL\' | tail -n 50"', 'android-offline-spike/evidence/15_device_logcat_lmk.txt');

// 2. System memory breakdown
console.log('Querying dumpsys meminfo system...');
runAdb('shell dumpsys meminfo', 'android-offline-spike/evidence/16_dumpsys_meminfo_system.txt');

// 3. Process listing
console.log('Querying top processes by memory...');
runAdb('shell "ps -eo pid,user,vsz,rss,args | sort -k4 -nr | head -n 30"', 'android-offline-spike/evidence/17_device_top_processes.txt');

console.log('Done!');
