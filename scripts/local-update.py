"""Build a new local version and install it over release/win-unpacked.

    python scripts/local-update.py release          bump, build, package, then wait
    python scripts/local-update.py start VERSION    wait in the background
    python scripts/local-update.py wait VERSION     wait in this process

The waiting process publishes `local-update.json`, which makes the running app
show its Update button. It never closes the app: it installs the version once
the app has exited, and starts it again only if the app asked for that in
`local-update-restart.json` (see src/main/local-update.ts). Requires psutil.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid

import psutil

ROOT = Path(__file__).resolve().parents[1]
EXECUTABLE = 'AWS Log Explorer.exe'
ARCHIVE = 'resources/app.asar'
HEARTBEAT = 10
LOCKED_TIMEOUT = 60


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    for attempt in range(3):
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            time.sleep(0.1)
    return None


def write_json(path, value):
    temporary = path.with_name(f'{path.name}.{uuid.uuid4().hex}')
    temporary.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    for attempt in range(20):
        try:
            temporary.replace(path)
            return
        except PermissionError:  # The app is reading it.
            if attempt == 19:
                temporary.unlink()
                raise
            time.sleep(0.1)


def log(message):
    print(datetime.now(timezone.utc).isoformat(timespec='seconds'), message, flush=True)


class Update:
    def __init__(self, version, release):
        if not re.fullmatch(r'\d+\.\d+\.\d+', version):
            raise SystemExit(f'Invalid version: {version}')
        self.version = version
        self.release = release.resolve()
        self.source = self.release / version / 'win-unpacked'
        self.target = self.release / 'win-unpacked'
        self.token = uuid.uuid4().hex
        self.stage = self.release / f'standard-staging-{version}-{self.token[:8]}'
        self.pending = self.release / 'local-update.json'
        self.restart = self.release / 'local-update-restart.json'

    def running(self):
        expected = os.path.normcase(str(self.target / EXECUTABLE))
        found = []
        for process in psutil.process_iter(['pid', 'name']):
            if (process.info['name'] or '').lower() != EXECUTABLE.lower():
                continue
            try:
                if os.path.normcase(process.exe()) == expected:
                    found.append(process)
            except (psutil.NoSuchProcess, psutil.ZombieProcess):
                pass
            except psutil.AccessDenied:
                raise RuntimeError('Could not verify whether the app is running')
        return found

    def current(self):
        """Whether no newer update has replaced this one."""
        return (read_json(self.pending) or {}).get('token') == self.token

    def publish(self):
        write_json(self.pending, {
            'version': self.version,
            'token': self.token,
            'pid': os.getpid(),
        })

    def take_restart(self):
        request = read_json(self.restart)
        self.restart.unlink(missing_ok=True)
        if request is None:
            return None
        return [str(value) for value in request.get('args', [])]

    def launch(self, arguments):
        executable = self.target / EXECUTABLE
        if arguments:
            subprocess.Popen(
                [str(executable), *arguments],
                cwd=self.target,
                # Editors built on Electron set ELECTRON_RUN_AS_NODE.
                env={
                    name: value
                    for name, value in os.environ.items()
                    if not name.upper().startswith('ELECTRON_')
                },
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.DETACHED_PROCESS,
                close_fds=True,
            )
        else:
            # Explorer starts it as a double-click does, without this process's
            # environment (which may come from an editor or a build).
            subprocess.Popen(['explorer.exe', str(executable)])
        log(f'started {executable}')

    def install(self):
        backup = self.release / (
            'previous-standard-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        )
        backup.mkdir()
        try:
            self.target.rename(backup / 'win-unpacked')
        except PermissionError:
            backup.rmdir()
            return False
        try:
            self.stage.rename(self.target)
            for path, value in self.expected.items():
                if digest(self.target / path) != value:
                    raise RuntimeError(f'{path} changed while installing')
        except BaseException:
            if self.target.exists():
                self.target.rename(self.stage)
            (backup / 'win-unpacked').rename(self.target)
            raise
        log(f'installed {self.version}, previous version kept in {backup}')
        return True

    def wait(self):
        try:
            self.prepare()
            self.wait_and_install()
        except BaseException as error:
            log(f'failed: {error!r}')
            # A requested restart must not leave the user without the app.
            if self.current():
                self.pending.unlink(missing_ok=True)
                arguments = self.take_restart()
                if arguments is not None and not self.running():
                    self.launch(arguments)
            raise
        finally:
            shutil.rmtree(self.stage, ignore_errors=True)

    def prepare(self):
        executable, archive = self.source / EXECUTABLE, self.source / ARCHIVE
        for path in (executable, archive, self.target / EXECUTABLE):
            if not path.is_file():
                raise RuntimeError(f'Missing {path}')
        self.expected = {
            str(path.relative_to(self.source)): digest(path)
            for path in (executable, archive)
        }
        shutil.copytree(self.source, self.stage)
        for path, value in self.expected.items():
            if digest(self.stage / path) != value:
                raise RuntimeError(f'{path} was not copied correctly')
        # From here on an older waiting update gives up, so nothing else
        # replaces the installed app.
        self.publish()
        self.before = digest(self.target / ARCHIVE)
        log(f'{self.version} is ready, waiting for the app to close')

    def wait_and_install(self):
        locked = None
        while self.current():
            processes = self.running()
            if processes:
                locked = None
                # Tells the app that this process is still there to install it.
                os.utime(self.pending)
                psutil.wait_procs(processes, timeout=HEARTBEAT)
                continue
            if digest(self.target / ARCHIVE) != self.before:
                raise RuntimeError('The installed app changed while the update was waiting')
            if self.install():
                arguments = self.take_restart()
                self.pending.unlink(missing_ok=True)
                if arguments is not None:
                    self.launch(arguments)
                return
            locked = locked or time.monotonic()
            if time.monotonic() - locked > LOCKED_TIMEOUT:
                locked = None
                arguments = self.take_restart()
                if arguments is not None:
                    log('the app folder stayed locked, keeping the old version')
                    self.launch(arguments)
            os.utime(self.pending)
            time.sleep(1)
        log('replaced by a newer update')


def start(version, release):
    logs = ROOT / '.tmp'
    logs.mkdir(exist_ok=True)
    with (logs / f'local-update-{version}.log').open('ab') as output:
        process = subprocess.Popen(
            [sys.executable, __file__, 'wait', version, '--release', str(release)],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
            close_fds=True,
        )
    print(f'Version {version} is waiting for the app to close (process {process.pid})', flush=True)


def build_release(release):
    def run(command):
        print(f'> {command}', flush=True)
        subprocess.run(command, cwd=ROOT, shell=True, check=True)

    run('npm version patch --no-git-tag-version')
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    run('npm run build')
    # A directory of its own: the running app lives in release/win-unpacked.
    run(f'npx electron-builder --win --config.directories.output=release/{version}')
    start(version, release)
    # Desktop tests need out/ built in verification mode.
    run('npx electron-vite build --mode verification')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('command', choices=['release', 'start', 'wait'])
    parser.add_argument('version', nargs='?')
    parser.add_argument('--release', type=Path, default=ROOT / 'release')
    arguments = parser.parse_args()
    if arguments.command == 'release':
        build_release(arguments.release)
    elif not arguments.version:
        parser.error('a version is required')
    elif arguments.command == 'start':
        start(arguments.version, arguments.release.resolve())
    else:
        Update(arguments.version, arguments.release).wait()


if __name__ == '__main__':
    main()
