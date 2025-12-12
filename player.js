(function () {
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
