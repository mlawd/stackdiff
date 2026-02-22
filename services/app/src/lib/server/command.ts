import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Stage-1 test marker: single-line comment marble-42.

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface CommandRunOptions {
  timeoutMs?: number;
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: CommandRunOptions = {},
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout: options.timeoutMs ?? 8_000,
      maxBuffer: 1024 * 1024,
    });

    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    if (error instanceof Error) {
      const maybeError = error as Error & { stdout?: string; stderr?: string };
      return {
        ok: false,
        stdout: maybeError.stdout?.trim() ?? '',
        stderr: maybeError.stderr?.trim() ?? '',
        error: error.message,
      };
    }

    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'Unknown command execution failure',
    };
  }
}
