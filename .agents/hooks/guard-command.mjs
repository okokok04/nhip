// PreToolUse guard for run_command.
// Reads the tool call JSON on stdin, writes a decision JSON on stdout.
// Deny only catastrophic, irreversible commands. Ask for risky-but-recoverable ones.
// Allow everything else so normal work is not interrupted.

const CATASTROPHIC = [
  { re: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|\*|~|\$HOME|[A-Za-z]:\\)\s*$/i, why: 'recursive delete of a root-like path' },
  { re: /\brm\s+-rf\s+\/(?!\w)/i, why: 'recursive delete of /' },
  { re: /Remove-Item\b[^\n]*-Recurse[^\n]*-Force[^\n]*\b[A-Za-z]:[\\/]+["']?\s*$/i, why: 'recursive forced delete of a drive root' },
  { re: /\b(rd|rmdir)\s+\/s\s+\/q\s+[A-Za-z]:[\\/]*["']?\s*$/i, why: 'recursive forced delete of a drive root' },
  { re: /\b(mkfs|format)\b\s+[A-Za-z]:/i, why: 'formatting a disk' },
  { re: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i, why: 'dropping database objects' },
  { re: /\bTRUNCATE\s+TABLE\b/i, why: 'truncating a table' },
  { re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)/i, why: 'force push' },
  { re: /\bgit\s+filter-branch\b|\bgit\s+filter-repo\b/i, why: 'rewriting git history' },
  { re: /\b(shutdown|reboot)\b/i, why: 'shutting down the machine' },
];

const RISKY = [
  { re: /\bgit\s+reset\s+--hard\b/i, why: 'discarding uncommitted work' },
  { re: /\bgit\s+clean\s+-[a-zA-Z]*[fd]/i, why: 'deleting untracked files' },
  { re: /\b(npm|pnpm|yarn)\s+(i|install|add)\b[^\n]*(-g|--global)\b/i, why: 'installing a global package' },
  { re: /\bpip\s+install\b[^\n]*--user\b|\bpipx\s+install\b/i, why: 'installing a user-global python package' },
  { re: /\bprisma\s+migrate\s+deploy\b|\balembic\s+upgrade\s+head\b|\bdb:migrate:(prod|production)\b/i, why: 'running migrations against a deploy target' },
  { re: /\bdocker\s+(rm|rmi|system\s+prune|volume\s+rm|volume\s+prune)\b/i, why: 'removing docker state' },
  { re: /\b(vercel|netlify|flyctl|railway|heroku)\b[^\n]*\b(deploy|destroy|delete|remove)\b/i, why: 'deploying or destroying remote resources' },
  { re: /\bcurl\b[^\n]*\|\s*(sh|bash|zsh)\b|\biwr\b[^\n]*\|\s*iex\b|\bInvoke-Expression\b/i, why: 'executing a downloaded script' },
  { re: /\bgit\s+push\b[^\n]*(--delete|-d)\s/i, why: 'deleting a remote branch' },
];

function decide(command) {
  for (const { re, why } of CATASTROPHIC) {
    if (re.test(command)) {
      return { decision: 'deny', reason: `Blocked: ${why}. Ask the user to run this manually if it is truly intended.` };
    }
  }
  for (const { re, why } of RISKY) {
    if (re.test(command)) {
      return { decision: 'ask', reason: `Confirmation requested: ${why}.` };
    }
  }
  return { decision: 'allow' };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try {
    const payload = JSON.parse(raw || '{}');
    const args = payload?.toolCall?.args ?? payload?.args ?? {};
    command = String(args.CommandLine ?? args.command ?? args.Command ?? '');
  } catch {
    process.stdout.write('{}');
    return;
  }

  if (!command.trim()) {
    process.stdout.write('{}');
    return;
  }

  try {
    process.stdout.write(JSON.stringify(decide(command)));
  } catch {
    process.stdout.write('{}');
  }
});
