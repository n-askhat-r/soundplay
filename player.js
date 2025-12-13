/* player.js — полный файл
   Функции:
   - Пароль (PIN 4 цифры) берётся из album.json: data.album.password
   - Запоминание доступа навсегда (localStorage)
   - Ограничение попыток + блокировка с таймером (локальная)
   - Аварийный сброс через URL: ?reset=1
   - Плейлист, клик по треку
   - Обложка = Play/Pause + overlay (треугольник скрывается/появляется)
   - Запоминание позиции и трека, восстановление при входе
*/

(function () {
  // ---------- CONFIG ----------
  const ALBUM_JSON_URL = 'album.json';

  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 10;

  // ---------- DOM ----------
  const audio = document.getElementById('audio-player');

  const nowPlayingTitle = document.getElementById('now-playing-title');
  const nowPlayingArtist = document.getElementById('now-playing-artist');
  const playlistEl = document.getElementById('playlist');

  const albumTitleEl = document.getElementById('album-title');
  const albumAuthorEl = document.getElementById('album-author');
  const albumDescEl = document.getElementById('album-description');
  const albumCoverEl = document.getElementById('album-cover');

  const coverPlay = document.getElementById('cover-play');
  const playOverlay = document.getElementById('play-overlay');

  if (!audio || !playlistEl) return;

  // ---------- STORAGE KEYS (per path) ----------
  const PATH_KEY = location.pathname; // /soundplay/...
  const AUTH_KEY = 'songbook_authed_' + PATH_KEY;
  const STATE_KEY = 'albumPlayerState_' + PATH_KEY;
  const ATTEMPTS_KEY = 'songbook_attempts_' + PATH_KEY;
  const LOCK_UNTIL_KEY = 'songbook_lockuntil_' + PATH_KEY;

  // ---------- RESET via ?reset=1 ----------
  (function maybeReset() {
    try {
      const qs = new URLSearchParams(location.search);
      if (qs.get('reset') === '1') {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(ATTEMPTS_KEY);
        localStorage.removeItem(LOCK_UNTIL_KEY);
        localStorage.removeItem(STATE_KEY);

        qs.delete('reset');
        const newUrl = location.pathname + (qs.toString() ? '?' + qs.toString() : '');
        history.replaceState(null, '', newUrl);
      }
    } catch (e) {}
  })();

  // ---------- STATE ----------
  let REQUIRED_PASSWORD = null; // из album.json (строка из 4 цифр)
  let playlistItems = [];
  let currentIndex = 0;

  // throttle save
  let lastSaveTs = 0;

  // ---------- HELPERS ----------
  const nowMs = () => Date.now();

  function safePlay() {
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function setOverlayVisible(show) {
    if (!playOverlay) return;
    playOverlay.classList.toggle('hidden', !show);
  }

  function setActive(index) {
    playlistItems.forEach((li, i) => li.classList.toggle('active', i === index));
  }

  function savePlayerState(force = false) {
    if (!playlistItems.length) return;

    const ts = nowMs();
    if (!force && ts - lastSaveTs < 1200) return;
    lastSaveTs = ts;

    const state = {
      index: currentIndex,
      time: (typeof audio.currentTime === 'number' && isFinite(audio.currentTime)) ? audio.currentTime : 0
    };

    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadPlayerState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const st = JSON.parse(raw);
      if (!st || typeof st.index !== 'number') return null;
      return st;
    } catch (e) {
      return null;
    }
  }

  function buildTrackItem(track, index) {
    const li = document.createElement('li');
    li.dataset.src = track.src;
    li.dataset.artist = track.artist ? String(track.artist) : '';

    li.innerHTML = `
      <div class="track-row">
        <span class="track-number">${index + 1}</span>
        <span class="track-title">${track.title ? String(track.title) : ('Трек ' + (index + 1))}</span>
      </div>
      <div class="track-artist">${track.artist ? ('Исполнитель: ' + String(track.artist)) : ''}</div>
    `;

    li.addEventListener('click', () => loadTrack(index, true));
    return li;
  }

  function updateNowPlayingFromItem(li) {
    const titleEl = li.querySelector('.track-title');
    const title = titleEl ? titleEl.textContent.trim() : '—';
    const artist = li.dataset.artist || '';

    if (nowPlayingTitle) nowPlayingTitle.textContent = title;
    if (nowPlayingArtist) nowPlayingArtist.textContent = artist ? ('Орындаушы: ' + artist) : '';
  }

  function loadTrack(index, autoplay) {
    if (index < 0 || index >= playlistItems.length) return;

    currentIndex = index;
    const li = playlistItems[index];
    const src = li.dataset.src;

    if (!src) return;

    audio.src = src;
    updateNowPlayingFromItem(li);
    setActive(index);
    savePlayerState(true);

    if (autoplay) safePlay();
  }

  function restorePlaybackIfAny() {
    const saved = loadPlayerState();
    if (!saved) return false;

    let idx = saved.index;
    if (!isFinite(idx) || idx < 0 || idx >= playlistItems.length) idx = 0;

    loadTrack(idx, false);

    const seek = (typeof saved.time === 'number' && isFinite(saved.time) && saved.time > 0) ? saved.time : 0;

    if (seek > 0) {
      audio.addEventListener('loadedmetadata', () => {
        if (isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(seek, Math.max(audio.duration - 0.25, 0));
        } else {
          audio.currentTime = seek;
        }
        // autoplay attempt (может быть заблокирован браузером)
        safePlay();
      }, { once: true });
    } else {
      safePlay();
    }

    return true;
  }

  function applyAlbumMeta(album) {
    if (albumTitleEl) albumTitleEl.textContent = album.title ? String(album.title) : '';
    if (albumAuthorEl) albumAuthorEl.textContent = album.author ? String(album.author) : '';
    if (albumDescEl) albumDescEl.textContent = album.description ? String(album.description) : '';
    if (album && album.title) document.title = String(album.title);

    if (albumCoverEl) {
      if (album.cover) {
        albumCoverEl.src = String(album.cover);
        albumCoverEl.style.display = 'block';
      } else {
        albumCoverEl.style.display = 'none';
      }
    }

    setOverlayVisible(audio.paused);
  }

  // ---------- PASSWORD GATE ----------
  function getAttempts() {
    const n = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10);
    return Number.isFinite(n) ? n : 0;
  }
  function setAttempts(n) {
    localStorage.setItem(ATTEMPTS_KEY, String(n));
  }
  function getLockUntil() {
    const t = parseInt(localStorage.getItem(LOCK_UNTIL_KEY) || '0', 10);
    return Number.isFinite(t) ? t : 0;
  }
  function setLockUntil(ts) {
    localStorage.setItem(LOCK_UNTIL_KEY, String(ts));
  }
  function clearAttemptsAndLock() {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCK_UNTIL_KEY);
  }

  function formatRemaining(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m <= 0) return `${s} сек`;
    return `${m} мин ${s} сек`;
  }

  // Показывает gate и вызывает onSuccess после правильного PIN
  function ensureAuth(onSuccess) {
    // если пароль не задан — доступа не требуем
    if (!REQUIRED_PASSWORD) {
      onSuccess();
      return;
    }

    // уже авторизован
    if (localStorage.getItem(AUTH_KEY) === '1') {
      onSuccess();
      return;
    }

    // создаём оверлей
    const gate = document.createElement('div');
    gate.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.65); padding: 16px;
    `;

    gate.innerHTML = `
      <div style="
        width: 100%; max-width: 420px;
        background: #fff; border-radius: 14px;
        padding: 16px; box-sizing: border-box;
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      ">
        <div style="font-weight:700; font-size:18px; margin-bottom:8px;">Құпия сөзге кіру</div>
        <div style="color:#555; font-size:14px; margin-bottom:12px;">
          Кітаптан 4 таңбалы кодты енгізіңіз
        </div>

        <input
          id="gate-pass"
          type="password"
          inputmode="numeric"
          pattern="[0-9]{4}"
          maxlength="4"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          placeholder="••••"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 12px;
            border: 1px solid #ccc;
            border-radius: 10px;
            font-size: 20px;
            text-align: center;
            letter-spacing: 10px;
          "
        >

        <div id="gate-msg" style="margin-top:8px; font-size:13px; color:#555;"></div>

        <div id="gate-err" style="display:none; color:#b00020; font-size:13px; margin-top:6px;">
          Қате құпия сөз
        </div>

        <button
          id="gate-btn"
          style="
            margin-top: 12px;
            width: 100%;
            padding: 12px;
            border: 0;
            border-radius: 10px;
            background: #2b6cff;
            color: #fff;
            font-weight: 600;
            font-size: 16px;
            cursor: pointer;
          "
        >Войти</button>

        <div style="margin-top:10px; font-size:12px; color:#777;">
          Кіру мүмкіндігі осы құрылғыда қалады.
        </div>
      </div>
    `;

    document.body.appendChild(gate);

    const input = gate.querySelector('#gate-pass');
    const btn = gate.querySelector('#gate-btn');
    const msg = gate.querySelector('#gate-msg');
    const err = gate.querySelector('#gate-err');

    let timer = null;

    function updateUI() {
      const attempts = getAttempts();
      const lockUntil = getLockUntil();

      if (lockUntil > nowMs()) {
        const left = lockUntil - nowMs();
        msg.textContent = `Тым көп әрекет жасалды. ${formatRemaining(left)} кейін қайталап көріңіз.`;
        msg.style.color = '#b00020';

        input.disabled = true;
        btn.disabled = true;
        input.style.opacity = '0.6';
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
        err.style.display = 'none';

        // запускаем таймер обновления, чтобы авто-разблокировалось без F5
        if (!timer) {
          timer = setInterval(() => {
            if (!document.body.contains(gate)) {
              clearInterval(timer);
              timer = null;
              return;
            }
            if (getLockUntil() <= nowMs()) {
              // разблокировалось
              clearInterval(timer);
              timer = null;
            }
            updateUI();
          }, 500);
        }

      } else {
        const left = Math.max(MAX_ATTEMPTS - attempts, 0);
        msg.textContent = `Қалған талпыныстар: ${left}`;
        msg.style.color = '#555';

        input.disabled = false;
        btn.disabled = false;
        input.style.opacity = '1';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    }

    function closeGateAndContinue() {
      if (timer) { clearInterval(timer); timer = null; }
      gate.remove();
      onSuccess();
    }

    function submit() {
      // если сейчас заблокировано — просто обновим UI
      if (getLockUntil() > nowMs()) {
        updateUI();
        return;
      }

      const val = (input.value || '').trim();

      // быстрый фильтр: только 4 цифры
      if (!/^\d{4}$/.test(val)) {
        err.textContent = '4 санды енгізіңіз';
        err.style.display = 'block';
        input.focus();
        input.select();
        return;
      }

      if (val === String(REQUIRED_PASSWORD)) {
        localStorage.setItem(AUTH_KEY, '1');
        clearAttemptsAndLock();
        closeGateAndContinue();
      } else {
        const attempts = getAttempts() + 1;
        setAttempts(attempts);

        err.textContent = 'Қате құпия сөз';
        err.style.display = 'block';

        if (attempts >= MAX_ATTEMPTS) {
          setLockUntil(nowMs() + LOCK_MINUTES * 60 * 1000);
        }

        input.focus();
        input.select();
        updateUI();
      }
    }

    // авто-отправка при вводе 4 цифр (удобно на Android)
    input.addEventListener('input', () => {
      // чистим всё кроме цифр
      const digitsOnly = (input.value || '').replace(/\D+/g, '').slice(0, 4);
      if (input.value !== digitsOnly) input.value = digitsOnly;

      // убираем сообщение ошибки при новом вводе
      err.style.display = 'none';

      if (digitsOnly.length === 4) {
        // небольшая задержка, чтобы Android успел обновить поле
        setTimeout(submit, 60);
      }
    });

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    // начальная отрисовка
    updateUI();

    // фокус
    setTimeout(() => input.focus(), 50);
  }

  // ---------- INIT AFTER AUTH ----------
  function initAfterAuth(album, tracks) {
    applyAlbumMeta(album);

    playlistEl.innerHTML = '';
    const safeTracks = Array.isArray(tracks) ? tracks : [];

    safeTracks.forEach((t, i) => {
      if (!t || !t.src) return;
      playlistEl.appendChild(buildTrackItem(t, i));
    });

    playlistItems = Array.from(playlistEl.querySelectorAll('li[data-src]'));

    if (!playlistItems.length) {
      if (nowPlayingTitle) nowPlayingTitle.textContent = 'Нет треков';
      if (nowPlayingArtist) nowPlayingArtist.textContent = '';
      setOverlayVisible(true);
      return;
    }

    // восстановление или старт с первого
    if (!restorePlaybackIfAny()) {
      loadTrack(0, true);
    }
  }

  // ---------- LOAD ALBUM.JSON ----------
  function loadAlbum() {
    fetch(ALBUM_JSON_URL, { cache: 'no-store' })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error('HTTP ' + res.status);
        try { return JSON.parse(text); }
        catch { throw new Error('album.json не JSON'); }
      })
      .then((data) => {
        const album = data && data.album ? data.album : {};
        const tracks = data && data.tracks ? data.tracks : [];

        // пароль из album.json
        // ожидаем строку из 4 цифр: "1234"
        REQUIRED_PASSWORD = album && album.password ? String(album.password).trim() : null;

        // Если пароль задан, но не 4 цифры — отключим gate (чтобы не заблокировать себя ошибкой)
        if (REQUIRED_PASSWORD && !/^\d{4}$/.test(REQUIRED_PASSWORD)) {
          REQUIRED_PASSWORD = null;
        }

        ensureAuth(() => initAfterAuth(album, tracks));
      })
      .catch((err) => {
        console.error(err);
        if (albumDescEl) albumDescEl.textContent = 'Альбом деректерін жүктеу қатесі.';
        if (nowPlayingTitle) nowPlayingTitle.textContent = 'Қате';
        if (nowPlayingArtist) nowPlayingArtist.textContent = '';
        setOverlayVisible(true);
      });
  }

  // ---------- EVENTS ----------
  audio.addEventListener('play', () => setOverlayVisible(false));
  audio.addEventListener('pause', () => {
    setOverlayVisible(true);
    savePlayerState(true);
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.paused) savePlayerState(false);
  });

  audio.addEventListener('ended', () => {
    const next = currentIndex + 1;
    if (next < playlistItems.length) {
      loadTrack(next, true);
    } else {
      // конец плейлиста
      savePlayerState(true);
      setOverlayVisible(true);
    }
  });

  window.addEventListener('beforeunload', () => savePlayerState(true));

  // обложка = play/pause (если есть)
  if (coverPlay) {
    coverPlay.addEventListener('click', () => {
      if (!playlistItems.length) return;
      if (audio.paused) safePlay();
      else audio.pause();
    });
  }

  // старт
  document.addEventListener('DOMContentLoaded', () => {
    setOverlayVisible(true);
    loadAlbum();
  });

})();
