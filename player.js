(function () {

  /* ================== DOM ================== */
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

  /* ================== STORAGE KEYS ================== */
  const AUTH_KEY = 'songbook_authed_' + location.pathname;
  const STATE_KEY = 'albumPlayerState_' + location.pathname;
  const ATTEMPTS_KEY = 'songbook_attempts_' + location.pathname;
  const LOCK_UNTIL_KEY = 'songbook_lockuntil_' + location.pathname;

  /* ================== PASSWORD CONFIG ================== */
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 10;
  let REQUIRED_PASSWORD = null;

  /* ================== PLAYER STATE ================== */
  let playlistItems = [];
  let currentIndex = 0;

  /* ================== HELPERS ================== */
  const now = () => Date.now();

  function safePlay() {
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
  }

  function setOverlayVisible(show) {
    if (!playOverlay) return;
    playOverlay.classList.toggle('hidden', !show);
  }

  /* ================== SAVE / RESTORE ================== */
  function saveState() {
    if (!playlistItems.length) return;
    localStorage.setItem(STATE_KEY, JSON.stringify({
      index: currentIndex,
      time: audio.currentTime || 0
    }));
  }

  function loadSavedState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY));
    } catch {
      return null;
    }
  }

  /* ================== PASSWORD GATE ================== */
  function showPasswordGate(onSuccess) {
    if (!REQUIRED_PASSWORD) return onSuccess();
    if (localStorage.getItem(AUTH_KEY) === '1') return onSuccess();

    const gate = document.createElement('div');
    gate.style.cssText = `
      position:fixed; inset:0; z-index:99999;
      display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.65); padding:16px;
    `;

    gate.innerHTML = `
      <div style="width:100%;max-width:420px;background:#fff;border-radius:14px;
        padding:16px;box-sizing:border-box;
        font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
        <div style="font-weight:700;font-size:18px;margin-bottom:8px">Доступ по паролю</div>
        <div style="font-size:14px;color:#555;margin-bottom:12px">
          Введите 4-значный код из книги
        </div>

        <input id="gate-pass" type="password"
          inputmode="numeric" pattern="[0-9]{4}" maxlength="4"
          autocomplete="off" autocapitalize="off" autocorrect="off"
          spellcheck="false" enterkeyhint="go"
          style="width:100%;box-sizing:border-box;
            padding:12px;border:1px solid #ccc;border-radius:10px;
            font-size:20px;text-align:center;letter-spacing:8px"
        >

        <div id="gate-msg" style="margin-top:8px;font-size:13px"></div>
        <div id="gate-err" style="display:none;color:#b00020;font-size:13px;margin-top:6px">
          Неверный пароль
        </div>

        <button id="gate-btn"
          style="margin-top:12px;width:100%;padding:12px;border:0;
          border-radius:10px;background:#2b6cff;color:#fff;
          font-weight:600;font-size:16px">
          Войти
        </button>
      </div>
    `;

    document.body.appendChild(gate);

    const input = gate.querySelector('#gate-pass');
    const btn = gate.querySelector('#gate-btn');
    const err = gate.querySelector('#gate-err');
    const msg = gate.querySelector('#gate-msg');

    function updateMsg() {
      const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10);
      const lockUntil = parseInt(localStorage.getItem(LOCK_UNTIL_KEY) || '0', 10);

      if (lockUntil > now()) {
        btn.disabled = true;
        input.disabled = true;
        msg.textContent = 'Повторите позже';
        msg.style.color = '#b00020';
      } else {
        btn.disabled = false;
        input.disabled = false;
        msg.textContent = `Осталось попыток: ${MAX_ATTEMPTS - attempts}`;
        msg.style.color = '#555';
      }
    }

    function submit() {
      const lockUntil = parseInt(localStorage.getItem(LOCK_UNTIL_KEY) || '0', 10);
      if (lockUntil > now()) return updateMsg();

      if (input.value === REQUIRED_PASSWORD) {
        localStorage.setItem(AUTH_KEY, '1');
        localStorage.removeItem(ATTEMPTS_KEY);
        localStorage.removeItem(LOCK_UNTIL_KEY);
        gate.remove();
        onSuccess();
      } else {
        const attempts = (parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1);
        localStorage.setItem(ATTEMPTS_KEY, attempts);
        err.style.display = 'block';

        if (attempts >= MAX_ATTEMPTS) {
          localStorage.setItem(LOCK_UNTIL_KEY, now() + LOCK_MINUTES * 60 * 1000);
        }
        updateMsg();
        input.select();
      }
    }

    btn.onclick = submit;
    input.onkeydown = e => e.key === 'Enter' && submit();
    input.focus();
    updateMsg();
  }

  /* ================== PLAYER ================== */
  function setActive(index) {
    playlistItems.forEach((li, i) => li.classList.toggle('active', i === index));
  }

  function loadTrack(index, autoplay) {
    if (!playlistItems[index]) return;
    currentIndex = index;
    const li = playlistItems[index];

    audio.src = li.dataset.src;
    nowPlayingTitle.textContent = li.querySelector('.track-title').textContent;
    nowPlayingArtist.textContent = li.dataset.artist
      ? 'Исполнитель: ' + li.dataset.artist : '';

    setActive(index);
    saveState();
    if (autoplay) safePlay();
  }

  function buildPlaylist(tracks) {
    playlistEl.innerHTML = '';
    tracks.forEach((t, i) => {
      if (!t.src) return;
      const li = document.createElement('li');
      li.dataset.src = t.src;
      if (t.artist) li.dataset.artist = t.artist;
      li.innerHTML = `
        <div class="track-row">
          <span class="track-number">${i + 1}</span>
          <span class="track-title">${t.title}</span>
        </div>
        <div class="track-artist">${t.artist || ''}</div>`;
      li.onclick = () => loadTrack(i, true);
      playlistEl.appendChild(li);
    });
    playlistItems = [...playlistEl.querySelectorAll('li')];
  }

  function restorePlayback() {
    const saved = loadSavedState();
    if (!saved || !playlistItems[saved.index]) return false;

    loadTrack(saved.index, false);
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = Math.min(saved.time || 0, audio.duration || 0);
      safePlay();
    }, { once: true });
    return true;
  }

  /* ================== LOAD ALBUM ================== */
  function initAfterAuth(album, tracks) {
    albumTitleEl.textContent = album.title || '';
    albumAuthorEl.textContent = album.author || '';
    albumDescEl.textContent = album.description || '';
    document.title = album.title || '';

    if (album.cover) albumCoverEl.src = album.cover;

    buildPlaylist(tracks);

    if (!restorePlayback()) loadTrack(0, true);
  }

  function loadAlbum() {
    fetch('album.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        REQUIRED_PASSWORD = data.album?.password || null;
        showPasswordGate(() => initAfterAuth(data.album || {}, data.tracks || []));
      })
      .catch(() => {
        albumDescEl.textContent = 'Ошибка загрузки данных';
      });
  }

  /* ================== EVENTS ================== */
  audio.onplay = () => setOverlayVisible(false);
  audio.onpause = () => { setOverlayVisible(true); saveState(); };
  audio.onended = () => loadTrack(currentIndex + 1, true);

  coverPlay.onclick = () => audio.paused ? safePlay() : audio.pause();

  window.addEventListener('beforeunload', saveState);

  document.addEventListener('DOMContentLoaded', loadAlbum);

})();
