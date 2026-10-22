'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import jsQR from 'jsqr';
import * as ed from '@noble/ed25519';
import Brand from './Brand';
import Icon from './Icon';
import { useMe } from './MeContext';
import { ACCESS, ROLE_LABEL } from '@/lib/apps';
import { VARIANT_LABEL } from '@/lib/format';

// Portaria offline: confere a assinatura do QR no próprio aparelho, guarda as leituras e sincroniza quando houver sinal.
const LS = { list: 'gate:list', queue: 'gate:queue', used: 'gate:used', device: 'gate:device', history: 'gate:history' };

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function b64u(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}
const time = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function GateClient({ publicKey }) {
  const me = useMe();
  const canPanel = !!me && ACCESS.painel.includes(me.role);
  const [list, setList] = useState(null);       // { generated_at, tickets: Map-like object, event }
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [syncInfo, setSyncInfo] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lastScan = useRef({ data: '', at: 0 });
  const busy = useRef(false);
  const deviceId = useRef('');

  useEffect(() => {
    deviceId.current = load(LS.device, null) || `porta-${Math.random().toString(36).slice(2, 7)}`;
    save(LS.device, deviceId.current);
    setList(load(LS.list, null));
    setQueue(load(LS.queue, []));
    setHistory(load(LS.history, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const downloadList = useCallback(async () => {
    try {
      const res = await fetch('/api/portaria/lista', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      data.tickets.forEach(([code, name, variant, used]) => { map[code] = { n: name, v: variant, u: used }; });
      const l = { event: data.event, generated_at: data.generated_at, tickets: map, count: data.tickets.length, stats: data.stats };
      setList(l);
      save(LS.list, l);
    } catch {}
  }, []);

  const sync = useCallback(async () => {
    const q = load(LS.queue, []);
    if (!q.length || !navigator.onLine) return;
    try {
      const res = await fetch('/api/portaria/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId.current, scans: q.map(({ client_scan_id, code, scanned_at }) => ({ client_scan_id, code, scanned_at })) }),
      });
      if (!res.ok) return;
      const results = await res.json();
      const byId = Object.fromEntries(results.map((r) => [r.client_scan_id, r.result]));
      // Avisa se o servidor discordou da decisão local (ex.: duas portas offline com o mesmo QR)
      const h = load(LS.history, []).map((x) => {
        const server = byId[x.id];
        if (!server) return x;
        const conflict = x.local === 'green' && server !== 'accepted';
        return { ...x, synced: true, conflict };
      });
      setHistory(h);
      save(LS.history, h);
      const rest = load(LS.queue, []).filter((s) => !byId[s.client_scan_id]);
      setQueue(rest);
      save(LS.queue, rest);
      setSyncInfo(`Sincronizado às ${time(new Date().toISOString())}`);
    } catch {}
  }, []);

  useEffect(() => {
    downloadList();
    const a = setInterval(sync, 5000);
    const b = setInterval(downloadList, 60000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [downloadList, sync]);

  const handle = useCallback(async (raw) => {
    if (busy.current) return;
    busy.current = true;
    const token = String(raw).trim();
    const scannedAt = new Date().toISOString();
    let r = { color: 'red', title: 'QR inválido', detail: 'Este código não é um ingresso deste sistema.' };
    let code = null;
    try {
      const parts = token.split('.');
      if (parts.length === 4 && parts[0] === 'v1') {
        const ok = await ed.verifyAsync(b64u(parts[3]), new TextEncoder().encode(parts.slice(0, 3).join('.')), b64u(publicKey));
        if (ok) {
          code = parts[1];
          const issued = parseInt(parts[2], 36);
          const used = load(LS.used, {});
          const entry = list?.tickets?.[code];
          if (used[code]) {
            r = { color: 'yellow', title: 'Já entrou', detail: `Lido neste aparelho às ${time(used[code])}.` };
          } else if (entry && entry.u) {
            r = { color: 'yellow', title: 'Já entrou', detail: 'Registrado em outra porta.' };
          } else if (entry) {
            r = { color: 'green', title: 'Liberado', detail: `${entry.n || 'Titular a definir'} · ${VARIANT_LABEL[entry.v] || ''}` };
          } else if (!list || issued > list.generated_at) {
            r = { color: 'green', title: 'Liberado', detail: 'Ingresso emitido depois da última lista (assinatura válida).' };
          } else {
            r = { color: 'red', title: 'Não consta', detail: 'Ingresso transferido, cancelado ou estornado.' };
          }
          if (r.color === 'green') { used[code] = scannedAt; save(LS.used, used); }
        }
      }
    } catch {
      r = { color: 'red', title: 'QR inválido', detail: 'Não foi possível ler o código.' };
    }

    const scanId = uuid();
    if (code) {
      const q = [...load(LS.queue, []), { client_scan_id: scanId, code, scanned_at: scannedAt }];
      save(LS.queue, q);
      setQueue(q);
    }
    const h = [{ id: scanId, at: scannedAt, local: r.color, title: r.title, detail: r.detail, synced: !code }, ...load(LS.history, [])].slice(0, 30);
    save(LS.history, h);
    setHistory(h);
    setResult(r);
    if (navigator.vibrate) navigator.vibrate(r.color === 'green' ? 80 : [60, 60, 60]);
    setTimeout(() => { setResult(null); busy.current = false; }, 2200);
    sync();
  }, [list, publicKey, sync]);

  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Câmera + leitura de QR
  useEffect(() => {
    if (!camera) return;
    let stream; let raf; let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = videoRef.current;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        await v.play();
        const c = canvasRef.current;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const loop = () => {
          if (stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && !busy.current) {
            const w = 480; const hgt = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
            c.width = w; c.height = hgt;
            ctx.drawImage(v, 0, 0, w, hgt);
            const img = ctx.getImageData(0, 0, w, hgt);
            const found = jsQR(img.data, w, hgt, { inversionAttempts: 'dontInvert' });
            if (found?.data) {
              const now = Date.now();
              if (found.data !== lastScan.current.data || now - lastScan.current.at > 4000) {
                lastScan.current = { data: found.data, at: now };
                handleRef.current(found.data);
              }
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setCamError('Não foi possível abrir a câmera. Libere a permissão ou use o campo abaixo.');
        setCamera(false);
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera]);

  return (
    <main className="shell">
      <Brand href={canPanel ? '/painel' : '/portaria'} right={
        <span className={`chip ${online ? 'chip-accent' : ''}`}><span className="dot" style={online ? {} : { background: 'var(--warn)', boxShadow: 'none' }} />{online ? 'Online' : 'Offline'}</span>
      } />

      <p className="display" style={{ fontSize: 40 }}>Portaria</p>
      <p className="muted small mt-8">
        {list ? `${list.event.name} · ${list.count} ingressos na lista` : 'Baixando lista de ingressos…'}
        {' · '}{queue.length ? `${queue.length} leitura(s) para sincronizar` : syncInfo || 'tudo sincronizado'}
      </p>

      {result ? (
        <div className={`gate-result ${result.color} mt-16`}>
          <p className="display">{result.title}</p>
          <p style={{ fontWeight: 700, marginTop: 8 }}>{result.detail}</p>
        </div>
      ) : (
        <div className="video-box mt-16">
          {camera ? (
            <>
              <video ref={videoRef} muted playsInline />
              <div className="frame" />
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
              <div>
                <button className="btn btn-accent" onClick={() => { setCamError(''); setCamera(true); }}>Abrir câmera</button>
                {camError && <p className="error mt-16">{camError}</p>}
              </div>
            </div>
          )}
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {camera && !result && (
        <button className="btn btn-ghost btn-block mt-8" onClick={() => setCamera(false)}>Fechar câmera</button>
      )}

      <form className="input-row mt-16" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handle(manual); setManual(''); } }}>
        <input className="input" placeholder="Colar código do QR (teste no computador)" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn btn-ghost">Validar</button>
      </form>

      <h2 className="section-title">Últimas leituras</h2>
      <div className="card">
        {history.length === 0 && <p className="muted small">Nenhuma leitura ainda.</p>}
        {history.slice(0, 12).map((h) => (
          <div key={h.id} className="summary-line" style={{ alignItems: 'center' }}>
            <span>
              <b style={{ color: h.local === 'green' ? 'var(--ok-text)' : h.local === 'yellow' ? 'var(--warn-text)' : 'var(--danger-text)' }}>{h.title}</b>
              <span className="tiny muted"> · {h.detail}</span>
              {h.conflict && <span className="tiny error"> · servidor apontou duplicidade</span>}
            </span>
            <span className="tiny muted">{time(h.at)}<span className={`sync-mark ${h.synced ? 'done' : ''}`}><Icon name={h.synced ? 'synced' : 'pending'} size={14} label={h.synced ? 'Sincronizado' : 'Aguardando envio'} /></span></span>
          </div>
        ))}
      </div>

      <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={downloadList}>Atualizar lista</button>
        {canPanel && <Link className="btn btn-ghost btn-sm" href="/painel">Painel</Link>}
        <form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm"><Icon name="logout" size={16} />Sair</button></form>
      </div>
      {queue.length > 0 && <p className="tiny muted mt-8">Leituras na fila ficam guardadas neste aparelho e são enviadas no próximo login.</p>}
      {me && <p className="tiny muted mt-8">Leitor: <b>{me.name}</b> · {ROLE_LABEL[me.role]}</p>}
      <p className="footer-note">Aparelho {deviceId.current || ''} · funciona sem internet depois de aberto uma vez</p>
    </main>
  );
}
