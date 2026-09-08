import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from './request.js';
/* ============================================================
   Общий компонент редактирования сообщения бота.

   Аппу достаточно передать код константы — остальное компонент
   берёт сам: название из справочника, текст, файл (если есть).

   Использование:
     // со своей кнопкой «Сохранить»
     <MessageEditor code="ROULETTE_WINNERS_LIST" showToast={showToast} />

     // как поле внутри общей формы (сохраняет апп)
     <MessageEditor code="BONUS_PROGRESS_TEXT" showToast={showToast}
       value={form.BONUS_PROGRESS_TEXT}
       onChange={(v) => set('BONUS_PROGRESS_TEXT', v)} />

   API (/api/message_image):
     GET    /                      -> {success, data:[{name, description}]}  справочник
     GET    /text/{КОД}            -> {success, data:"текст"}
     GET    /format/{КОД}          -> {success, data:".mp4"} либо data:null
     GET    /image|animation|graphics|video/{КОД}  -> сам файл байтами
     PATCH  /image/{КОД}           <- {text:"..."}   обновление текста
     POST   /image/{КОД}           <- multipart, поле file
     DELETE /image/{КОД}                            удаление файла

   Загрузка и удаление файла идут через /image/ для ЛЮБОГО формата —
   проверено вживую на mp4. Читается файл по адресу, зависящему от формата.
   ============================================================ */

const API = '/api/message_image';

// Форматы, которые принимает бэк (подтверждено бэкендом).
const ALLOWED = ['.jpg', '.jpeg', '.png', '.gif', '.mp4'];

/* Ограничение размера файла.
   На dev nginx отдаёт 413 примерно на 1 МБ (561 КБ проходит, 1.09 МБ нет),
   на проде лимит больше. Проверяем на фронте, чтобы админ видел понятное
   сообщение вместо HTML-страницы ошибки от nginx.
   Точное значение уточняется у бэкенда — менять здесь. */
const MAX_FILE_BYTES = 1024 * 1024;

// Формат файла -> часть адреса, по которой он отдаётся.
const PATH_BY_FORMAT = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'graphics', '.gif': 'animation', '.mp4': 'video',
};

const isVideo = (fmt) => fmt === '.mp4';

/* Справочник сообщений грузим один раз на всё приложение:
   компонентов на странице может быть много, а список общий. */
let dictPromise = null;
function loadDictionary() {
  if (!dictPromise) {
    dictPromise = request(API)
      .then((r) => (Array.isArray(r?.data) ? r.data : []))
      .catch(() => []); // без справочника просто покажем код
  }
  return dictPromise;
}

