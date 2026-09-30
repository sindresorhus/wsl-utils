import path from 'node:path';
import {promisify} from 'node:util';
import childProcess from 'node:child_process';
import fs, {constants as fsConstants} from 'node:fs/promises';
import isWsl from 'is-wsl';
import {powerShellPath as windowsPowerShellPath, executePowerShell} from 'powershell-utils';
import {parseMountPointFromConfig} from './utilities.js';

const execFile = promisify(childProcess.execFile);

export const wslDrivesMountPoint = (() => {
	// Default value for "root" param
	// according to https://docs.microsoft.com/en-us/windows/wsl/wsl-config
	const defaultMountPoint = '/mnt/';

	let mountPoint;

	return async function () {
		if (mountPoint) {
			// Return memoized mount point value
			return mountPoint;
		}

		const configFilePath = '/etc/wsl.conf';

		let isConfigFileExists = false;
		try {
			await fs.access(configFilePath, fsConstants.F_OK);
			isConfigFileExists = true;
		} catch {}

		if (!isConfigFileExists) {
			return defaultMountPoint;
		}

		const configContent = await fs.readFile(configFilePath, {encoding: 'utf8'});
		const parsedMountPoint = parseMountPointFromConfig(configContent);

		if (parsedMountPoint === undefined) {
			return defaultMountPoint;
		}

		mountPoint = parsedMountPoint;
		mountPoint = mountPoint.endsWith('/') ? mountPoint : `${mountPoint}/`;

		return mountPoint;
	};
})();

export const powerShellPathFromWsl = async () => {
	const mountPoint = await wslDrivesMountPoint();
	return `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
};

export const powerShellPath = isWsl ? powerShellPathFromWsl : windowsPowerShellPath;

// Cache for PowerShell accessibility check
let canAccessPowerShellPromise;

export const canAccessPowerShell = async () => {
	canAccessPowerShellPromise ??= (async () => {
		try {
			const psPath = await powerShellPath();
			await fs.access(psPath, fsConstants.X_OK);
			return true;
		} catch {
			// PowerShell is not accessible (either doesn't exist, no execute permission, or other error)
			return false;
		}
	})();

	return canAccessPowerShellPromise;
};

export const wslDefaultBrowser = async () => {
	const psPath = await powerShellPath();
	const command = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`;

	// The spawned Windows process inherits the Linux working directory, which WSL exposes to Windows as a `\\wsl.localhost\…` UNC path served by the distro's default user, so a directory that user cannot traverse makes the launch fail. PowerShell's own directory is on the Windows drive, so it always resolves to a plain `C:\…` path.
	const {stdout} = await executePowerShell(command, {
		powerShellPath: psPath,
		cwd: path.dirname(psPath),
	});

	return stdout.trim();
};

const isUrl = path => /^[a-z]+:\/\//i.test(path);

// `wslpath` only accepts a single path, so each path needs its own call.
const convertPath = async (flag, path) => {
	// `--` stops `wslpath` from reading a leading `-` as an option. Only pass it when needed, as it is only confirmed for WSL 2.5 and later.
	const wslpathArguments = path.startsWith('-') ? [flag, '--', path] : [flag, path];

	try {
		const {stdout} = await execFile('wslpath', wslpathArguments, {encoding: 'utf8'});
		return stdout.replace(/\r?\n$/, '') || path;
	} catch {
		// If wslpath fails, keep original path
		return path;
	}
};

export const convertWslPathToWindows = async paths => {
	const isBatch = Array.isArray(paths);
	const pathArray = isBatch ? paths : [paths];
	// URLs stay as-is
	const results = await Promise.all(pathArray.map(path => isUrl(path) ? path : convertPath('-aw', path)));
	return isBatch ? results : results[0];
};

export const isUncPath = path => /^\\\\/u.test(path);

export const isPathOnWindowsFilesystem = async path => {
	const windowsPath = await convertWslPathToWindows(path);
	return !isUncPath(windowsPath);
};

export const convertWindowsPathToWsl = async paths => {
	const isBatch = Array.isArray(paths);
	const pathArray = isBatch ? paths : [paths];
	const results = await Promise.all(pathArray.map(path => convertPath('-u', path)));
	return isBatch ? results : results[0];
};

export {default as isWsl} from 'is-wsl';
