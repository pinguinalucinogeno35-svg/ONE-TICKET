'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const MAX_SIDE = 1600;
const GALLERY_MAX = 12;

// Reduz a foto no próprio aparelho (até 1600 px, JPEG) antes de enviar.
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    throw new Error('Use uma foto JPG, PNG ou WebP.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não consegui abrir essa imagem. Tente outra (JPG ou PNG).'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    return { mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function post(body) {
  const res = await fetch('/api/painel/imagens', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível enviar. Tente de novo.');
  return data;
}

export default function EventImages({ eventId, coverUrl, onCover, notify }) {
  const [gallery, setGallery] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [busy, setBusy] = useState(null); // 'cover' | 'gallery' | id
  const coverInput = useRef(null);
  const galleryInput = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/painel/imagens?evento=${eventId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d.images)) return;
        setGallery(d.images.filter((i) => i.kind === 'gallery'));
        const c = d.images.find((i) => i.kind === 'cover');
        setCoverId(c ? c.id : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [eventId]);

  async function sendCover(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('cover');
    try {
      const img = await shrink(file);
      const r = await post({ action: 'enviar', eventId, kind: 'cover', ...img });
      setCoverId(r.id);
      onCover(r.url);
      notify('Capa atualizada.');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function sendGallery(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = GALLERY_MAX - gallery.length;
    if (room <= 0) { notify(`A galeria aceita até ${GALLERY_MAX} fotos.`, true); return; }
    setBusy('gallery');
    let sent = 0;
    try {
      for (const file of files.slice(0, room)) {
        const img = await shrink(file);
        const r = await post({ action: 'enviar', eventId, kind: 'gallery', ...img });
        setGallery((g) => [...g, { id: r.id, kind: 'gallery' }]);
        sent += 1;
      }
      notify(sent === 1 ? 'Foto adicionada.' : `${sent} fotos adicionadas.`);
      if (files.length > room) notify(`Só cabiam mais ${room}. A galeria aceita até ${GALLERY_MAX} fotos.`, true);
    } catch (err) {
      notify(sent ? `${sent} enviada(s). ${err.message}` : err.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id, isCover = false) {
    setBusy(id);
    try {
      await post({ action: 'remover', id });
      if (isCover) { setCoverId(null); onCover(''); } else setGallery((g) => g.filter((i) => i.id !== id));
      notify(isCover ? 'Capa removida.' : 'Foto removida.');
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="event-images">
      <div className="field">
        <label>Imagem de capa</label>
        {coverUrl ? (
          <div className="image-slot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="Capa do evento" className="event-cover" />
            {coverId && (
              <button type="button" className="image-remove" aria-label="Remover capa" title="Remover capa"
                      disabled={!!busy} onClick={() => remove(coverId, true)}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="image-drop" disabled={!!busy} onClick={() => coverInput.current?.click()}>
            <Icon name="image" size={22} />
            <span>{busy === 'cover' ? 'Enviando…' : 'Enviar capa'}</span>
            <small className="tiny muted">Horizontal, 16:9 fica melhor (ex.: 1600 × 900)</small>
          </button>
        )}
        {coverUrl && (
          <button type="button" className="btn btn-ghost btn-sm mt-8" disabled={!!busy} onClick={() => coverInput.current?.click()}>
            <Icon name="image" size={16} /> {busy === 'cover' ? 'Enviando…' : 'Trocar capa'}
          </button>
        )}
        <input ref={coverInput} type="file" accept="image/*" hidden onChange={sendCover} />
      </div>

      <div className="field mt-16">
        <label>Fotos do evento <span className="muted">({gallery.length}/{GALLERY_MAX})</span></label>
        <div className="image-grid">
          {gallery.map((g) => (
            <div key={g.id} className="image-slot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/imagem/${g.id}`} alt="" loading="lazy" />
              <button type="button" className="image-remove" aria-label="Remover foto" title="Remover foto"
                      disabled={!!busy} onClick={() => remove(g.id)}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {gallery.length < GALLERY_MAX && (
            <button type="button" className="image-drop image-add" disabled={!!busy} onClick={() => galleryInput.current?.click()}>
              <Icon name="plus" size={22} />
              <span>{busy === 'gallery' ? 'Enviando…' : 'Adicionar fotos'}</span>
            </button>
          )}
        </div>
        <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={sendGallery} />
        <p className="tiny muted mt-8">As fotos são reduzidas no aparelho antes de enviar e aparecem na página do evento na hora.</p>
      </div>
    </div>
  );
}
