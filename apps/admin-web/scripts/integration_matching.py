"""Isolated backend integration fixture runner. No CLI simulator and no user database.
Uses real backend models only to seed deterministic edge cases, then tests REST/WS through Edge.
Ports 8001/5175 must be free. Run with backend .venv Python from repo root.
"""
from pathlib import Path
from datetime import timedelta
import os, sys, json, secrets, socket, subprocess, tempfile, time, urllib.request
ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / 'services/backend'
FRONTEND = ROOT / 'apps/admin-web'
for port in (8001, 5175):
    with socket.socket() as probe:
        if probe.connect_ex(('localhost', port)) == 0: raise SystemExit(f'Port {port} is in use; refusing to touch that server.')
def wait(url):
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=1): return
        except OSError: time.sleep(.2)
    raise RuntimeError('Test server failed to start')
with tempfile.TemporaryDirectory(prefix='neu-matching-', ignore_cleanup_errors=True) as folder:
    os.environ.update({'DATABASE_URL': 'sqlite:///' + (Path(folder)/'test.db').as_posix(), 'ADMIN_API_KEY': secrets.token_urlsafe(32), 'SIMULATOR_API_KEY': secrets.token_urlsafe(32), 'GATEWAY_API_KEY': secrets.token_urlsafe(32), 'CORS_ORIGINS': 'http://localhost:5175', 'PYTHONUTF8': '1', 'VITE_DATA_MODE': 'api', 'VITE_API_BASE_URL': 'http://localhost:8001/api/v1', 'VITE_WS_BASE_URL': 'ws://localhost:8001'})
    sys.path.insert(0, str(BACKEND))
    from app import main as m
    ids = {}
    with m.SessionLocal() as db:
        race = m.Race(name='Matching integration', checkpoint_mode='GPS_AND_ARDUINO', status='LIVE', total_laps=1, matching_locked_at=m.now_utc())
        draft = m.Race(name='Config integration', checkpoint_mode='GPS_ONLY')
        gps = m.Race(name='GPS only integration', checkpoint_mode='GPS_ONLY', status='LIVE')
        db.add_all([race, draft, gps]); db.flush()
        cp = m.Checkpoint(race_id=race.id, code='CP', name='Test checkpoint', sequence_no=1, latitude=21.005, longitude=105.843)
        gps_cp = m.Checkpoint(race_id=gps.id, code='GPS', name='GPS checkpoint', sequence_no=1)
        db.add_all([cp, gps_cp]); db.flush()
        db.add_all([m.Device(id='test-device', name='Fixture gateway', checkpoint_id=cp.id), m.Device(id='gps-device', name='Fixture gateway', checkpoint_id=gps_cp.id)])
        candidates = []; runs = []
        now = m.now_utc()
        for index in range(2):
            student = m.Student(student_code=f'TEST-{index}', full_name=f'Runner {index+1}')
            db.add(student); db.flush()
            wearable = m.RunnerWearable(id=f'wearable-{index}', name='Fixture wearable', student_id=student.id)
            db.add(wearable)
            db.add(m.RaceParticipant(race_id=race.id, student_id=student.id, bib_number=f'{index+1:02d}'))
            run = m.RunSession(race_id=race.id, student_id=student.id, wearable_device_id=wearable.id, started_at=now-timedelta(seconds=90), last_seen_at=now, last_latitude=21.005+index*.0001, last_longitude=105.843, total_steps=100)
            db.add(run); db.flush(); runs.append(run.id)
            passage = m.GPSPassage(race_id=race.id, checkpoint_id=cp.id, run_id=run.id, student_id=student.id, wearable_device_id=wearable.id, entry_gps_point_id=m.new_id(), entry_at=now-timedelta(seconds=1), received_at=now, entry_distance_m=2+index, config_version=1)
            db.add(passage); db.flush()
            candidates.append({'passage_id': passage.id, 'student_id': student.id, 'student_code': student.student_code, 'display_id': f'{index+1:02d}', 'run_id': run.id, 'wearable_device_id': wearable.id, 'entry_at': now.isoformat(), 'entry_distance_m': 2+index, 'time_delta_ms': index*100, 'available': True})
        for name in ['confirm', 'dismiss', 'conflict', 'retry', 'not_final', 'not_counted']:
            event = m.DeviceEvent(device_id='test-device', checkpoint_id=cp.id, source_event_id=m.new_id(), event_type='PASSAGE_DETECTED', occurred_at=now, status='AMBIGUOUS', lap_status='NOT_EVALUATED', candidates_final=name != 'not_final', candidates_json=json.dumps(candidates), config_version=1, reason_code='MULTIPLE_CANDIDATES')
            if name == 'not_counted': event.status='MATCHED'; event.lap_status='NOT_COUNTED'; event.reason_code='MIN_LAP_INTERVAL_NOT_MET'; event.matched_run_id=runs[0]
            db.add(event); db.flush(); ids[name]=event.id
        db.commit()
        ids.update({'race':race.id,'draft':draft.id,'gps':gps.id,'checkpoint':cp.id,'gps_checkpoint':gps_cp.id,'passage':candidates[0]['passage_id'],'run':runs[0],'student':candidates[0]['student_id']})
    m.engine.dispose()
    env = {**os.environ, 'MATCHING_FIXTURE': json.dumps(ids)}
    # The browser process receives Admin key only. Gateway/Simulator credentials stay in the backend environment.
    browser_env = {k:v for k,v in env.items() if k not in {'GATEWAY_API_KEY','SIMULATOR_API_KEY'}}
    subprocess.run(['node','node_modules/vite/bin/vite.js','build','--outDir','test-results/matching-dist'], cwd=FRONTEND, env=browser_env, check=True)
    api = subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','localhost','--port','8001','--no-access-log','--log-level','error'], cwd=BACKEND, env=env)
    web = None
    try:
        wait('http://localhost:8001/health')
        # Seed one genuine Gateway HTTP event in GPS_ONLY; FE never sends this request.
        payload = json.dumps({'source_event_id':m.new_id(),'device_id':'gps-device','occurred_at':m.now_utc().isoformat()}).encode()
        req = urllib.request.Request('http://localhost:8001/api/v1/checkpoint-events', data=payload, headers={'X-Gateway-Key':env['GATEWAY_API_KEY'],'Content-Type':'application/json'})
        with urllib.request.urlopen(req) as response: ids['gps_event']=json.load(response)['event_id']
        browser_env['MATCHING_FIXTURE']=json.dumps(ids)
        web = subprocess.Popen(['node','node_modules/vite/bin/vite.js','preview','--host','localhost','--port','5175','--strictPort','--outDir','test-results/matching-dist'], cwd=FRONTEND, env=browser_env, stdout=subprocess.DEVNULL)
        wait('http://localhost:5175')
        subprocess.run(['node','scripts/integration-matching.mjs'], cwd=FRONTEND, env=browser_env, check=True)
    finally:
        if web: web.terminate(); web.wait(timeout=10)
        api.terminate(); api.wait(timeout=10)