export default function MessageEditor({
  code,
  title,           // если не передать — возьмётся из справочника
  hint,            // подсказка про плейсхолдеры (в справочнике её нет)
  showToast,
  withFile = true, // показывать блок с изображением/видео
  value,           // управляемый режим: текст хранит апп
  onChange,        // управляемый режим: сообщить аппу об изменении
  onLoaded,        // вызовется с загруженным текстом
  onSaved,         // вызовется с сохранённым текстом (апп может следить за содержимым)
}) {
  const controlled = typeof onChange === 'function';

  const [dictTitle, setDictTitle] = useState('');
  const [text, setText] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);

  const [format, setFormat] = useState(null);   // '.mp4' | null
  const [fileUrl, setFileUrl] = useState(null); // blob-ссылка для превью
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const inputRef = useRef(null);

  const notify = useCallback((msg, type) => {
    if (showToast) showToast(msg, type);
  }, [showToast]);

  useEffect(() => { injectStyles(); }, []);

  // Название из справочника
  useEffect(() => {
    let alive = true;
    loadDictionary().then((list) => {
      if (!alive) return;
      const found = list.find((m) => m.name === code);
      if (found?.description) setDictTitle(found.description);
    });
    return () => { alive = false; };
  }, [code]);

  // Текст сообщения
  useEffect(() => {
    let alive = true;
    setLoading(true);
    request(`${API}/text/${encodeURIComponent(code)}`)
      .then((r) => {
        if (!alive) return;
        const v = r?.data ?? '';
        setText(v);
        setInitial(v);
        setMissing(false);
        onLoaded?.(v);
        if (controlled) onChange(v);
      })
      .catch(() => {
        if (!alive) return;
        setMissing(true);
        notify(`Не удалось загрузить сообщение ${code}`, 'error');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // onChange/onLoaded специально не в зависимостях: апп часто передаёт
    // новую функцию на каждый рендер, и текст перезагружался бы бесконечно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Формат файла и сам файл
  const loadFile = useCallback(async () => {
    if (!withFile) return;
    // Старую blob-ссылку освобождаем, иначе память течёт при переключениях.
    setFileUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    try {
      const r = await request(`${API}/format/${encodeURIComponent(code)}`);
      const fmt = r?.data || null;
      setFormat(fmt);
      if (!fmt) return;

      const path = PATH_BY_FORMAT[fmt.toLowerCase()] || 'image';
      // Файл нельзя подставить прямо в src: браузер не отправит заголовки
      // авторизации. Поэтому скачиваем и показываем через blob-ссылку.
      const res = await request(`${API}/${path}/${encodeURIComponent(code)}`, { raw: true });
      const blob = await res.blob();
      setFileUrl(URL.createObjectURL(blob));
    } catch {
      setFormat(null);
    }
  }, [code, withFile]);

  useEffect(() => { loadFile(); }, [loadFile]);

  // Освобождаем ссылку при уходе со страницы
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const current = controlled ? (value ?? '') : text;
  const dirty = current !== initial;

  const setValue = (v) => {
    if (controlled) onChange(v);
    else setText(v);
  };

  const save = async () => {
    if (!dirty) { notify('Изменений нет', 'info'); return; }
    setSaving(true);
    try {
      await request(`${API}/image/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: { text: current },
      });
      setInitial(current);
      onSaved?.(current);
      notify('Сообщение сохранено', 'success');
    } catch (e) {
      notify(e.message || 'Не удалось сохранить', 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickFile = () => inputRef.current?.click();

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // чтобы повторный выбор того же файла сработал
    if (!file) return;

    setFileError('');
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setFileError(`Допустимы только ${ALLOWED.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`Файл больше ${Math.round(MAX_FILE_BYTES / 1024 / 1024 * 10) / 10} МБ — уменьшите размер`);
      return;
    }

    setFileBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await request(`${API}/image/${encodeURIComponent(code)}`, { method: 'POST', body: fd });
      await loadFile();
      notify('Файл обновлён', 'success');
    } catch (err) {
      notify(err.message || 'Не удалось загрузить файл', 'error');
    } finally {
      setFileBusy(false);
    }
  };

  const removeFile = async () => {
    setFileBusy(true);
    try {
      await request(`${API}/image/${encodeURIComponent(code)}`, { method: 'DELETE' });
      await loadFile();
      notify('Файл удалён', 'success');
    } catch (err) {
      notify(err.message || 'Не удалось удалить файл', 'error');
    } finally {
      setFileBusy(false);
    }
  };

  const heading = title || dictTitle || code;

  if (loading) {
    return (
      <div className="msged">
        <div className="msged-title">{heading}</div>
        <div className="msged-skeleton" />
      </div>
    );
  }

  return (
    <div className="msged">
      <div className="msged-title">{heading}</div>

      <textarea
        className="msged-text"
        rows={6}
        value={current}
        disabled={missing}
        placeholder={missing ? '—' : ''}
        onChange={(e) => setValue(e.target.value)}
      />

      {missing ? (
        <span className="msged-hint msged-error">
          Сообщение {code} не найдено на бэкенде — редактирование недоступно
        </span>
      ) : hint ? (
        <span className="msged-hint">{hint}</span>
      ) : null}

      {withFile && !missing && (
        <div className="msged-file">
          <div className="msged-file-head">
            <span className="msged-file-label">
              <i className="fa-regular fa-image" /> Вложение
            </span>
            <span className="msged-file-state">
              {format ? format.replace('.', '').toUpperCase() : 'нет файла'}
            </span>
          </div>

          {fileUrl && (
            <div className="msged-preview">
              {isVideo(format)
                ? <video src={fileUrl} controls preload="metadata" />
                : <img src={fileUrl} alt="Вложение сообщения" />}
            </div>
          )}

          <div className="msged-file-actions">
            <button type="button" className="msged-btn" onClick={pickFile} disabled={fileBusy}>
              <i className={`fa-solid ${fileBusy ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
              {format ? ' Заменить' : ' Загрузить'}
            </button>
            {format && (
              <button type="button" className="msged-btn msged-btn-danger" onClick={removeFile} disabled={fileBusy}>
                <i className="fa-solid fa-trash" /> Удалить
              </button>
            )}
            <input
              ref={inputRef} type="file" hidden
              accept=".jpg,.jpeg,.png,.gif,.mp4"
              onChange={onFilePicked}
            />
          </div>

          {fileError && <span className="msged-hint msged-error">{fileError}</span>}
        </div>
      )}

      {!controlled && !missing && (
        <div className="msged-foot">
          <button type="button" className="msged-btn msged-btn-primary" onClick={save} disabled={saving || !dirty}>
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
            {saving ? ' Сохранение…' : ' Сохранить'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Стили: компонент самодостаточен и не зависит от CSS аппа ----
   Цвета берутся из переменных Telegram, поэтому тема следует за клиентом. */
const STYLE_ID = 'msged-styles';
const STYLES = `
.msged { display: flex; flex-direction: column; gap: 6px; }
.msged-title { font-size: 14px; font-weight: 700; color: var(--tg-theme-text-color, #1a1a1a); }
.msged-skeleton {
  height: 96px; border-radius: 8px;
  background: var(--tg-theme-secondary-bg-color, #f0f0f0);
  animation: msged-pulse 1.2s ease-in-out infinite;
}
@keyframes msged-pulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
.msged-text {
  width: 100%; resize: vertical; min-height: 96px; padding: 10px 12px;
  border: 1px solid var(--tg-theme-hint-color, #c8c8c8); border-radius: 8px;
  font-family: inherit; font-size: 14px; line-height: 1.5;
  color: var(--tg-theme-text-color, #1a1a1a);
  background: var(--tg-theme-bg-color, #fff);
}
.msged-text:focus { outline: none; border-color: var(--tg-theme-button-color, #2563eb); }
.msged-text:disabled { opacity: .55; cursor: not-allowed; }
.msged-hint { font-size: 12px; color: var(--tg-theme-hint-color, #8a8a8a); }
.msged-error { color: #dc2626; }

.msged-file {
  display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 12px;
  border: 1px solid var(--tg-theme-hint-color, #dcdcdc); border-radius: 8px;
}
.msged-file-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.msged-file-label { font-size: 13px; font-weight: 600; color: var(--tg-theme-text-color, #1a1a1a); }
.msged-file-state { font-size: 12px; color: var(--tg-theme-hint-color, #8a8a8a); }
.msged-preview { display: flex; justify-content: center; }
.msged-preview img, .msged-preview video {
  max-width: 100%; max-height: 260px; border-radius: 8px; display: block;
}
.msged-file-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.msged-btn {
  display: inline-flex; align-items: center; gap: 6px; justify-content: center;
  padding: 8px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--tg-theme-hint-color, #c8c8c8);
  background: var(--tg-theme-secondary-bg-color, #f4f4f5);
  color: var(--tg-theme-text-color, #1a1a1a);
  font-family: inherit; font-size: 13px; font-weight: 600;
}
.msged-btn:disabled { opacity: .5; cursor: default; }
.msged-btn-primary {
  background: var(--tg-theme-button-color, #2563eb);
  color: var(--tg-theme-button-text-color, #fff); border-color: transparent;
}
.msged-btn-danger { color: #dc2626; }
.msged-foot { display: flex; justify-content: flex-end; margin-top: 4px; }
`;

function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}
