(function () {
  // ===== Парольный экран (пароль из album.json) + лимит попыток + Android-friendly ввод =====
  const AUTH_KEY = 'songbook_authed_' + location.pathname;

  // Лимит попыток и блокировка
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 10;

  // Ключи для хранения попыток/блокировки (на этом устройстве)
  const ATTEMPTS_KEY = 'songbook_attempts_' + location.pathname;
  const LOCK_UNTIL_KEY = 'songbook_lockuntil_' + location.pathname;

  let REQUIRED_PASSWORD = null;

  function nowMs() { return Date.now(); }

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
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r} сек`;
    return `${m} мин ${r} сек`;
  }

  function showPasswordGate() {
    // если пароль не задан — пропускаем
    if (!REQUIRED_PASSWORD) return true;

    // если уже вводили пароль ранее — пропускаем
    if (localStorage.getItem(AUTH_KEY) === '1') return true;

    // проверяем блокировку
    const lockUntil = getLockUntil();
    const locked = lockUntil > nowMs();

    const gate = document.createElement('div');
    gate.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.65); padding: 16px;
    `;

    gate.innerHTML = `
      <div style="
        width: 100%; max-width: 420px; background: #fff; border-radius: 14px;
        padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
        font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      ">
        <div style="font-weight:700; font-size:18px; margin-bottom:8px;">Доступ по паролю</div>
        <div style="color:#555; font-size:14px; margin-bottom:12px;">
          Введите пароль, указанный рядом с QR-кодом в книге.
        </div>

        <input
          id="gate-pass"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          placeholder="Пароль"
          style="width:100%; padding:12px; border:1px solid #ccc; border-radius:10px; font-size:16px;"
        >

        <div id="gate-msg" style="margin-top:8px; font-size:13px; color:#555;"></div>

        <div id="gate-err" style="display:none; color:#b00020; font-size:13px; margin-top:8px;">
          Неверный пароль
        </div>

        <button id="gate-btn"
          style="margin-top:12px; width:100%; padding:12px; border:0; border-radius:10px;
          background:#2b6cff; color:#fff; font-weight:600; font-size:16px; cursor:pointer;">
          Войти
        </button>

        <div style="margin-top:10px; font-size:12px; color:#777;">
          Пароль сохраняется на этом устройстве.
        </div>
      </div>
    `;

    document.body.appendChild(gate);

    const input = gate.querySelector('#gate-pass');
    const btn = gate.querySelector('#gate-btn');
    const err = gate.querySelector('#gate-err');
    const msg = gate.querySelector('#gate-msg');

    function updateStatus() {
      const attempts = getAttempts();
      const lockUntil2 = getLockUntil();
      const locked2 = lockUntil2 > nowMs();

      if (locked2) {
        const remain = lockUntil2 - nowMs();
        msg.textContent = `Слишком много попыток. Повторите через ${formatRemaining(remain)}.`;
        msg.style.color = '#b00020';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        input.disabled = true;
        input.style.opacity = '0.6';
        err.style.display = 'none';
      } else {
        const left = Math.max(MAX_ATTEMPTS - attempts, 0);
        msg.textContent = `Осталось попыток: ${left}`;
        msg.style.color = '#555';
        btn.disabled = false;
        btn.style.opacity = '1';
        input.disabled = false;
        input.style.opacity = '1';
      }
    }

    function lockIfNeeded(attempts) {
      if (attempts >= MAX_ATTEMPTS) {
        const until = nowMs() + LOCK_MINUTES * 60 * 1000;
        setLockUntil(until);
      }
    }

    function submit() {
      // если заблокировано — просто обновим статус
      if (getLockUntil() > nowMs()) {
        updateStatus();
        return;
      }

      const val = (input.value || '').trim();

      if (val === REQUIRED_PASSWORD) {
        localStorage.setItem(AUTH_KEY, '1');
        clearAttemptsAndLock();
        gate.remove();
      } else {
        const attempts = getAttempts() + 1;
        setAttempts(attempts);
        lockIfNeeded(attempts);

        err.style.display = 'block';
        input.focus();
        input.select();
        updateStatus();
      }
    }

    // Первая отрисовка
    updateStatus();

    // Таймер, чтобы обновлять обратный отсчёт при блокировке
    let timer = null;
    function startTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (!document.body.contains(gate)) { clearInterval(timer); return; }
        updateStatus();
        if (getLockUntil() <= nowMs()) {
          clearInterval(timer);
          timer = null;
        }
      }, 500);
    }
    if (locked) startTimer();

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    input.focus();
    return false;
  }

  const audio = document.getElementById('audio-player');

  const nowPlayingTitle = document.getElementById('now-playing-title');
  const nowPlayingArtist = document.getElementById('now-playing-artist');
  const playlistEl = document.getElementById('playlist');

  const albumTitleEl = document.getElementById('album-title');
  const albumAuthorEl = document.getElementById('album-author');
  const albumDescEl = document.getElementById('album-description');
  const albumCoverEl = document.getElementById('album-cover');

  // Обложка как кнопка Play
  const coverPlay = document.getElementById('cover-play');
  const playOverlay = document.getElementById('play-overlay');

  // localStorage (отдельно для каждого альбома)
  const STORAGE_KEY = 'albumPlayerState_' + location.pathname;

  let playlistItems = [];
  let currentIndex = 0;

  /* ================= localStorage ================= */

  function saveState() {
    if (!playlistItems.length) return;

    const state = {
      index: currentIndex,
      src: playlistItems[currentIndex]?.dataset.src || '',
      time: isFinite(audio.currentTime) ? audio.currentTime : 0
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const st = JSON.parse(raw);
      if (typeof st.index !== 'number') return null;
      return st;
    } catch (e) {
      return null;
    }
  }

  /* ================= UI helpers ================= */

  function setActive(index) {
    playlistItems.forEach((item, i) =>
      item.classList.toggle('active', i === index)
    );
  }

  function updateNowPlaying(item) {
    const titleEl = item.querySelector('.track-title');
    const title = titleEl ? titleEl.textContent.trim() : '—';
    const artist = item.dataset.artist || '';

    nowPlayingTitle.textContent = title;
    nowPlayingArtist.textContent = artist ? 'Исполнитель: ' + artist : '';
  }

  function setOverlayVisible(show) {
    if (!playOverlay) return;
    playOverlay.classList.toggle('hidden', !show);
  }

  function safePlay() {
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  /* ================= Track control ================= */

  function loadTrack(index, autoplay) {
    if (index < 0 || index >= playlistItems.length) return;

    currentIndex = index;
    const item = playlistItems[index];
    const src = item.dataset.src;
    if (!src) return;

    audio.src = src;
    updateNowPlaying(item);
    setActive(index);
    saveState();

    if (autoplay) safePlay();
  }

  /* ================= Playlist ================= */

  function buildTrack(track, index) {
    const li = document.createElement('li');
    li.dataset.src = track.src;
    if (track.artist) li.dataset.artist = track.artist;

    li.innerHTML = `
      <div class="track-row">
        <span class="track-number">${index + 1}</span>
        <span class="track-title">${track.title || 'Трек ' + (index + 1)}</span>
      </div>
      <div class="track-artist">
        ${track.artist ? 'Исполнитель: ' + track.artist : ''}
      </div>
    `;
    return li;
  }

  function attachPlaylistHandlers() {
    playlistItems.forEach((item, index) => {
      item.addEventListener('click', () => loadTrack(index, true));
    });
  }

  /* ================= Album meta ================= */

  function applyAlbumMeta(album) {
    albumTitleEl.textContent = album.title || 'Альбом';
    albumAuthorEl.textContent = album.author || '—';
    albumDescEl.textContent = album.description || '';
    document.title = album.title || 'Альбом';

    if (album.cover) {
      albumCoverEl.src = album.cover;
      albumCoverEl.style.display = 'block';
    } else {
      albumCoverEl.style.display = 'none';
    }

    setOverlayVisible(audio.paused);
  }

  /* ================= Restore playback ================= */

  function restorePlayback(saved) {
    if (!saved) return false;

    let idx = saved.index;
    if (idx < 0 || idx >= playlistItems.length) idx = 0;

    loadTrack(idx, false);

    const seek = saved.time || 0;
    if (seek > 0) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (isFinite(audio.duration))
            audio.currentTime = Math.min(seek, audio.duration - 0.25);
        },
        { once: true }
      );
    }

    safePlay();
    return true;
  }

  /* ================= Audio events ================= */

  audio.addEventListener('play', () => setOverlayVisible(false));
  audio.addEventListener('pause', () => {
    saveState();
    setOverlayVisible(true);
  });

  audio.addEventListener('ended', () => {
    const next = currentIndex + 1;
    if (next < playlistItems.length) {
      loadTrack(next, true);
    } else {
      saveState();
      setOverlayVisible(true);
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.paused) saveState();
  });

  window.addEventListener('beforeunload', saveState);

  /* ================= Cover click ================= */

  if (coverPlay) {
    coverPlay.addEventListener('click', () => {
      if (!playlistItems.length) return;
      if (!audio.src) {
        loadTrack(0, true);
        return;
      }
      audio.paused ? safePlay() : audio.pause();
    });
  }

  /* ================= Load album.json ================= */

  function loadAlbum() {
    fetch('album.json', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        const album = data.album || {};
        const tracks = Array.isArray(data.tracks) ? data.tracks : [];

        REQUIRED_PASSWORD = album.password || null;

        if (!showPasswordGate()) return;
          
        applyAlbumMeta(album);

        playlistEl.innerHTML = '';
        tracks.forEach((t, i) => {
          if (t && t.src) playlistEl.appendChild(buildTrack(t, i));
        });

        playlistItems = Array.from(
          playlistEl.querySelectorAll('li[data-src]')
        );
        attachPlaylistHandlers();

        if (!playlistItems.length) return;

        const saved = loadSavedState();
        if (!restorePlayback(saved)) {
          loadTrack(0, true);
        }
      })
      .catch(err => {
        console.error(err);
        albumDescEl.textContent = 'Ошибка загрузки данных альбома.';
        setOverlayVisible(true);
      });
  }

  document.addEventListener('DOMContentLoaded', loadAlbum);
})();

/* Запрет правой кнопки */
document.addEventListener('contextmenu', e => {
  if (e.target.closest('.album-container')) {
    e.preventDefault();
  }
});
