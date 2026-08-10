import { execFileSync } from "node:child_process";

const ports = [3000, 3001, 4001];

function killProcess(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // The process may have exited between discovery and termination.
  }
}

if (process.platform === "win32") {
  let output = "";
  try {
    output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  } catch {
    process.exit(0);
  }

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+\S+\s+(\d+)$/i);
    if (match && ports.includes(Number(match[1])) && match[2] !== "0") pids.add(match[2]);
  }
  for (const pid of pids) killProcess(pid);
} else {
  for (const port of ports) {
    let output = "";
    try {
      output = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf8" });
    } catch {
      continue;
    }
    for (const pid of output.split(/\s+/).filter(Boolean)) killProcess(Number(pid));
  }
}
