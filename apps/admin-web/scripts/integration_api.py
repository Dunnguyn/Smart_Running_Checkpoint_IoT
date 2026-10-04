"""Run real integration against an isolated ephemeral SQLite DB, with random in-memory keys.
Run using services/backend/.venv/Scripts/python.exe apps/admin-web/scripts/integration_api.py.
Ports 8000/5173 must be free. No production database or .env is modified.
"""
from pathlib import Path
import os, secrets, subprocess, sys, tempfile, time, urllib.request
ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / 'services/backend'
FRONTEND = ROOT / 'apps/admin-web'
def wait(url):
    for _ in range(80):
        try:
            with urllib.request.urlopen(url, timeout=1): return
        except OSError: time.sleep(.25)
    raise RuntimeError('Local test server did not start')
for port in (8000, 5173):
    import socket
    with socket.socket() as probe:
        if probe.connect_ex(('localhost', port)) == 0:
            raise SystemExit(f'Port {port} is occupied; test will not use an existing server/database.')
with tempfile.TemporaryDirectory(prefix='neu-integration-', ignore_cleanup_errors=True) as directory:
    env = {**os.environ, 'ADMIN_API_KEY': secrets.token_urlsafe(32), 'SIMULATOR_API_KEY': secrets.token_urlsafe(32), 'GATEWAY_API_KEY': secrets.token_urlsafe(32), 'DATABASE_URL': 'sqlite:///' + (Path(directory)/'test.db').as_posix(), 'PYTHONUTF8': '1', 'BACKEND_PYTHON': sys.executable, 'VITE_DATA_MODE': 'api', 'VITE_API_BASE_URL': 'http://localhost:8000/api/v1', 'VITE_WS_BASE_URL': 'ws://localhost:8000', 'CORS_ORIGINS': 'http://localhost:5173'}
    api = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', 'localhost', '--port', '8000', '--no-access-log', '--log-level', 'error'], cwd=BACKEND, env=env)
    web = None
    try:
        wait('http://localhost:8000/health')
        web = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', 'preview', '--host', 'localhost', '--port', '5173', '--strictPort'], cwd=FRONTEND, env=env, stdout=subprocess.DEVNULL)
        wait('http://localhost:5173')
        result = subprocess.run(['node', 'scripts/integration-api.mjs'], cwd=FRONTEND, env=env)
        if result.returncode: raise SystemExit(result.returncode)
    finally:
        if web: web.terminate(); web.wait(timeout=10)
        api.terminate(); api.wait(timeout=10)
